"""The DB itself enforces read-only + state scope, independent of the SQL guard.

Every query here runs raw as analyst_ro: this is what happens if the guard has a bug.
"""

import asyncpg
import pytest

from app.sql.scope import scope_token
from tests.fixtures import SIGNING_KEY

pytestmark = pytest.mark.integration

SCOPED = ["customers", "orders", "order_items", "order_payments", "order_reviews"]
SP = scope_token(["SP"], SIGNING_KEY)
ALL = scope_token(None, SIGNING_KEY)


async def scoped_count(conn: asyncpg.Connection, table: str, scope: str | None) -> int:
    async with conn.transaction():
        if scope is not None:
            await conn.execute("SELECT set_config('app.allowed_states', $1, true)", scope)
        return int(await conn.fetchval(f"SELECT count(*) FROM olist.{table}"))


@pytest.mark.parametrize("table", SCOPED)
async def test_all_scope_sees_everything(ro: asyncpg.Connection, table: str) -> None:
    assert await scoped_count(ro, table, ALL) == 4


@pytest.mark.parametrize("table", SCOPED)
async def test_sp_scope_sees_only_sp(ro: asyncpg.Connection, table: str) -> None:
    assert await scoped_count(ro, table, SP) == 2


@pytest.mark.parametrize("table", SCOPED)
@pytest.mark.parametrize(
    "scope",
    [
        None,  # never set: fail closed
        "",
        "*",  # unsigned "all"
        "SP",
        "SP.",
        "*." + "0" * 64,  # forged signature
        scope_token(None, "wrong-key"),
        SP.replace("SP.", "RJ.", 1),  # valid signature, swapped states
    ],
)
async def test_missing_or_forged_scope_sees_nothing(
    ro: asyncpg.Connection, table: str, scope: str | None
) -> None:
    assert await scoped_count(ro, table, scope) == 0


async def test_joins_cannot_escape_scope(ro: asyncpg.Connection) -> None:
    async with ro.transaction():
        await ro.execute("SELECT set_config('app.allowed_states', $1, true)", SP)
        states = await ro.fetch(
            """
            SELECT DISTINCT c.customer_state
            FROM olist.order_items i
            LEFT JOIN olist.orders o USING (order_id)
            LEFT JOIN olist.customers c USING (customer_id)
            """
        )
        revenue = await ro.fetchval("SELECT sum(price) FROM olist.order_items")
    assert [r[0] for r in states] == ["SP"]
    assert revenue == 200


async def test_sql_cannot_widen_its_own_scope(ro: asyncpg.Connection) -> None:
    # The model's SQL calling set_config mid-transaction gains nothing without the key.
    async with ro.transaction():
        await ro.execute("SELECT set_config('app.allowed_states', $1, true)", SP)
        n = await ro.fetchval(
            "SELECT count(*) FROM olist.customers, set_config('app.allowed_states', '*', true)"
        )
    # 0 or 2 depending on when the planner evaluates the initplan; never all 4.
    assert n in (0, 2)


async def test_unscoped_tables_are_readable(ro: asyncpg.Connection) -> None:
    assert await ro.fetchval("SELECT count(*) FROM olist.sellers") == 1


@pytest.mark.parametrize(
    "sql",
    [
        "INSERT INTO olist.sellers VALUES ('s2','1','x','SP')",
        "UPDATE olist.customers SET customer_city = 'x'",
        "DELETE FROM olist.orders",
        "TRUNCATE olist.order_items",
        "DROP TABLE olist.order_reviews",
        "CREATE TABLE olist.evil (id int)",
        "CREATE TABLE public.evil (id int)",
        "CREATE TEMP TABLE evil (id int)",
        "ALTER TABLE olist.customers DISABLE ROW LEVEL SECURITY",
        "GRANT SELECT ON rls.config TO analyst_ro",
        "SELECT signing_key FROM rls.config",
        "SELECT rls.allowed_states()",
    ],
)
async def test_writes_ddl_and_secrets_rejected_even_with_read_write_txn(
    ro: asyncpg.Connection, sql: str
) -> None:
    # Turn off the role's read-only default first, to prove privileges alone also block it.
    await ro.execute("SET default_transaction_read_only = off")
    with pytest.raises((asyncpg.InsufficientPrivilegeError, asyncpg.ReadOnlySQLTransactionError)):
        await ro.execute(sql)


async def test_read_only_by_default(ro: asyncpg.Connection) -> None:
    assert await ro.fetchval("SHOW default_transaction_read_only") == "on"
    with pytest.raises(asyncpg.ReadOnlySQLTransactionError):
        await ro.execute("CREATE TEMP TABLE t (id int)")


async def test_role_has_no_bypass_and_owns_nothing(ro: asyncpg.Connection) -> None:
    role = await ro.fetchrow(
        "SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles"
        " WHERE rolname = 'analyst_ro'"
    )
    assert role is not None
    assert not any(role.values())
    owned = await ro.fetchval(
        "SELECT count(*) FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner"
        " WHERE r.rolname = 'analyst_ro'"
    )
    assert owned == 0


async def test_role_statement_timeout_backstop(ro: asyncpg.Connection) -> None:
    assert await ro.fetchval("SHOW statement_timeout") == "30s"
