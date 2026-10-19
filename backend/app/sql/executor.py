"""Run guarded SQL. Postgres for the app (read-only txn, timeout, signed RLS scope); SQLite for
the BIRD benchmark (read-only file). Results are JSON-safe so they can be cached and streamed."""

import asyncio
import json
import math
import sqlite3
import time
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from datetime import time as dtime
from decimal import Decimal
from pathlib import Path
from typing import Any, Literal, Protocol

import aiosqlite
import asyncpg

from app.sql.dialects import Dialect
from app.sql.scope import scope_token

ExecErrorCode = Literal["timeout", "db_error"]


class QueryError(Exception):
    def __init__(self, code: ExecErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class ResultColumn:
    name: str
    type: str  # database type name, e.g. "numeric", "timestamp", "text"


@dataclass
class QueryResult:
    columns: list[ResultColumn]
    rows: list[list[Any]]
    ms: int
    truncated: bool = False
    row_count: int = field(init=False)

    def __post_init__(self) -> None:
        self.row_count = len(self.rows)


def jsonable(value: Any) -> Any:
    """DB value -> JSON value. Decimals become floats: results are for display, not accounting."""
    match value:
        case None | bool() | int() | str():
            return value
        case float():
            return value if math.isfinite(value) else None
        case Decimal():
            return float(value) if value.is_finite() else None
        case datetime() | date() | dtime():
            return value.isoformat()
        case timedelta():
            return value.total_seconds()
        case uuid.UUID():
            return str(value)
        case bytes() | memoryview():
            return bytes(value).hex()
        case list() | tuple():
            return [jsonable(v) for v in value]
        case dict():
            return {str(k): jsonable(v) for k, v in value.items()}
        case _:
            return str(value)


class Executor(Protocol):
    dialect: Dialect

    async def execute(
        self, sql: str, *, allowed_states: list[str] | None, timeout_ms: int, row_limit: int
    ) -> QueryResult: ...

    async def explain_cost(self, sql: str, *, allowed_states: list[str] | None) -> float | None:
        """Planner's total cost estimate, or None if the dialect has no cheap equivalent."""
        ...


class PostgresExecutor:
    dialect = Dialect.postgres

    def __init__(self, pool: asyncpg.Pool, signing_key: str) -> None:
        self._pool = pool
        self._key = signing_key

    async def _scoped(
        self,
        conn: asyncpg.pool.PoolConnectionProxy[asyncpg.Record],
        allowed_states: list[str] | None,
        timeout_ms: int,
    ) -> None:
        # SET LOCAL can't take bind parameters; timeout_ms is an int we control.
        await conn.execute(f"SET LOCAL statement_timeout = {int(timeout_ms)}")
        await conn.execute(
            "SELECT set_config('app.allowed_states', $1, true)",
            scope_token(allowed_states, self._key),
        )

    async def execute(
        self, sql: str, *, allowed_states: list[str] | None, timeout_ms: int, row_limit: int
    ) -> QueryResult:
        t0 = time.perf_counter()
        try:
            async with self._pool.acquire() as conn, conn.transaction(readonly=True):
                await self._scoped(conn, allowed_states, timeout_ms)
                stmt = await conn.prepare(sql)
                columns = [ResultColumn(a.name, a.type.name) for a in stmt.get_attributes()]
                # Cursor so a missing LIMIT can never pull a whole table into memory.
                records: list[asyncpg.Record] = []
                async for record in stmt.cursor(prefetch=min(row_limit + 1, 1000)):
                    records.append(record)
                    if len(records) > row_limit:
                        break
        except asyncpg.QueryCanceledError as e:
            raise QueryError("timeout", f"Query exceeded {timeout_ms} ms and was cancelled.") from e
        except asyncpg.PostgresError as e:
            raise QueryError("db_error", _pg_message(e)) from e
        truncated = len(records) > row_limit
        rows = [[jsonable(v) for v in r] for r in records[:row_limit]]
        return QueryResult(columns, rows, _ms(t0), truncated)

    async def explain_cost(self, sql: str, *, allowed_states: list[str] | None) -> float | None:
        try:
            async with self._pool.acquire() as conn, conn.transaction(readonly=True):
                await self._scoped(conn, allowed_states, 5_000)
                plan = await conn.fetchval(f"EXPLAIN (FORMAT JSON) {sql}")
        except asyncpg.PostgresError as e:
            raise QueryError("db_error", _pg_message(e)) from e
        return float(json.loads(plan)[0]["Plan"]["Total Cost"])


class SqliteExecutor:
    """Read-only SQLite (BIRD). No RLS: benchmark databases hold no scoped data."""

    dialect = Dialect.sqlite

    def __init__(self, path: Path) -> None:
        self._uri = f"file:{path}?mode=ro"

    async def execute(
        self, sql: str, *, allowed_states: list[str] | None, timeout_ms: int, row_limit: int
    ) -> QueryResult:
        t0 = time.perf_counter()
        async with aiosqlite.connect(self._uri, uri=True) as db:
            try:
                async with asyncio.timeout(timeout_ms / 1000):
                    cursor = await db.execute(sql)
                    records = list(await cursor.fetchmany(row_limit + 1))
            except TimeoutError as e:
                await db.interrupt()
                raise QueryError("timeout", f"Query exceeded {timeout_ms} ms.") from e
            except sqlite3.Error as e:
                raise QueryError("db_error", str(e)) from e
            names = [d[0] for d in cursor.description or []]
        rows = [[jsonable(v) for v in r] for r in records[:row_limit]]
        return QueryResult(
            [ResultColumn(n, _sqlite_type(rows, i)) for i, n in enumerate(names)],
            rows,
            _ms(t0),
            len(records) > row_limit,
        )

    async def explain_cost(self, sql: str, *, allowed_states: list[str] | None) -> float | None:
        return None


def _sqlite_type(rows: list[list[Any]], i: int) -> str:
    # SQLite is dynamically typed; report the first non-null value's type.
    for row in rows:
        v = row[i]
        if v is not None:
            return {bool: "boolean", int: "integer", float: "real"}.get(type(v), "text")
    return "text"


def _pg_message(e: asyncpg.PostgresError) -> str:
    # Exact DB error text is what makes repair work; keep hint/detail when Postgres gives one.
    parts = [str(e)]
    for extra in ("detail", "hint"):
        if value := getattr(e, extra, None):
            parts.append(f"{extra.upper()}: {value}")
    return "\n".join(parts)


def _ms(t0: float) -> int:
    return round((time.perf_counter() - t0) * 1000)
