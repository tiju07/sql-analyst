from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import SESSION_COOKIE, decode_session_token
from app.errors import ApiError
from app.models import AuditLog, Role, User
from app.ratelimit import RateLimiter
from app.runtime import Runtime
from app.schemas import ErrorCode


def get_runtime(request: Request) -> Runtime:
    rt: Runtime = request.app.state.rt
    return rt


RuntimeDep = Annotated[Runtime, Depends(get_runtime)]


async def get_session(rt: RuntimeDep) -> AsyncIterator[AsyncSession]:
    async with rt.sessions() as session:
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_session)]


def get_limiter(request: Request) -> RateLimiter:
    limiter: RateLimiter = request.app.state.limiter
    return limiter


LimiterDep = Annotated[RateLimiter, Depends(get_limiter)]


async def current_user(request: Request, rt: RuntimeDep, session: SessionDep) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    user_id = token and decode_session_token(token, rt.settings.session_secret.get_secret_value())
    user = await session.get(User, user_id) if user_id else None
    if user is None:
        raise ApiError(ErrorCode.UNAUTHENTICATED, "Please sign in.")
    return user


UserDep = Annotated[User, Depends(current_user)]


async def require_admin(user: UserDep) -> User:
    if user.role != Role.admin:
        raise ApiError(ErrorCode.FORBIDDEN, "Only admins can do this.")
    return user


AdminDep = Annotated[User, Depends(require_admin)]


def client_ip(request: Request) -> str:
    # uvicorn --proxy-headers resolves X-Forwarded-For from Caddy into request.client.
    return request.client.host if request.client else "unknown"


async def rate_limit(limiter: RateLimiter, key: str, per_minute: int) -> None:
    result = await limiter.hit(key, per_minute=per_minute)
    if not result.allowed:
        raise ApiError(
            ErrorCode.RATE_LIMITED,
            f"Too many requests. Try again in {result.retry_after_s} s.",
            retry_after_s=result.retry_after_s,
        )


def audit(session: AsyncSession, user: User | None, action: str, **detail: object) -> None:
    session.add(AuditLog(user_id=user.id if user else None, action=action, detail=detail))
