from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from redis.asyncio import Redis

from app.api import health
from app.config import PRODUCT_NAME, get_settings
from app.db import make_engine
from app.logging import configure_logging


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging()
    app.state.app_engine = make_engine(str(settings.app_database_url))
    app.state.target_engine = make_engine(str(settings.target_database_url))
    app.state.redis = Redis.from_url(str(settings.redis_url))
    yield
    await app.state.redis.aclose()
    await app.state.app_engine.dispose()
    await app.state.target_engine.dispose()


app = FastAPI(
    title=f"{PRODUCT_NAME} API",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)
app.include_router(health.router, prefix="/api")
