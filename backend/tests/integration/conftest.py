from collections.abc import AsyncIterator, Iterator

import asyncpg
import pytest
from testcontainers.community.postgres import PostgresContainer

from scripts.load_olist import apply_schema, apply_security

RO_PASSWORD = "ro-test-pw"
SIGNING_KEY = "test-rls-secret"

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
