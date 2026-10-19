import pytest

from app.ratelimit import RateLimiter
from app.runtime import Runtime

pytestmark = pytest.mark.integration


async def test_token_bucket(rt: Runtime) -> None:
    limiter = RateLimiter(rt.redis)
    results = [await limiter.hit("t:bucket", per_minute=3) for _ in range(4)]
    assert [r.allowed for r in results] == [True, True, True, False]
    assert results[-1].retry_after_s == 20  # one token refills every 60/3 seconds
    other = await limiter.hit("t:other", per_minute=3)
    assert other.allowed
