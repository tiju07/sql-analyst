"""Hybrid schema linking: pick the tables a question needs and render them as compact DDL.

Rankings from pgvector (tables, columns) and Postgres full-text search (tables, columns), plus
tables hit by literal-value matches, are fused with reciprocal rank fusion. FK paths between the
chosen tables are added so the model always sees how to join them.
"""

import json
import re
import uuid
from collections import deque
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CatalogColumn, CatalogTable

RRF_K = 60
TOP_TABLES = 6
MAX_EXTRA_JOIN_TABLES = 3
MAX_COLUMNS_PER_TABLE = 40
_WORD = re.compile(r"[A-Za-z]{3,}")
_TAGS = re.compile(r"</?\s*(schema|data|values|examples|history|metrics|notes)[^>]*>", re.I)


def rrf(rankings: list[list[str]], k: int = RRF_K) -> dict[str, float]:
    """Reciprocal rank fusion: score(d) = sum over rankings of 1 / (k + rank)."""
    scores: dict[str, float] = {}
    for ranking in rankings:
        for rank, item in enumerate(dict.fromkeys(ranking), start=1):
            scores[item] = scores.get(item, 0.0) + 1.0 / (k + rank)
    return scores


def join_paths(selected: list[str], edges: list[tuple[str, str]], max_hops: int = 3) -> list[str]:
    """Tables on shortest FK paths between selected tables (excluding the selected ones)."""
    graph: dict[str, set[str]] = {}
    for a, b in edges:
        graph.setdefault(a, set()).add(b)
        graph.setdefault(b, set()).add(a)
    extra: list[str] = []
    chosen = set(selected)
    for i, start in enumerate(selected):
        for goal in selected[i + 1 :]:
            if goal in graph.get(start, set()):
                continue
            prev: dict[str, str | None] = {start: None}
            queue = deque([(start, 0)])
            while queue:
                node, depth = queue.popleft()
                if node == goal or depth >= max_hops:
                    continue
                for nxt in graph.get(node, set()):
                    if nxt not in prev:
                        prev[nxt] = node
                        queue.append((nxt, depth + 1))
            if goal not in prev:
                continue
            step = prev[goal]
            while step is not None and step != start:
                if step not in chosen:
                    chosen.add(step)
                    extra.append(step)
                step = prev[step]
    return extra


def clean(text: str | None, limit: int = 300) -> str:
    """Catalog text is untrusted data: strip our delimiter tags and newlines, cap the length."""
    if not text:
        return ""
    return _TAGS.sub("", " ".join(text.split()))[:limit]


def _qualified(t: CatalogTable) -> str:
    return f"{t.schema}.{t.name}" if t.schema else t.name


def render_ddl(tables: list[CatalogTable], columns: dict[uuid.UUID, list[CatalogColumn]]) -> str:
    out: list[str] = []
    for t in tables:
        rows = f", ~{t.row_count:,} rows" if t.row_count else ""
        out.append(f"-- {_qualified(t)}{rows}: {clean(t.description)}")
        lines = []
        for c in columns.get(t.id, [])[:MAX_COLUMNS_PER_TABLE]:
            key = ""
            if c.is_pk:
                key = " PRIMARY KEY"
            elif c.fk_ref:
                ref_table, _, ref_col = c.fk_ref.rpartition(".")
                key = f" REFERENCES {ref_table}({ref_col})"
            samples = json.dumps((c.sample_values or [])[:4], ensure_ascii=False, default=str)
            note = clean(c.description, 160)
            hint = f" e.g. {clean(samples, 120)}" if c.sample_values else ""
            lines.append(f"  {c.name} {c.data_type}{key}, -- {note}{hint}".rstrip(" -,"))
        out.append(f"CREATE TABLE {_qualified(t)} (\n" + "\n".join(lines) + "\n);")
    return "\n".join(out)


@dataclass
class LinkedSchema:
    tables: list[str]  # qualified names, in relevance order
    all_tables: list[str]
    ddl: str


async def link_schema(
    session: AsyncSession,
    connection_id: uuid.UUID,
    question: str,
    question_vec: list[float] | None,
    *,
    boost_tables: Sequence[str] = (),  # tables hit by literal-value lookups
    full: bool = False,
) -> LinkedSchema:
    tables = list(
        await session.scalars(
            select(CatalogTable)
            .where(CatalogTable.connection_id == connection_id)
            .order_by(CatalogTable.name)
        )
    )
    by_id = {t.id: t for t in tables}
    cols = list(
        await session.scalars(
            select(CatalogColumn)
            .where(CatalogColumn.table_id.in_(by_id))
            .order_by(CatalogColumn.is_pk.desc(), CatalogColumn.name)
        )
    )
    columns: dict[uuid.UUID, list[CatalogColumn]] = {}
    for c in cols:
        columns.setdefault(c.table_id, []).append(c)
    name = {t.id: _qualified(t) for t in tables}
    all_names = [name[t.id] for t in tables]

    if full or len(tables) <= 1:
        return LinkedSchema(all_names, all_names, render_ddl(tables, columns))

    rankings: list[list[str]] = []
    if question_vec is not None:
        rankings.append(
            [
                name[i]
                for i in await session.scalars(
                    select(CatalogTable.id)
                    .where(CatalogTable.connection_id == connection_id)
                    .order_by(CatalogTable.embedding.cosine_distance(question_vec))
                    .limit(TOP_TABLES * 2)
                )
            ]
        )
        rankings.append(
            [
                name[i]
                for i in await session.scalars(
                    select(CatalogColumn.table_id)
                    .where(CatalogColumn.table_id.in_(by_id))
                    .order_by(CatalogColumn.embedding.cosine_distance(question_vec))
                    .limit(40)
                )
            ]
        )
    words = _WORD.findall(question)
    if words:
        tsq = func.to_tsquery("english", " | ".join(w.lower() for w in words))
        rankings.append(
            [
                name[i]
                for i in await session.scalars(
                    select(CatalogTable.id)
                    .where(CatalogTable.connection_id == connection_id)
                    .where(CatalogTable.search_tsv.op("@@")(tsq))
                    .order_by(func.ts_rank(CatalogTable.search_tsv, tsq).desc())
                    .limit(TOP_TABLES * 2)
                )
            ]
        )
        rankings.append(
            [
                name[i]
                for i in await session.scalars(
                    select(CatalogColumn.table_id)
                    .where(CatalogColumn.table_id.in_(by_id))
                    .where(CatalogColumn.search_tsv.op("@@")(tsq))
                    .order_by(func.ts_rank(CatalogColumn.search_tsv, tsq).desc())
                    .limit(40)
                )
            ]
        )
    if boost_tables:
        rankings.append(list(boost_tables))

    scores = rrf(rankings)
    selected = sorted(scores, key=lambda n: -scores[n])[:TOP_TABLES] or all_names[:TOP_TABLES]
    edges = [(name[c.table_id], c.fk_ref.rpartition(".")[0]) for c in cols if c.fk_ref is not None]
    selected += join_paths(selected, edges)[:MAX_EXTRA_JOIN_TABLES]
    keep = [t for t in tables if name[t.id] in selected]
    keep.sort(key=lambda t: selected.index(name[t.id]))
    return LinkedSchema([name[t.id] for t in keep], all_names, render_ddl(keep, columns))
