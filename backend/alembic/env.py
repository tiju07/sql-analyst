import asyncio

from sqlalchemy.ext.asyncio import create_async_engine

from alembic import context
from app.db import async_url

config = context.config


def _url() -> str:
    # Tests pass the URL via config.attributes; everything else reads APP_DATABASE_URL.
    url = config.attributes.get("url")
    if url is None:
        from app.config import get_settings

        url = str(get_settings().app_database_url)
    return async_url(str(url))


async def _run() -> None:
    engine = create_async_engine(_url())
    async with engine.connect() as conn:
        await conn.run_sync(lambda c: context.configure(connection=c, target_metadata=None))
        await conn.run_sync(lambda _: context.run_migrations())
        await conn.commit()
    await engine.dispose()


asyncio.run(_run())
