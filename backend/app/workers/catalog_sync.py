"""Catalog sync: introspect -> upsert catalog -> value index -> LLM descriptions -> embeddings.

Human-written descriptions are never overwritten. LLM descriptions are drafted once (only where
missing), so re-syncing is cheap; embeddings are recomputed every time because they're local.
"""

import asyncio
import json
import uuid
from dataclasses import dataclass
from pathlib import Path

import structlog
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.llm.client import LLMClient, LLMError, Usage
from app.llm.fake_client import responder
from app.models import CatalogColumn, CatalogTable, CatalogValue, Connection, DescriptionSource
from app.runtime import Runtime
from app.semantic.loader import get_layer, sync_metrics
from app.sql.introspect import TableMeta, introspect_postgres

log = structlog.get_logger()

_PROMPT = (Path(__file__).parents[1] / "llm" / "prompts" / "describe_table.md").read_text()


class ColumnDescription(BaseModel):
    name: str
    description: str = Field(max_length=400)


class TableDescription(BaseModel):
    description: str = Field(max_length=600)
    columns: list[ColumnDescription]


@responder(TableDescription)
def _fake_description(system: str, context: str | None, prompt: str) -> TableDescription:
    table = prompt.split("Table: ", 1)[1].split("\n", 1)[0]
    cols = [line.split()[1] for line in prompt.splitlines() if line.startswith("- column ")]
    return TableDescription(
        description=f"Rows of {table}.",
        columns=[ColumnDescription(name=c, description=f"The {c} field.") for c in cols],
    )


@dataclass
class SyncReport:
    tables: int
    columns: int
    values: int
    described_tables: int
    described_columns: int
    usage: Usage


def table_prompt(meta: TableMeta) -> str:
    lines = [f"Table: {meta.qualified}", f"Approximate rows: {meta.row_count}", "Columns:"]
    for c in meta.columns:
        key = " PRIMARY KEY" if c.is_pk else f" REFERENCES {c.fk_ref}" if c.fk_ref else ""
        samples = json.dumps(c.sample_values, ensure_ascii=False)[:300]
        lines.append(f"- column {c.name} {c.data_type}{key}\n  samples: <data>{samples}</data>")
    return "\n".join(lines)


async def _describe(
    llm: LLMClient, model: str, meta: TableMeta, sem: asyncio.Semaphore
) -> tuple[TableDescription | None, Usage]:
    async with sem:
        try:
            result = await llm.structured(
                model=model,
                system=_PROMPT,
                context=None,
                prompt=table_prompt(meta),
                schema=TableDescription,
                max_tokens=4000,
                effort="low",
            )
        except LLMError as e:
            # Descriptions are an enhancement; the catalog stays usable without them.
            log.warning("catalog.describe_failed", table=meta.qualified, error=str(e))
            return None, Usage()
    return result.value, result.usage


async def _upsert(
    session: AsyncSession, connection_id: uuid.UUID, metas: list[TableMeta]
) -> dict[str, CatalogTable]:
    existing = {
        (t.schema, t.name): t
        for t in await session.scalars(
            select(CatalogTable).where(CatalogTable.connection_id == connection_id)
        )
    }
    keep: dict[str, CatalogTable] = {}
    for meta in metas:
        table = existing.pop((meta.schema or "", meta.name), None)
        if table is None:
            table = CatalogTable(
                connection_id=connection_id, schema=meta.schema or "", name=meta.name
            )
            session.add(table)
        table.row_count = meta.row_count
        if meta.description and table.description is None:
            table.description, table.description_source = meta.description, DescriptionSource.human
        keep[meta.qualified] = table
    for stale in existing.values():
        await session.delete(stale)
    await session.flush()

    for meta in metas:
        table = keep[meta.qualified]
        cols = {
            c.name: c
            for c in await session.scalars(
                select(CatalogColumn).where(CatalogColumn.table_id == table.id)
            )
        }
        for cm in meta.columns:
            col = cols.pop(cm.name, None)
            if col is None:
                col = CatalogColumn(table_id=table.id, name=cm.name)
                session.add(col)
            col.data_type = cm.data_type
            col.is_pk = cm.is_pk
            col.fk_ref = cm.fk_ref
            col.sample_values = cm.sample_values
            if col.semantic_type is None:  # keep admin overrides
                col.semantic_type = cm.semantic_type
            if cm.description and col.description is None:
                col.description, col.description_source = cm.description, DescriptionSource.human
        for stale_col in cols.values():
            await session.delete(stale_col)
    await session.flush()
    return keep


async def _rebuild_values(
    session: AsyncSession, tables: dict[str, CatalogTable], metas: list[TableMeta]
) -> int:
    count = 0
    for meta in metas:
        cols = {
            c.name: c
            for c in await session.scalars(
                select(CatalogColumn).where(CatalogColumn.table_id == tables[meta.qualified].id)
            )
        }
        for cm in meta.columns:
            col = cols[cm.name]
            await session.execute(delete(CatalogValue).where(CatalogValue.column_id == col.id))
            if cm.distinct_values:
                session.add_all(CatalogValue(column_id=col.id, value=v) for v in cm.distinct_values)
                count += len(cm.distinct_values)
    await session.flush()
    return count


def table_embedding_text(t: CatalogTable) -> str:
    return f"table {t.schema}.{t.name}: {t.description or ''}"


def column_embedding_text(t: CatalogTable, c: CatalogColumn) -> str:
    samples = ", ".join(str(v) for v in (c.sample_values or [])[:5])
    return f"column {t.name}.{c.name} ({c.data_type}): {c.description or ''} e.g. {samples}"


async def sync_catalog(
    rt: Runtime,
    connection_id: uuid.UUID,
    *,
    metas: list[TableMeta] | None = None,
    draft_descriptions: bool = True,
) -> SyncReport:
    """Sync the demo target DB (default) or pre-introspected tables (e.g. BIRD SQLite files)."""
    s = rt.settings
    async with rt.sessions() as session:
        conn = await session.get(Connection, connection_id)
        if conn is None:
            raise ValueError(f"connection {connection_id} not found")

        if metas is None:
            metas = await introspect_postgres(
                rt.target_pool, s.target_schema, s.rls_signing_secret.get_secret_value()
            )
        tables = await _upsert(session, connection_id, metas)
        n_values = await _rebuild_values(session, tables, metas)

        # Draft descriptions only where nothing exists yet (never touch human ones).
        cols_by_table = {
            q: list(
                await session.scalars(select(CatalogColumn).where(CatalogColumn.table_id == t.id))
            )
            for q, t in tables.items()
        }
        todo = [
            m
            for m in metas
            if draft_descriptions
            and (
                tables[m.qualified].description is None
                or any(c.description is None for c in cols_by_table[m.qualified])
            )
        ]
        sem = asyncio.Semaphore(4)
        results = await asyncio.gather(*(_describe(rt.llm, s.llm_model_fast, m, sem) for m in todo))
        usage = Usage()
        described_tables = described_cols = 0
        for meta, (draft, call_usage) in zip(todo, results, strict=True):
            usage += call_usage
            if draft is None:
                continue
            table = tables[meta.qualified]
            if table.description is None:
                table.description = draft.description
                table.description_source = DescriptionSource.llm
                described_tables += 1
            by_name = {d.name: d.description for d in draft.columns}
            for col in cols_by_table[meta.qualified]:
                if col.description is None and col.name in by_name:
                    col.description = by_name[col.name]
                    col.description_source = DescriptionSource.llm
                    described_cols += 1

        all_cols = [(tables[q], c) for q, cs in cols_by_table.items() for c in cs]
        table_list = list(tables.values())
        vectors = await rt.embedder.embed_documents(
            [table_embedding_text(t) for t in table_list]
            + [column_embedding_text(t, c) for t, c in all_cols]
        )
        for table, vec in zip(table_list, vectors, strict=False):
            table.embedding = vec
        for (_, col), vec in zip(all_cols, vectors[len(table_list) :], strict=True):
            col.embedding = vec

        await sync_metrics(session, connection_id, await get_layer(session, connection_id))
        await session.commit()

    report = SyncReport(
        tables=len(tables),
        columns=len(all_cols),
        values=n_values,
        described_tables=described_tables,
        described_columns=described_cols,
        usage=usage,
    )
    log.info(
        "catalog.synced",
        **{k: v for k, v in report.__dict__.items() if k != "usage"},
        cost_usd=round(report.usage.cost_usd, 4),
    )
    return report
