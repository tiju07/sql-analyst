from enum import StrEnum

from pydantic import BaseModel


class ErrorCode(StrEnum):
    """Fixed error vocabulary shared by HTTP errors and SSE `error` events."""

    RATE_LIMITED = "RATE_LIMITED"
    BUDGET_EXCEEDED = "BUDGET_EXCEEDED"
    BLOCKED_UNSAFE = "BLOCKED_UNSAFE"
    QUERY_TIMEOUT = "QUERY_TIMEOUT"
    NO_ANSWER = "NO_ANSWER"
    UPSTREAM_LLM = "UPSTREAM_LLM"
    INTERNAL = "INTERNAL"
    # HTTP-only codes (never sent over SSE).
    UNAUTHENTICATED = "UNAUTHENTICATED"
    FORBIDDEN = "FORBIDDEN"
    NOT_FOUND = "NOT_FOUND"
    INVALID = "INVALID"


class ErrorBody(BaseModel):
    code: ErrorCode
    message: str
    retry_after_s: int | None = None
