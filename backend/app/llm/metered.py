"""Every agent LLM call goes through here: budget checks, usage totals, spend, OTel spans."""

from opentelemetry import trace
from pydantic import BaseModel
from redis.asyncio import Redis

from app.budget import budget_left, record_spend
from app.llm.client import Effort, LLMClient, Usage

tracer = trace.get_tracer("sql_analyst.llm")


class BudgetExceeded(Exception):
    def __init__(self, scope: str) -> None:
        super().__init__(scope)
        self.scope = scope  # "daily" or "run"


class MeteredLLM:
    def __init__(
        self,
        inner: LLMClient,
        redis: Redis,
        *,
        daily_budget_usd: float,
        run_token_cap: int,
        provider: str,
    ) -> None:
        self._inner = inner
        self._redis = redis
        self._daily = daily_budget_usd
        self._cap = run_token_cap
        self._provider = provider
        self.usage = Usage()

    async def structured[T: BaseModel](
        self,
        *,
        purpose: str,
        model: str,
        system: str,
        context: str | None,
        prompt: str,
        schema: type[T],
        max_tokens: int = 4096,
        effort: Effort = "medium",
        attempt: int = 0,
    ) -> T:
        if self.usage.input_tokens + self.usage.output_tokens >= self._cap:
            raise BudgetExceeded("run")
        if not await budget_left(self._redis, self._daily):
            raise BudgetExceeded("daily")
        with tracer.start_as_current_span(f"chat {model}") as span:
            span.set_attributes(
                {
                    "gen_ai.operation.name": "chat",
                    "gen_ai.provider.name": self._provider,
                    "gen_ai.request.model": model,
                    "gen_ai.request.max_tokens": max_tokens,
                    "sql_analyst.purpose": purpose,
                    "sql_analyst.attempt": attempt,
                }
            )
            result = await self._inner.structured(
                model=model,
                system=system,
                context=context,
                prompt=prompt,
                schema=schema,
                max_tokens=max_tokens,
                effort=effort,
            )
            u = result.usage
            span.set_attributes(
                {
                    "gen_ai.response.model": result.model,
                    "gen_ai.usage.input_tokens": u.input_tokens,
                    "gen_ai.usage.output_tokens": u.output_tokens,
                    "gen_ai.usage.cache_read.input_tokens": u.cache_read_tokens,
                    "gen_ai.usage.cache_creation.input_tokens": u.cache_write_tokens,
                    "sql_analyst.cost_usd": u.cost_usd,
                }
            )
        self.usage += u
        await record_spend(self._redis, u.cost_usd)
        return result.value
