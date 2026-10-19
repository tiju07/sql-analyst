import asyncio
from collections.abc import Iterator

import asyncpg
import pytest
from alembic.config import Config
from testcontainers.community.postgres import PostgresContainer

from alembic import command

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def app_pg() -> Iterator[PostgresContainer]:
    with PostgresContainer("pgvector/pgvector:0.8.7-pg16", driver=None) as container:
        yield container


def _alembic(url: str) -> Config:
    cfg = Config("alembic.ini")
    cfg.attributes["url"] = url
    return cfg


async def test_upgrade_downgrade_roundtrip(app_pg: PostgresContainer) -> None:
    url = app_pg.get_connection_url()
    # alembic/env.py calls asyncio.run, so it must run off this test's event loop.
    await asyncio.to_thread(command.upgrade, _alembic(url), "head")
    conn = await asyncpg.connect(url)
    try:
        dim = await conn.fetchval(
            "SELECT atttypmod FROM pg_attribute"
            " WHERE attrelid = 'catalog_tables'::regclass AND attname = 'embedding'"
        )
        assert dim == 384
        uid = await conn.fetchval(
            "INSERT INTO users (email, display_name, role) VALUES ('a@b.c', 'A', 'admin')"
            " RETURNING id"
        )
        assert uid is not None
        with pytest.raises(asyncpg.CheckViolationError):
            await conn.execute(
                "INSERT INTO users (email, display_name, role) VALUES ('x@b.c', 'X', 'root')"
            )
    finally:
        await conn.close()
    await asyncio.to_thread(command.downgrade, _alembic(url), "base")
