import sqlite3
from pathlib import Path

import pytest

from app.runtime import Runtime
from app.sql.executor import QueryError, SqliteExecutor

pytestmark = pytest.mark.integration


async def test_postgres_scoped_results_and_types(rt: Runtime) -> None:
    result = await rt.executor.execute(
        "SELECT customer_state, count(*) AS n, sum(i.price) AS revenue"
        " FROM olist.order_items i JOIN olist.orders USING (order_id)"
        " JOIN olist.customers USING (customer_id) GROUP BY 1 ORDER BY 1",
        allowed_states=["SP"],
        timeout_ms=5000,
        row_limit=100,
    )
    assert [c.name for c in result.columns] == ["customer_state", "n", "revenue"]
    assert [c.type for c in result.columns] == ["bpchar", "int8", "numeric"]
    assert result.rows == [["SP", 2, 200.0]]
    assert not result.truncated


async def test_postgres_row_limit_truncates(rt: Runtime) -> None:
    result = await rt.executor.execute(
        "SELECT * FROM generate_series(1, 50)", allowed_states=None, timeout_ms=5000, row_limit=10
    )
    assert result.row_count == 10
    assert result.truncated


async def test_postgres_timeout(rt: Runtime) -> None:
    with pytest.raises(QueryError) as e:
        await rt.executor.execute(
            "SELECT pg_sleep(2)", allowed_states=None, timeout_ms=200, row_limit=10
        )
    assert e.value.code == "timeout"


async def test_postgres_error_text_is_kept_for_repair(rt: Runtime) -> None:
    with pytest.raises(QueryError) as e:
        await rt.executor.execute(
            "SELECT nope FROM olist.orders", allowed_states=None, timeout_ms=5000, row_limit=10
        )
    assert e.value.code == "db_error"
    assert 'column "nope" does not exist' in e.value.message


async def test_postgres_transaction_is_read_only(rt: Runtime) -> None:
    with pytest.raises(QueryError, match="read-only transaction"):
        await rt.executor.execute(
            "CREATE TEMP TABLE t AS SELECT 1", allowed_states=None, timeout_ms=5000, row_limit=10
        )


async def test_postgres_explain_cost(rt: Runtime) -> None:
    cost = await rt.executor.explain_cost("SELECT * FROM olist.orders", allowed_states=["SP"])
    assert cost is not None and cost > 0


@pytest.fixture
def sqlite_db(tmp_path: Path) -> Path:
    path = tmp_path / "t.sqlite"
    with sqlite3.connect(path) as db:
        db.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, score REAL)")
        db.executemany("INSERT INTO t VALUES (?, ?, ?)", [(i, f"n{i}", i / 2) for i in range(30)])
    return path


async def test_sqlite_execute_and_limit(sqlite_db: Path) -> None:
    result = await SqliteExecutor(sqlite_db).execute(
        "SELECT id, name, score FROM t ORDER BY id",
        allowed_states=None,
        timeout_ms=2000,
        row_limit=5,
    )
    assert result.rows[0] == [0, "n0", 0.0]
    assert [c.type for c in result.columns] == ["integer", "text", "real"]
    assert result.truncated


async def test_sqlite_is_read_only(sqlite_db: Path) -> None:
    with pytest.raises(QueryError, match="readonly"):
        await SqliteExecutor(sqlite_db).execute(
            "DELETE FROM t", allowed_states=None, timeout_ms=2000, row_limit=5
        )


async def test_sqlite_timeout_interrupts(sqlite_db: Path) -> None:
    slow = (
        "WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM r WHERE n < 100000000)"
        " SELECT count(*) FROM r"
    )
    with pytest.raises(QueryError) as e:
        await SqliteExecutor(sqlite_db).execute(
            slow, allowed_states=None, timeout_ms=200, row_limit=5
        )
    assert e.value.code == "timeout"


async def test_sqlite_introspection(tmp_path: Path) -> None:
    from app.sql.introspect import introspect_sqlite

    path = tmp_path / "s.sqlite"
    with sqlite3.connect(path) as db:
        db.execute("CREATE TABLE schools (cds TEXT PRIMARY KEY, county TEXT, opened DATE)")
        db.execute("CREATE TABLE scores (cds TEXT REFERENCES schools(cds), avg_math REAL)")
        db.executemany(
            "INSERT INTO schools VALUES (?, ?, ?)",
            [("1", "Alameda", "2001-01-01"), ("2", "Alameda", "2005-06-01"), ("3", "Fresno", None)],
        )
        db.execute("INSERT INTO scores VALUES ('1', 512.5)")
    tables = {t.name: t for t in await introspect_sqlite(path)}
    schools = {c.name: c for c in tables["schools"].columns}
    assert tables["schools"].row_count == 3
    assert schools["cds"].is_pk
    assert schools["county"].distinct_values == ["Alameda", "Fresno"]
    assert schools["opened"].semantic_type == "date"
    assert schools["opened"].sample_values == ["2001-01-01", "2005-06-01"]
    assert {c.name: c for c in tables["scores"].columns}["cds"].fk_ref == "schools.cds"
