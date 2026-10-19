"""USD per million tokens. Source: Anthropic pricing as of 2026-10 (cache write = 5-minute TTL)."""

from dataclasses import dataclass

import structlog

log = structlog.get_logger()


@dataclass(frozen=True)
class Price:
    input: float
    output: float
    cache_read: float
    cache_write: float


PRICES: dict[str, Price] = {
    # Haiku 5.5 doubles in price above 100K prompt tokens; our prompts stay far below that.
    "claude-haiku-5-5": Price(0.10, 0.50, 0.01, 0.125),
    "claude-sonnet-5-5": Price(2.00, 10.00, 0.20, 2.50),
    # Possible server-side refusal-fallback targets, so their cost is still counted.
    "claude-opus-5-5": Price(4.00, 20.00, 0.20, 5.00),
    "claude-opus-5": Price(5.00, 25.00, 0.50, 6.25),
}


def cost_usd(
    model: str, *, input_tokens: int, output_tokens: int, cache_read: int = 0, cache_write: int = 0
) -> float:
    price = PRICES.get(model)
    if price is None:
        # ponytail: unknown (self-hosted) models count as free; add a PRICES entry to budget them.
        log.warning("llm.unpriced_model", model=model)
        return 0.0
    return (
        input_tokens * price.input
        + output_tokens * price.output
        + cache_read * price.cache_read
        + cache_write * price.cache_write
    ) / 1_000_000
