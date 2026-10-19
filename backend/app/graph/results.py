"""Result rows live in Redis (TTL 1h), never in checkpoints or the app DB."""

import json
from typing import Any

from redis.asyncio import Redis

RESULT_TTL_S = 3600
PREVIEW_ROWS = 200


def candidate_key(run_id: str, index: int) -> str:
    return f"run:{run_id}:cand:{index}"


def rows_key(run_id: str) -> str:
    return f"run:{run_id}:rows"


async def save(redis: Redis, key: str, payload: dict[str, Any]) -> None:
    await redis.set(key, json.dumps(payload, default=str), ex=RESULT_TTL_S)


async def load(redis: Redis, key: str) -> dict[str, Any] | None:
    raw = await redis.get(key)
    return json.loads(raw) if raw else None
