"""Provider-neutral LLM interface: one structured-output call shape for every node."""

from dataclasses import dataclass
from typing import Literal, Protocol

from pydantic import BaseModel

from app.llm.pricing import cost_usd

Effort = Literal["low", "medium", "high"]


class LLMError(Exception):
    def __init__(self, message: str, *, retryable: bool) -> None:
        super().__init__(message)
        self.retryable = retryable


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    cost_usd: float = 0.0

    def __iadd__(self, other: Usage) -> Usage:
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens
        self.cache_read_tokens += other.cache_read_tokens
        self.cache_write_tokens += other.cache_write_tokens
        self.cost_usd += other.cost_usd
        return self

    @classmethod
    def priced(
        cls, model: str, input_tokens: int, output_tokens: int, cache_read: int, cache_write: int
    ) -> Usage:
        return cls(
            input_tokens,
            output_tokens,
            cache_read,
            cache_write,
            cost_usd(
                model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cache_read=cache_read,
                cache_write=cache_write,
            ),
        )


@dataclass
class LLMResult[T: BaseModel]:
    value: T
    usage: Usage
    model: str  # the model that actually answered (may differ after a refusal fallback)


class LLMClient(Protocol):
    async def structured[T: BaseModel](
        self,
        *,
        model: str,
        system: str,
        context: str | None,
        prompt: str,
        schema: type[T],
        max_tokens: int = 4096,
        effort: Effort = "medium",
    ) -> LLMResult[T]:
        """`system` + `context` form the cacheable prefix; keep both byte-stable across calls."""
        ...
