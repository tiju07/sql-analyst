import json
from typing import Any

from httpx import AsyncClient


async def stream(api: AsyncClient, path: str, body: dict[str, Any]) -> list[tuple[str, Any]]:
    """POST and collect (event, data) pairs from an SSE response."""
    events: list[tuple[str, Any]] = []
    async with api.stream("POST", path, json=body) as r:
        assert r.status_code == 200, await r.aread()
        assert r.headers["content-type"].startswith("text/event-stream")
        name = None
        async for line in r.aiter_lines():
            if line.startswith("event:"):
                name = line.split(":", 1)[1].strip()
            elif line.startswith("data:") and name:
                events.append((name, json.loads(line.split(":", 1)[1])))
                name = None
    return events


def first(events: list[tuple[str, Any]], name: str) -> Any:
    return next(d for n, d in events if n == name)
