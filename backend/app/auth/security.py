import uuid
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError

_hasher = PasswordHasher()
SESSION_COOKIE = "sa_session"
SESSION_TTL = timedelta(days=7)
_ALG = "HS256"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerificationError:
        return False


def create_session_token(user_id: uuid.UUID, secret: str, now: datetime | None = None) -> str:
    now = now or datetime.now(UTC)
    return jwt.encode(
        {"sub": str(user_id), "iat": now, "exp": now + SESSION_TTL}, secret, algorithm=_ALG
    )


def decode_session_token(token: str, secret: str) -> uuid.UUID | None:
    """User id from a valid, unexpired token; None for anything else."""
    try:
        claims = jwt.decode(token, secret, algorithms=[_ALG], options={"require": ["sub", "exp"]})
        return uuid.UUID(claims["sub"])
    except jwt.InvalidTokenError, ValueError:
        return None
