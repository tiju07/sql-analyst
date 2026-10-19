import asyncio
from collections.abc import AsyncIterator, Iterator

import asyncpg
import pytest
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from sqlalchemy import select
from testcontainers.community.postgres import PostgresContainer
from testcontainers.community.redis import RedisContainer

from alembic import command
from app.config import Settings
from app.main import app, attach_state
from app.models import Connection
from app.runtime import Runtime
from app.workers.catalog_sync import sync_catalog
from scripts.load_olist import apply_schema, apply_security
from scripts.seed_users import seed

RO_PASSWORD = "ro-test-pw"
SIGNING_KEY = "test-rls-secret-0123456789abcdef-xyz"

# Two customers per state, one order each, with items/payments/reviews hanging off the orders.
FIXTURE = """
INSERT INTO olist.customers VALUES
  ('c_sp1','u1','01000','sao paulo','SP'), ('c_sp2','u2','01001','campinas','SP'),
  ('c_rj1','u3','20000','rio de janeiro','RJ'), ('c_mg1','u4','30000','belo horizonte','MG');
INSERT INTO olist.sellers VALUES ('s1','01000','sao paulo','SP');
INSERT INTO olist.products (product_id, product_category_name) VALUES ('p1','beleza_saude');
INSERT INTO olist.orders VALUES
  ('o_sp1','c_sp1','delivered','2018-01-01','2018-01-01',NULL,'2018-01-05','2018-01-10'),
  ('o_sp2','c_sp2','delivered','2018-02-01','2018-02-01',NULL,'2018-02-05','2018-02-10'),
  ('o_rj1','c_rj1','delivered','2018-03-01','2018-03-01',NULL,'2018-03-05','2018-03-10'),
  ('o_mg1','c_mg1','shipped','2018-04-01','2018-04-01',NULL,NULL,'2018-04-10');
INSERT INTO olist.order_items
  SELECT order_id, 1, 'p1', 's1', '2018-01-02', 100, 10 FROM olist.orders;
INSERT INTO olist.order_payments SELECT order_id, 1, 'credit_card', 1, 110 FROM olist.orders;
INSERT INTO olist.order_reviews
  SELECT 'r_' || order_id, order_id, 5, NULL, NULL, '2018-05-01', '2018-05-02' FROM olist.orders;
"""


@pytest.fixture(scope="session")
def pg() -> Iterator[PostgresContainer]:
    with PostgresContainer("postgres:16.15", driver=None) as container:
        yield container


@pytest.fixture(scope="session")
async def target_db(pg: PostgresContainer) -> AsyncIterator[dict[str, str]]:
    owner_dsn = pg.get_connection_url()
    conn = await asyncpg.connect(owner_dsn)
    await apply_schema(conn)
    await conn.execute(FIXTURE)
    await apply_security(conn, RO_PASSWORD, SIGNING_KEY)
    await conn.close()
    ro_dsn = owner_dsn.replace(f"{pg.username}:{pg.password}@", f"analyst_ro:{RO_PASSWORD}@", 1)
    yield {"owner": owner_dsn, "ro": ro_dsn}


@pytest.fixture
async def ro(target_db: dict[str, str]) -> AsyncIterator[asyncpg.Connection]:
    conn = await asyncpg.connect(target_db["ro"])
    yield conn
    await conn.close()


# --- Full backend stack: app DB (pgvector) + target DB + Redis, fake LLM and embeddings --------


@pytest.fixture(scope="session")
def app_pg() -> Iterator[PostgresContainer]:
    with PostgresContainer("pgvector/pgvector:0.8.7-pg16", driver=None) as container:
        yield container


@pytest.fixture(scope="session")
def redis_url() -> Iterator[str]:
    with RedisContainer("redis:8.10.2") as container:
        yield f"redis://{container.get_container_host_ip()}:{container.get_exposed_port(6379)}/0"


@pytest.fixture(scope="session")
async def rt(
    app_pg: PostgresContainer, target_db: dict[str, str], redis_url: str
) -> AsyncIterator[Runtime]:
    app_url = app_pg.get_connection_url()
    await asyncio.to_thread(command.upgrade, _alembic(app_url), "head")
    await seed(app_url, ("owner@example.com", "correct horse battery staple"))
    settings = Settings(
        app_database_url=app_url,
        target_database_url=target_db["ro"],
        redis_url=redis_url,
        session_secret="test-session-secret-0123456789abcdef",
        rls_signing_secret=SIGNING_KEY,
        fake_llm=True,
        embedding_provider="fake",
        cookie_secure=False,  # httpx won't send Secure cookies to http://test
    )
    runtime = await Runtime.create(settings)
    async with runtime.sessions() as session:
        conn_id = await session.scalar(select(Connection.id).where(Connection.name == "olist"))
    assert conn_id is not None
    await sync_catalog(runtime, conn_id)
    yield runtime
    await runtime.close()


@pytest.fixture(scope="session")
async def checkpointer(app_pg: PostgresContainer, rt: Runtime) -> AsyncIterator[AsyncPostgresSaver]:
    pool = AsyncConnectionPool(
        app_pg.get_connection_url(),
        kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
        open=False,
    )
    await pool.open()
    saver = AsyncPostgresSaver(pool)  # type: ignore[arg-type]
    await saver.setup()
    yield saver
    await pool.close()


@pytest.fixture
async def api(rt: Runtime, checkpointer: AsyncPostgresSaver) -> AsyncIterator[AsyncClient]:
    await rt.redis.flushdb()  # fresh rate-limit buckets and budget per test
    attach_state(app, rt, checkpointer)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


def _alembic(url: str) -> Config:
    cfg = Config("alembic.ini")
    cfg.attributes["url"] = url
    return cfg
