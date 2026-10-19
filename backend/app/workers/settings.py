"""arq worker settings; started by `python -m app.workers`."""

import uuid
from dataclasses import asdict
from typing import Any

from arq.connections import RedisSettings

from app.config import get_settings
from app.logging import configure_logging
from app.runtime import Runtime
from app.workers.catalog_sync import sync_catalog


async def startup(ctx: dict[str, Any]) -> None:
    configure_logging()
    ctx["rt"] = await Runtime.create(get_settings())


async def shutdown(ctx: dict[str, Any]) -> None:
    await ctx["rt"].close()


async def sync_catalog_job(ctx: dict[str, Any], connection_id: str) -> dict[str, Any]:
    report = await sync_catalog(ctx["rt"], uuid.UUID(connection_id))
    return asdict(report)


class WorkerSettings:
    functions = [sync_catalog_job]  # noqa: RUF012 (arq reads class attributes)
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(str(get_settings().redis_url))
    job_timeout = 900
    max_tries = 1  # a failed sync is reported, not silently retried
    keep_result = 3600
