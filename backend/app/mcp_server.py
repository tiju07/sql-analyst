"""Read-only MCP server (streamable HTTP): the same agent, guard and RLS as the web app.

Run: `python -m app.mcp_server` (port 8001, path /mcp). Every request needs
`Authorization: Bearer $MCP_API_TOKEN`. Queries run with the row scope of MCP_PERSONA.
"""

import dataclasses
import hmac
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable, MutableMapping
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

import structlog
import uvicorn
from langgraph.checkpoint.memory import InMemorySaver
from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations
from pydantic import BaseModel
from sqlalchemy import select
from starlette.applications import Starlette
from starlette.routing import Mount

from app.auth.personas import PERSONAS, Persona
from app.config import PRODUCT_NAME, Settings, get_settings
from app.graph import results
from app.graph.build import AgentGraph, build_graph
from app.graph.context import agent_config, agent_context
from app.graph.runner import RunOutcome, stream_run
from app.graph.state import AgentState
from app.logging import configure_logging
from app.models import AuditLog, CatalogColumn, CatalogTable, Connection, User
from app.ratelimit import RateLimiter
from app.runtime import Runtime
from app.telemetry import setup_tracing

log = structlog.get_logger()
MAX_ROWS = 50
READ_ONLY = ToolAnnotations(read_only_hint=True, destructive_hint=False, open_world_hint=False)


@dataclass
class McpState:
    rt: Runtime
    graph: AgentGraph
    connection_id: uuid.UUID
    persona: Persona
    user_id: uuid.UUID | None
    limiter: RateLimiter


_state: McpState | None = None


def state() -> McpState:
    if _state is None:
        raise RuntimeError("MCP server not started")
    return _state


class TableInfo(BaseModel):
    name: str
    rows: int | None
    description: str | None


class ColumnInfo(BaseModel):
    name: str
    type: str
    description: str | None
    primary_key: bool
    references: str | None
    examples: list[Any]


class TableDescription(BaseModel):
    name: str
    description: str | None
    columns: list[ColumnInfo]


class AskResult(BaseModel):
    status: str
    sql: str | None = None
    columns: list[str] = []
    rows: list[list[Any]] = []
    row_count: int = 0
    rows_truncated: bool = False
    summary: str | None = None
    caveats: list[str] = []
    error: str | None = None


mcp = MCPServer(
    PRODUCT_NAME,
    instructions=(
        "Answer questions about the Olist Brazilian e-commerce database (orders, items, payments, "
        "reviews, customers, sellers, products, 2016-2018). Use list_tables and describe_table to "
        "explore, and ask to get a verified, read-only SQL answer. Money is in BRL."
    ),
)


@mcp.tool(annotations=READ_ONLY)
async def list_tables() -> list[TableInfo]:
    """List the database tables with approximate row counts and descriptions."""
    s = state()
    async with s.rt.sessions() as session:
        tables = await session.scalars(
            select(CatalogTable)
            .where(CatalogTable.connection_id == s.connection_id)
            .order_by(CatalogTable.name)
        )
        return [TableInfo(name=t.name, rows=t.row_count, description=t.description) for t in tables]


@mcp.tool(annotations=READ_ONLY)
async def describe_table(name: str) -> TableDescription:
    """Columns of one table: type, description, keys and example values."""
    s = state()
    async with s.rt.sessions() as session:
        table = await session.scalar(
            select(CatalogTable).where(
                CatalogTable.connection_id == s.connection_id, CatalogTable.name == name.strip()
            )
        )
        if table is None:
            raise ValueError(f"Unknown table {name!r}. Call list_tables for valid names.")
        cols = await session.scalars(
            select(CatalogColumn)
            .where(CatalogColumn.table_id == table.id)
            .order_by(CatalogColumn.is_pk.desc(), CatalogColumn.name)
        )
        return TableDescription(
            name=table.name,
            description=table.description,
            columns=[
                ColumnInfo(
                    name=c.name,
                    type=c.data_type,
                    description=c.description,
                    primary_key=c.is_pk,
                    references=c.fk_ref,
                    examples=(c.sample_values or [])[:5],
                )
                for c in cols
            ],
        )


@mcp.tool(annotations=READ_ONLY)
async def ask(question: str) -> AskResult:
    """Answer a business question: returns the SQL that ran, up to 50 rows and a short summary.

    Queries are read-only and limited to the server's configured data scope.
    """
    s = state()
    question = question.strip()[:1000]
    if not question:
        raise ValueError("Ask a non-empty question.")
    limit = await s.limiter.hit("mcp", per_minute=s.rt.settings.rate_limit_per_min)
    if not limit.allowed:
        return AskResult(status="rate_limited", error=f"Try again in {limit.retry_after_s} s.")

    run_id = str(uuid.uuid4())
    # Nobody can answer a clarifying question mid-call: the agent states its assumptions instead.
    config = dataclasses.replace(agent_config(s.rt), clarify=False)
    ctx = agent_context(s.rt, s.connection_id, config=config)
    start = AgentState(
        run_id=run_id, question=question, history=[], allowed_states=s.persona.allowed_states
    )
    outcome = RunOutcome(status="failed")
    async for item in stream_run(s.graph, ctx, run_id, start):
        if isinstance(item, RunOutcome):
            outcome = item

    async with s.rt.sessions() as session:
        session.add(
            AuditLog(
                user_id=s.user_id,
                action="mcp.ask",
                detail={
                    "question": question,
                    "status": outcome.status,
                    "cost_usd": ctx.llm.usage.cost_usd,
                },
            )
        )
        await session.commit()

    if outcome.error or outcome.status not in ("ok", "repaired"):
        message = outcome.error["message"] if outcome.error else outcome.status
        return AskResult(status=outcome.status, error=message)
    payload = await results.load(s.rt.redis, results.rows_key(run_id)) or {}
    rows: list[list[Any]] = payload.get("rows", [])
    chosen = next(c for c in outcome.values["candidates"] if c["index"] == outcome.values["chosen"])
    return AskResult(
        status=outcome.status,
        sql=chosen.get("safe_sql"),
        columns=[c["name"] for c in payload.get("columns", [])],
        rows=rows[:MAX_ROWS],
        row_count=len(rows),
        rows_truncated=len(rows) > MAX_ROWS or bool(payload.get("truncated")),
        summary=outcome.values.get("summary"),
        caveats=outcome.values.get("caveats") or [],
    )


async def start(settings: Settings) -> None:
    global _state
    rt = await Runtime.create(settings)
    persona = PERSONAS[settings.mcp_persona]
    async with rt.sessions() as session:
        conn_id = await session.scalar(select(Connection.id).order_by(Connection.created_at))
        user_id = await session.scalar(select(User.id).where(User.email == persona.email))
    if conn_id is None:
        raise SystemExit("No connection in the app DB: run `make seed` first")
    _state = McpState(
        rt, build_graph(InMemorySaver()), conn_id, persona, user_id, RateLimiter(rt.redis)
    )


async def stop() -> None:
    global _state
    if _state is not None:
        await _state.rt.close()
        _state = None


ASGIApp = Callable[
    [MutableMapping[str, Any], Callable[[], Awaitable[Any]], Callable[[Any], Awaitable[None]]],
    Awaitable[None],
]


class BearerAuth:
    """Static API token in front of the MCP app (constant-time comparison)."""

    def __init__(self, app: ASGIApp, token: str) -> None:
        self.app = app
        self.expected = f"Bearer {token}".encode()

    async def __call__(
        self,
        scope: MutableMapping[str, Any],
        receive: Callable[[], Awaitable[Any]],
        send: Callable[[Any], Awaitable[None]],
    ) -> None:
        if scope["type"] == "http":
            given = dict(scope["headers"]).get(b"authorization", b"")
            if not hmac.compare_digest(given, self.expected):
                await send(
                    {
                        "type": "http.response.start",
                        "status": 401,
                        "headers": [
                            (b"content-type", b"application/json"),
                            (b"www-authenticate", b"Bearer"),
                        ],
                    }
                )
                await send({"type": "http.response.body", "body": b'{"error":"unauthorized"}'})
                return
        await self.app(scope, receive, send)


def create_app(settings: Settings) -> Starlette:
    if settings.mcp_api_token is None or len(settings.mcp_api_token.get_secret_value()) < 32:
        raise SystemExit("MCP_API_TOKEN must be set (32+ characters); the server refuses to start")
    hosts = [h.strip() for h in settings.mcp_allowed_hosts.split(",") if h.strip()]
    inner = mcp.streamable_http_app(
        stateless_http=True,
        json_response=True,
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True, allowed_hosts=hosts, allowed_origins=[]
        ),
    )

    @asynccontextmanager
    async def lifespan(_: Starlette) -> AsyncIterator[None]:
        await start(settings)
        async with mcp.session_manager.run():
            yield
        await stop()

    return Starlette(
        routes=[Mount("/", app=BearerAuth(inner, settings.mcp_api_token.get_secret_value()))],
        lifespan=lifespan,
    )


def main() -> None:
    settings = get_settings()
    configure_logging()
    setup_tracing(settings, "sql-analyst-mcp")
    uvicorn.run(create_app(settings), host="0.0.0.0", port=8001, proxy_headers=True)  # noqa: S104


if __name__ == "__main__":
    main()
