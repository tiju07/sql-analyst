"""Read schema metadata, sample values, and value-index candidates from a target database."""

import re
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import aiosqlite
import asyncpg

from app.sql.executor import jsonable
from app.sql.scope import scope_token

# Text columns with at most this many distinct values get indexed for literal lookup.
VALUE_INDEX_MAX_DISTINCT = 5000
# Longer average values are free text (comments), not lookup-worthy literals.
VALUE_INDEX_MAX_AVG_LEN = 30
SAMPLE_SIZE = 5

_TEXT_TYPES = re.compile(r"^(text|character|varchar|char|bpchar|nvarchar|clob|string)", re.I)
_NUMERIC_TYPES = re.compile(
    r"^(numeric|decimal|real|double|float|money|integer|int|bigint|smallint)", re.I
)
_TEMPORAL_TYPES = re.compile(r"^(timestamp|date|time|datetime)", re.I)


@dataclass
class ColumnMeta:
    name: str
    data_type: str
    is_pk: bool = False
    fk_ref: str | None = None  # "schema.table.column" (or "table.column" without schemas)
    semantic_type: str | None = None
    sample_values: list[Any] = field(default_factory=list)
    distinct_values: list[str] | None = None  # set only for value-index candidates


@dataclass
class TableMeta:
    schema: str | None
    name: str
    row_count: int | None
    columns: list[ColumnMeta]

    @property
    def qualified(self) -> str:
        return f"{self.schema}.{self.name}" if self.schema else self.name


def infer_semantic_type(column: str, data_type: str) -> str | None:
    """Formatting hint for the UI. Heuristic by design; admins can override in the catalog."""
    n = column.lower()
    if _TEMPORAL_TYPES.match(data_type) or n.endswith(("_date", "_timestamp", "_at")):
        return "date"
    if _NUMERIC_TYPES.match(data_type) or not data_type:
        if any(k in n for k in ("price", "freight", "payment_value", "revenue", "gmv", "aov")):
            return "currency_brl"
        if n.endswith(("_rate", "_pct", "_percent", "_share")):
            return "percent"
        if n.endswith(("_qty", "_count", "_installments")) or n in ("count", "orders", "n"):
            return "count"
    return None


# User-written free text: never a lookup literal, and a prompt-injection vector in prompts.
_FREE_TEXT_NAME = re.compile(r"comment|message|title|description|review_text|notes?$", re.I)


def _is_id_like(col: ColumnMeta) -> bool:
    return col.is_pk or col.fk_ref is not None or col.name.lower().endswith(("_id", "_prefix"))


def _q(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


Fetch = Callable[[str], Awaitable[Sequence[Sequence[Any]]]]


async def _sample(fetch: Fetch, table: TableMeta) -> None:
    src = ".".join(_q(p) for p in ([table.schema] if table.schema else []) + [table.name])
    for col in table.columns:
        c = _q(col.name)
        if _TEXT_TYPES.match(col.data_type) and not _is_id_like(col):
            rows = await fetch(
                f"SELECT {c}, count(*) FROM {src} WHERE {c} IS NOT NULL"
                f" GROUP BY {c} ORDER BY 2 DESC LIMIT {VALUE_INDEX_MAX_DISTINCT + 1}"
            )
            values = [str(r[0]) for r in rows]
            col.sample_values = values[:SAMPLE_SIZE]
            avg_len = sum(map(len, values)) / len(values) if values else 0
            if (
                len(values) <= VALUE_INDEX_MAX_DISTINCT
                and avg_len <= VALUE_INDEX_MAX_AVG_LEN
                and not _FREE_TEXT_NAME.search(col.name)
            ):
                col.distinct_values = values
        elif _NUMERIC_TYPES.match(col.data_type) or _TEMPORAL_TYPES.match(col.data_type):
            if _is_id_like(col):
                continue
            rows = await fetch(f"SELECT min({c}), max({c}) FROM {src}")
            col.sample_values = [jsonable(v) for v in rows[0]] if rows else []
        else:
            rows = await fetch(f"SELECT {c} FROM {src} WHERE {c} IS NOT NULL LIMIT 3")
            col.sample_values = [jsonable(r[0]) for r in rows]


_PG_COLUMNS = """
SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod), c.reltuples::bigint
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = $1 AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
  AND has_table_privilege(c.oid, 'SELECT')
ORDER BY c.relname, a.attnum
"""

_PG_KEYS = """
SELECT t.relname, con.contype::text, a.attname, fn.nspname, fr.relname, fa.attname
FROM pg_constraint con
JOIN pg_class t ON t.oid = con.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
CROSS JOIN LATERAL unnest(con.conkey, con.confkey) AS k(attnum, fattnum)
JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
LEFT JOIN pg_class fr ON fr.oid = con.confrelid
LEFT JOIN pg_namespace fn ON fn.oid = fr.relnamespace
LEFT JOIN pg_attribute fa ON fa.attrelid = con.confrelid AND fa.attnum = k.fattnum
WHERE n.nspname = $1 AND con.contype IN ('p', 'f')
"""


async def introspect_postgres(pool: asyncpg.Pool, schema: str, signing_key: str) -> list[TableMeta]:
    async with pool.acquire() as conn, conn.transaction(readonly=True):
        # Catalog sync is a system job: it samples with the explicit all-states scope.
        await conn.execute("SET LOCAL statement_timeout = 120000")
        await conn.execute(
            "SELECT set_config('app.allowed_states', $1, true)", scope_token(None, signing_key)
        )
        tables: dict[str, TableMeta] = {}
        for tname, cname, ctype, reltuples in await conn.fetch(_PG_COLUMNS, schema):
            t = tables.setdefault(tname, TableMeta(schema, tname, max(reltuples, 0) or None, []))
            t.columns.append(
                ColumnMeta(cname, ctype, semantic_type=infer_semantic_type(cname, ctype))
            )
        for tname, kind, cname, fschema, ftable, fcol in await conn.fetch(_PG_KEYS, schema):
            if tname not in tables:
                continue
            col = next(c for c in tables[tname].columns if c.name == cname)
            if kind == "p":
                col.is_pk = True
            else:
                col.fk_ref = f"{fschema}.{ftable}.{fcol}"

        async def fetch(sql: str) -> list[tuple[Any, ...]]:
            return [tuple(r) for r in await conn.fetch(sql)]

        for table in tables.values():
            await _sample(fetch, table)
    return list(tables.values())


async def introspect_sqlite(path: Path) -> list[TableMeta]:
    async with aiosqlite.connect(f"file:{path}?mode=ro", uri=True) as db:

        async def fetch(sql: str) -> list[Any]:
            async with db.execute(sql) as cur:
                return list(await cur.fetchall())

        names = [
            r[0]
            for r in await fetch(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
                " AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
        ]
        tables: list[TableMeta] = []
        for name in names:
            info = await fetch(f"PRAGMA table_info({_q(name)})")
            fks = {
                r[3]: f"{r[2]}.{r[4]}" for r in await fetch(f"PRAGMA foreign_key_list({_q(name)})")
            }
            cols = [
                ColumnMeta(
                    r[1],
                    r[2] or "",
                    is_pk=bool(r[5]),
                    fk_ref=fks.get(r[1]),
                    semantic_type=infer_semantic_type(r[1], r[2] or ""),
                )
                for r in info
            ]
            count = (await fetch(f"SELECT count(*) FROM {_q(name)}"))[0][0]
            table = TableMeta(None, name, count, cols)
            await _sample(fetch, table)
            tables.append(table)
    return tables
