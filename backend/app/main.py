from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from urllib.parse import urlparse

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from prometheus_client import make_asgi_app
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.api import catalog, chat, connections, conversations, health, runs
from app.auth import routes as auth
from app.config import PRODUCT_NAME, get_settings
from app.errors import ApiError, api_error_handler
from app.graph.build import build_graph
from app.graph.manager import RunManager
from app.logging import configure_logging
from app.ratelimit import RateLimiter
from app.runtime import Runtime
from app.schemas import ErrorBody, ErrorCode
from app.telemetry import setup_tracing


def attach_state(app: FastAPI, rt: Runtime, checkpointer: BaseCheckpointSaver[str]) -> None:
    app.state.rt = rt
    app.state.limiter = RateLimiter(rt.redis)
    app.state.runs = RunManager(rt, build_graph(checkpointer))


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging()
    tracing = setup_tracing(settings, "sql-analyst-api")
    rt = await Runtime.create(settings)
    # Checkpoints (paused clarifications) live in the app DB; psycopg is what LangGraph uses.
    pool = AsyncConnectionPool(
        str(settings.app_database_url),
        kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
        open=False,
    )
    await pool.open()
    saver = AsyncPostgresSaver(pool)  # type: ignore[arg-type]  # pool typed with dict rows
    await saver.setup()
    attach_state(app, rt, saver)
    yield
    await pool.close()
    await rt.close()
    tracing.shutdown()


app = FastAPI(
    title=f"{PRODUCT_NAME} API",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    responses={"4XX": {"model": ErrorBody}, "5XX": {"model": ErrorBody}},
)
app.add_exception_handler(ApiError, api_error_handler)

_UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


@app.middleware("http")
async def same_origin_only(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """CSRF defence on top of SameSite=Lax: browsers send Origin on cross-site writes."""
    origin = request.headers.get("origin")
    if (
        request.method in _UNSAFE
        and origin
        and urlparse(origin).netloc != request.headers.get("host")
    ):
        body = ErrorBody(code=ErrorCode.FORBIDDEN, message="Cross-origin request blocked.")
        return JSONResponse(body.model_dump(mode="json"), status_code=403)
    return await call_next(request)


for router in (
    health.router,
    auth.router,
    connections.router,
    catalog.router,
    conversations.router,
    chat.router,
    runs.router,
):
    app.include_router(router, prefix="/api")
app.mount("/api/metrics", make_asgi_app())
