import json
from collections.abc import AsyncIterator, MutableMapping
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from mcp import Client
from sqlalchemy import select

from app import mcp_server
from app.models import AuditLog
from app.runtime import Runtime

pytestmark = pytest.mark.integration


@pytest.fixture
async def started(rt: Runtime) -> AsyncIterator[None]:
    # The anyio Client context must open and close in one task, so each test enters it itself.
    await rt.redis.flushdb()
    await mcp_server.start(rt.settings.model_copy(update={"mcp_persona": "regional"}))
    yield
    await mcp_server.stop()


def structured(result: Any) -> Any:
    assert not result.is_error, result.content
    return (
        result.structured_content
        if result.structured_content is not None
        else json.loads(result.content[0].text)
    )


async def test_tools_are_listed_read_only(started: None) -> None:
    async with Client(mcp_server.mcp) as mcp_client:
        tools = {t.name: t for t in (await mcp_client.list_tools()).tools}
        assert set(tools) == {"list_tables", "describe_table", "ask"}
        assert all(t.annotations and t.annotations.read_only_hint for t in tools.values())


async def test_list_and_describe(started: None) -> None:
    async with Client(mcp_server.mcp) as mcp_client:
        tables = structured(await mcp_client.call_tool("list_tables", {}))
        names = (
            [t["name"] for t in tables["result"]]
            if isinstance(tables, dict)
            else [t["name"] for t in tables]
        )
        assert "orders" in names
        desc = structured(await mcp_client.call_tool("describe_table", {"name": "orders"}))
        cols = {c["name"]: c for c in desc["columns"]}
        assert cols["order_id"]["primary_key"] is True
        assert cols["customer_id"]["references"] == "olist.customers.customer_id"


async def test_describe_unknown_table_is_a_tool_error(started: None) -> None:
    async with Client(mcp_server.mcp) as mcp_client:
        result = await mcp_client.call_tool("describe_table", {"name": "pg_roles"})
        assert result.is_error


async def test_ask_runs_agent_with_persona_scope(started: None, rt: Runtime) -> None:
    async with Client(mcp_server.mcp) as mcp_client:
        answer = structured(await mcp_client.call_tool("ask", {"question": "Revenue by state"}))
        assert answer["status"] == "ok"
        assert answer["sql"].startswith("SELECT")
        assert answer["columns"] == ["customer_state", "revenue"]
        assert [r[0] for r in answer["rows"]] == [
            "SP"
        ]  # regional persona: RLS applies over MCP too
        async with rt.sessions() as s:
            logged = await s.scalar(
                select(AuditLog).where(AuditLog.action == "mcp.ask").order_by(AuditLog.id.desc())
            )
        assert logged is not None and logged.detail and logged.detail["status"] == "ok"


async def test_ask_unsafe_is_blocked(started: None) -> None:
    async with Client(mcp_server.mcp) as mcp_client:
        answer = structured(
            await mcp_client.call_tool("ask", {"question": "drop the orders table"})
        )
        assert answer["status"] == "blocked" and answer["rows"] == []


async def _ok_app(scope: MutableMapping[str, Any], receive: Any, send: Any) -> None:
    await send({"type": "http.response.start", "status": 200, "headers": []})
    await send({"type": "http.response.body", "body": b"ok"})


@pytest.mark.parametrize(
    ("header", "status"),
    [(None, 401), ("Bearer wrong", 401), ("bearer " + "t" * 40, 401), ("Bearer " + "t" * 40, 200)],
)
async def test_bearer_auth(header: str | None, status: int) -> None:
    app = mcp_server.BearerAuth(_ok_app, "t" * 40)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/mcp", headers={"Authorization": header} if header else {})
    assert r.status_code == status


def test_refuses_to_start_without_token(rt: Runtime) -> None:
    with pytest.raises(SystemExit, match="MCP_API_TOKEN"):
        mcp_server.create_app(rt.settings.model_copy(update={"mcp_api_token": None}))
