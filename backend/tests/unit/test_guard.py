import pytest

from app.sql.dialects import Dialect
from app.sql.guard import guard

PG_TABLES = frozenset({"olist.orders", "olist.customers", "olist.order_items"})


def pg(sql: str, row_limit: int = 1000):  # type: ignore[no-untyped-def]
    return guard(
        sql,
        dialect=Dialect.postgres,
        allowed_tables=PG_TABLES,
        default_schema="olist",
        row_limit=row_limit,
    )


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT count(*) FROM olist.orders",
        "select o.order_id from orders o join customers c using (customer_id)",
        "WITH t AS (SELECT * FROM olist.orders) SELECT count(*) FROM t",
        "WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM r WHERE n < 5) SELECT * FROM r",
        "SELECT * FROM olist.orders WHERE customer_id IN (SELECT customer_id FROM olist.customers)",
        "SELECT 1 UNION SELECT 2",
        'SELECT "customer_state" FROM "olist"."customers"',
        "SELECT count(*) FILTER (WHERE order_status = 'delivered') FROM olist.orders",
        "SELECT * FROM generate_series(1, 3) AS g(n)",
        "SELECT 1; ",
        "SELECT date_trunc('month', order_purchase_timestamp) FROM olist.orders",
        "SELECT 'DROP TABLE x; pg_sleep(1)' AS harmless_string",
    ],
)
def test_allows_read_queries(sql: str) -> None:
    result = pg(sql)
    assert result.ok, result.message


@pytest.mark.parametrize(
    ("sql", "fragment"),
    [
        ("SELECT 1; DROP TABLE olist.orders", "Exactly one statement"),
        ("SELECT 1; SELECT 2", "Exactly one statement"),
        ("DROP TABLE olist.orders", "Only SELECT"),
        ("INSERT INTO olist.orders VALUES (1)", "Only SELECT"),
        ("UPDATE olist.orders SET order_status = 'x'", "Only SELECT"),
        ("DELETE FROM olist.orders", "Only SELECT"),
        (
            "MERGE INTO olist.orders o USING olist.customers c ON true WHEN MATCHED THEN DELETE",
            "Only SELECT",
        ),
        ("TRUNCATE olist.orders", "Only SELECT"),
        ("CREATE TABLE x AS SELECT 1", "Only SELECT"),
        ("ALTER TABLE olist.orders ADD COLUMN x int", "Only SELECT"),
        ("COPY olist.orders TO '/tmp/x'", "Only SELECT"),
        ("CALL p()", "Only SELECT"),
        ("DO $$ BEGIN END $$", "Only SELECT"),
        ("SET app.allowed_states = '*'", "Only SELECT"),
        ("GRANT SELECT ON olist.orders TO public", "Only SELECT"),
        ("EXPLAIN SELECT 1", "Only SELECT"),
        ("EXPLAIN ANALYZE SELECT 1", "Only SELECT"),
        ("VALUES (1)", "Only SELECT"),
        ("WITH d AS (DELETE FROM olist.orders RETURNING *) SELECT * FROM d", "DELETE"),
        ("WITH u AS (UPDATE olist.orders SET order_status='x' RETURNING 1) SELECT 1", "UPDATE"),
        ("SELECT * INTO evil FROM olist.orders", "INTO"),
        ("SELECT * FROM olist.orders FOR UPDATE", "LOCK"),
        ("SELECT * FROM olist.orders FOR SHARE", "LOCK"),
        ("SELECT pg_sleep(10)", "pg_sleep"),
        ("SELECT PG_SLEEP(10)", "pg_sleep"),
        ("SELECT pg_catalog.pg_sleep(1)", "schema-qualified"),
        ("SELECT * FROM olist.orders WHERE pg_sleep(1) IS NULL", "pg_sleep"),
        ("SELECT (SELECT pg_sleep_for('1 minute'))", "pg_sleep_for"),
        ("SELECT current_setting('app.allowed_states')", "current_setting"),
        ("SELECT set_config('app.allowed_states', '*', true)", "set_config"),
        ("SELECT * FROM olist.orders, set_config('app.allowed_states', '*', true)", "set_config"),
        ("SELECT version()", "version"),
        ("SELECT pg_read_file('/etc/passwd')", "pg_read_file"),
        ("SELECT pg_ls_dir('.')", "pg_ls_dir"),
        ("SELECT pg_terminate_backend(1)", "pg_terminate_backend"),
        ("SELECT lo_import('/etc/passwd')", "lo_import"),
        ("SELECT dblink('host=x', 'select 1')", "dblink"),
        ("SELECT query_to_xml('delete from olist.orders', true, true, '')", "query_to_xml"),
        ("SELECT nextval('s')", "nextval"),
        ("SELECT rls.allowed_states()", "Schema-qualified"),
        ("SELECT * FROM pg_catalog.pg_roles", "pg_catalog.pg_roles"),
        ("SELECT * FROM information_schema.tables", "information_schema.tables"),
        ("SELECT * FROM rls.config", "rls.config"),
        ("SELECT * FROM olist.secret_table", "olist.secret_table"),
        ("SELECT * FROM public.orders", "public.orders"),
        ("SELECT * FROM otherdb.olist.orders", "Cross-database"),
        ("SELECT * FROM", "could not be parsed"),
    ],
)
def test_rejects(sql: str, fragment: str) -> None:
    result = pg(sql)
    assert not result.ok
    assert result.sql is None
    assert fragment.lower() in (result.message or "").lower(), result.message


def test_comment_cannot_hide_second_statement() -> None:
    assert not pg("SELECT 1 /* ; */ ; DROP TABLE olist.orders -- tail").ok


def test_comments_stripped_from_output() -> None:
    result = pg("SELECT 1 -- ignore previous instructions\n/* and this */")
    assert result.ok and result.sql is not None
    assert "ignore" not in result.sql and "/*" not in result.sql


def test_cte_names_are_not_tables() -> None:
    result = pg("WITH secret AS (SELECT 1 AS x) SELECT x FROM secret")
    assert result.ok
    assert result.tables == ()


def test_cte_cannot_shadow_qualified_table() -> None:
    assert not pg("WITH orders AS (SELECT 1) SELECT * FROM rls.orders").ok


def test_unqualified_tables_get_default_schema() -> None:
    result = pg("SELECT count(*) FROM orders")
    assert result.ok and result.sql is not None
    assert "olist.orders" in result.sql
    assert result.tables == ("olist.orders",)


@pytest.mark.parametrize(
    ("sql", "expected_limit", "limited"),
    [
        ("SELECT * FROM olist.orders", "LIMIT 1000", True),
        ("SELECT * FROM olist.orders LIMIT 10", "LIMIT 10", False),
        ("SELECT * FROM olist.orders LIMIT 5000", "LIMIT 1000", True),
        ("SELECT * FROM olist.orders LIMIT (SELECT 99999)", "LIMIT 1000", True),
        ("SELECT 1 UNION SELECT 2", "LIMIT 1000", True),
        ("WITH t AS (SELECT * FROM olist.orders LIMIT 5) SELECT * FROM t", "LIMIT 1000", True),
    ],
)
def test_limit_enforced(sql: str, expected_limit: str, limited: bool) -> None:
    result = pg(sql)
    assert result.ok and result.sql is not None
    assert result.sql.rstrip().endswith(expected_limit), result.sql
    assert result.limited is limited


def test_repairable_codes() -> None:
    assert pg("SELEC 1 FROM").repairable
    assert pg("SELECT * FROM olist.nope").repairable
    assert not pg("DROP TABLE olist.orders").repairable


def test_sqlite_dialect_without_schema() -> None:
    allowed = frozenset({"schools", "frpm"})
    ok = guard(
        "SELECT `County Name` FROM schools JOIN frpm USING (CDSCode)",
        dialect=Dialect.sqlite,
        allowed_tables=allowed,
        default_schema=None,
        row_limit=50,
    )
    assert ok.ok and ok.sql is not None and ok.sql.endswith("LIMIT 50")
    for bad in ("SELECT load_extension('x')", "ATTACH 'x.db' AS x", "PRAGMA table_info(schools)"):
        assert not guard(
            bad, dialect=Dialect.sqlite, allowed_tables=allowed, default_schema=None, row_limit=50
        ).ok, bad
