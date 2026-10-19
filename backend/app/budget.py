"""Global daily LLM spend cap (public-demo safety), tracked in Redis in micro-dollars."""

from datetime import UTC, datetime

from redis.asyncio import Redis


def _key(now: datetime | None = None) -> str:
    return f"llm:spend:{(now or datetime.now(UTC)).date().isoformat()}"


async def spent_today_usd(redis: Redis) -> float:
    raw = await redis.get(_key())
    return int(raw) / 1_000_000 if raw else 0.0


async def record_spend(redis: Redis, usd: float) -> None:
    key = _key()
    # Integer micro-dollars: INCRBY is exact where INCRBYFLOAT accumulates float error.
    await redis.incrby(key, round(usd * 1_000_000))
    await redis.expire(key, 2 * 86_400)


async def budget_left(redis: Redis, daily_budget_usd: float) -> bool:
    # ponytail: check-then-spend; concurrent runs can overshoot by one call each. Fine for a demo.
    return await spent_today_usd(redis) < daily_budget_usd
