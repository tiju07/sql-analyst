from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from urllib.parse import urlparse

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

from app.api import catalog, connections, health
from app.auth import routes as auth
from app.config import PRODUCT_NAME, get_settings
from app.errors import ApiError, api_error_handler
from app.logging import configure_logging
from app.ratelimit import RateLimiter
from app.runtime import Runtime
from app.schemas import ErrorBody, ErrorCode


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    rt = await Runtime.create(get_settings())
    app.state.rt = rt
    app.state.limiter = RateLimiter(rt.redis)
    yield
    await rt.close()


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


for router in (health.router, auth.router, connections.router, catalog.router):
    app.include_router(router, prefix="/api")
