from fastapi import Request
from fastapi.responses import JSONResponse

from app.schemas import ErrorBody, ErrorCode

_STATUS = {
    ErrorCode.UNAUTHENTICATED: 401,
    ErrorCode.FORBIDDEN: 403,
    ErrorCode.NOT_FOUND: 404,
    ErrorCode.INVALID: 422,
    ErrorCode.RATE_LIMITED: 429,
    ErrorCode.BUDGET_EXCEEDED: 503,
    ErrorCode.BLOCKED_UNSAFE: 400,
    ErrorCode.QUERY_TIMEOUT: 504,
    ErrorCode.NO_ANSWER: 422,
    ErrorCode.UPSTREAM_LLM: 502,
    ErrorCode.INTERNAL: 500,
}


class ApiError(Exception):
    def __init__(self, code: ErrorCode, message: str, retry_after_s: int | None = None) -> None:
        super().__init__(message)
        self.body = ErrorBody(code=code, message=message, retry_after_s=retry_after_s)

    @property
    def status(self) -> int:
        return _STATUS[self.body.code]


async def api_error_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ApiError)
    headers = {"Retry-After": str(exc.body.retry_after_s)} if exc.body.retry_after_s else None
    return JSONResponse(exc.body.model_dump(mode="json"), status_code=exc.status, headers=headers)


def not_found(what: str) -> ApiError:
    return ApiError(ErrorCode.NOT_FOUND, f"{what} not found.")
