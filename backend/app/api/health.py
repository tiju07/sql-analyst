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
    state = request.app.state

    async def db(engine_name: str) -> bool:
        async with getattr(state, engine_name).connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True

    async def redis() -> bool:
        return bool(await state.redis.ping())

    names = ("app_db", "target_db", "redis")
    results = await asyncio.gather(
        db("app_engine"), db("target_engine"), redis(), return_exceptions=True
    )
    checks = {n: r is True for n, r in zip(names, results, strict=True)}
    ok = all(checks.values())
    if not ok:
        response.status_code = 503
    return Ready(status="ok" if ok else "degraded", checks=checks)
