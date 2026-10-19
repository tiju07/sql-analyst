"""Token-bucket rate limiting in Redis. One Lua script = atomic check-and-take across workers."""

from dataclasses import dataclass

from redis.asyncio import Redis

# KEYS[1] bucket; ARGV capacity, refill tokens/sec, cost. Uses the server clock (TIME).
_LUA = """
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local t = redis.call('TIME')
local now = t[1] * 1000 + math.floor(t[2] / 1000)
local b = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(b[1]) or capacity
local ts = tonumber(b[2]) or now
tokens = math.min(capacity, tokens + (now - ts) / 1000 * rate)
local allowed = 0
local retry_ms = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
else
  retry_ms = math.ceil((cost - tokens) / rate * 1000)
end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', KEYS[1], math.ceil(capacity / rate * 1000) + 1000)
return {allowed, retry_ms}
"""


@dataclass(frozen=True)
class RateResult:
    allowed: bool
    retry_after_s: int


class RateLimiter:
    def __init__(self, redis: Redis) -> None:
        self._script = redis.register_script(_LUA)

    async def hit(self, key: str, *, per_minute: int, cost: int = 1) -> RateResult:
        allowed, retry_ms = await self._script(
            keys=[f"rl:{key}"], args=[per_minute, per_minute / 60, cost]
        )
        return RateResult(bool(allowed), -(-int(retry_ms) // 1000))
