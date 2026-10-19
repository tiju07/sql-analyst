import asyncio
from typing import Literal

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel
from sqlalchemy import text

from app.config import PRODUCT_NAME

router = APIRouter(tags=["health"])


class Health(BaseModel):
    status: Literal["ok"]
    product: str


class Ready(BaseModel):
    status: Literal["ok", "degraded"]
    checks: dict[str, bool]


@router.get("/health")
async def health() -> Health:
    return Health(status="ok", product=PRODUCT_NAME)


@router.get("/ready", responses={503: {"model": Ready}})
async def ready(request: Request, response: Response) -> Ready:
    rt = request.app.state.rt

    async def app_db() -> bool:
        async with rt.app_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True

    async def target_db() -> bool:
        async with rt.target_pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return True

    async def redis() -> bool:
        return bool(await rt.redis.ping())

    names = ("app_db", "target_db", "redis")
    results = await asyncio.gather(app_db(), target_db(), redis(), return_exceptions=True)
    checks = {n: r is True for n, r in zip(names, results, strict=True)}
    ok = all(checks.values())
    if not ok:
        response.status_code = 503
    return Ready(status="ok" if ok else "degraded", checks=checks)
