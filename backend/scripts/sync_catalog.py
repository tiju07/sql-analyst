"""Run a catalog sync inline (used by `make seed`; the API enqueues the same job on the worker)."""

import asyncio

from sqlalchemy import select

from app.config import get_settings
from app.logging import configure_logging
from app.models import Connection
from app.runtime import Runtime
from app.workers.catalog_sync import sync_catalog


async def main() -> None:
    configure_logging()
    rt = await Runtime.create(get_settings())
    try:
        async with rt.sessions() as session:
            conn_id = await session.scalar(select(Connection.id).where(Connection.name == "olist"))
        if conn_id is None:
            raise SystemExit("Run scripts.seed_users first: the olist connection is missing")
        report = await sync_catalog(rt, conn_id)
        print(
            f"Catalog: {report.tables} tables, {report.columns} columns, {report.values} values;"
            f" described {report.described_tables} tables / {report.described_columns} columns"
            f" for ${report.usage.cost_usd:.4f}"
        )
    finally:
        await rt.close()


if __name__ == "__main__":
    asyncio.run(main())
