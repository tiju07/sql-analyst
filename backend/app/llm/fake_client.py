"""Deterministic, offline LLM for tests, CI and e2e (FAKE_LLM=true). Never used in production.

Responses come from per-schema responders registered next to the schemas that need them, so this
module doesn't grow a dependency on every node.
"""

from collections.abc import Callable

from pydantic import BaseModel

from app.llm.client import Effort, LLMError, LLMResult, Usage

Responder = Callable[[str, str | None, str], BaseModel]
_RESPONDERS: dict[type[BaseModel], Responder] = {}


def responder[S: BaseModel](
    schema: type[S],
) -> Callable[[Callable[[str, str | None, str], S]], Callable[[str, str | None, str], S]]:
    """Register `fn(system, context, prompt) -> schema instance` for FakeLLM."""

    def register(fn: Callable[[str, str | None, str], S]) -> Callable[[str, str | None, str], S]:
        _RESPONDERS[schema] = fn
        return fn

    return register


class FakeLLM:
    def __init__(self) -> None:
        self.calls: list[tuple[str, type[BaseModel], str]] = []  # (model, schema, prompt)

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
        self.calls.append((model, schema, prompt))
        fn = _RESPONDERS.get(schema)
        if fn is None:
            raise LLMError(f"FakeLLM has no responder for {schema.__name__}", retryable=False)
        value = fn(system, context, prompt)
        assert isinstance(value, schema)
        # Token counts are a rough length proxy so usage code paths still run; it costs nothing.
        tokens_in = (len(system) + len(context or "") + len(prompt)) // 4
        tokens_out = len(value.model_dump_json()) // 4
        return LLMResult(value, Usage(tokens_in, tokens_out), model)
