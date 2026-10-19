from typing import Literal

from fastapi import APIRouter, Request, Response
from sqlalchemy import select

from app.auth.personas import PERSONAS
from app.auth.security import (
    SESSION_COOKIE,
    SESSION_TTL,
    create_session_token,
    verify_password,
)
from app.deps import LimiterDep, RuntimeDep, SessionDep, UserDep, audit, client_ip, rate_limit
from app.errors import ApiError, not_found
from app.models import User
from app.schemas import ErrorCode
from app.schemas.auth import LoginIn, PersonaOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

PersonaKey = Literal["admin", "analyst", "regional"]


def _set_cookie(response: Response, rt: RuntimeDep, user: User) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        create_session_token(user.id, rt.settings.session_secret.get_secret_value()),
        max_age=int(SESSION_TTL.total_seconds()),
        httponly=True,
        secure=rt.settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def _out(user: User) -> UserOut:
    return UserOut.model_validate(user, from_attributes=True)


@router.post("/login")
async def login(
    body: LoginIn,
    request: Request,
    response: Response,
    rt: RuntimeDep,
    session: SessionDep,
    limiter: LimiterDep,
) -> UserOut:
    await rate_limit(limiter, f"login:{client_ip(request)}", per_minute=10)
    user = await session.scalar(select(User).where(User.email == body.email.lower()))
    # Same error and argon2 cost path whether or not the account exists.
    if (
        user is None
        or user.password_hash is None
        or not verify_password(user.password_hash, body.password)
    ):
        raise ApiError(ErrorCode.UNAUTHENTICATED, "Email or password is incorrect.")
    _set_cookie(response, rt, user)
    audit(session, user, "auth.login")
    await session.commit()
    return _out(user)


@router.get("/personas")
async def personas(rt: RuntimeDep) -> list[PersonaOut]:
    if not rt.settings.demo_login_enabled:
        return []
    return [
        PersonaOut(
            key=p.key,
            display_name=p.display_name,
            role=p.role,
            allowed_states=p.allowed_states,
            blurb=p.blurb,
        )
        for p in PERSONAS.values()
    ]


@router.post("/demo/{persona}")
async def demo_login(
    persona: PersonaKey,
    request: Request,
    response: Response,
    rt: RuntimeDep,
    session: SessionDep,
    limiter: LimiterDep,
) -> UserOut:
    if not rt.settings.demo_login_enabled:
        raise not_found("Demo login")
    await rate_limit(limiter, f"demo:{client_ip(request)}", per_minute=5)
    user = await session.scalar(
        select(User).where(User.email == PERSONAS[persona].email, User.is_demo)
    )
    if user is None:
        raise not_found("Demo persona (run make seed)")
    _set_cookie(response, rt, user)
    audit(session, user, "auth.demo_login", persona=persona)
    await session.commit()
    return _out(user)


@router.post("/logout", status_code=204)
async def logout(response: Response, rt: RuntimeDep) -> None:
    response.delete_cookie(
        SESSION_COOKIE, path="/", httponly=True, secure=rt.settings.cookie_secure, samesite="lax"
    )


@router.get("/me")
async def me(user: UserDep) -> UserOut:
    return _out(user)
