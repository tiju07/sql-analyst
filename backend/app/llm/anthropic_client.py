import anthropic
from pydantic import BaseModel

from app.llm.client import Effort, LLMError, LLMResult, Usage

# Models that accept server-side refusal fallback; Haiku has none.
_FALLBACK_MODELS = frozenset({"claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5"})
_FALLBACK_BETA = "server-side-fallback-2026-07-01"


class AnthropicClient:
    def __init__(self, api_key: str | None, timeout_s: float = 60.0) -> None:
        # api_key=None lets the SDK resolve ANTHROPIC_API_KEY / an `ant auth login` profile.
        self._client = anthropic.AsyncAnthropic(api_key=api_key, timeout=timeout_s, max_retries=2)

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
        blocks: list[anthropic.types.beta.BetaTextBlockParam] = [{"type": "text", "text": system}]
        if context:
            blocks.append({"type": "text", "text": context})
        # One breakpoint after the stable prefix (system prompt + schema block).
        blocks[-1]["cache_control"] = {"type": "ephemeral"}
        fallback = model in _FALLBACK_MODELS
        try:
            resp = await self._client.beta.messages.parse(
                model=model,
                max_tokens=max_tokens,
                system=blocks,
                messages=[{"role": "user", "content": prompt}],
                output_format=schema,
                output_config={"effort": effort},
                betas=[_FALLBACK_BETA] if fallback else anthropic.omit,
                fallbacks="default" if fallback else anthropic.omit,
            )
        except TypeError as e:
            # The SDK raises TypeError when it finds no API key, auth token or profile.
            raise LLMError("Anthropic credentials are not configured.", retryable=False) from e
        except (anthropic.RateLimitError, anthropic.APIConnectionError) as e:
            raise LLMError(f"LLM unavailable: {e}", retryable=True) from e
        except anthropic.APIStatusError as e:
            raise LLMError(
                f"LLM error {e.status_code}: {e.message}", retryable=e.status_code >= 500
            ) from e

        u = resp.usage
        usage = Usage.priced(
            resp.model,
            u.input_tokens,
            u.output_tokens,
            u.cache_read_input_tokens or 0,
            u.cache_creation_input_tokens or 0,
        )
        if resp.stop_reason == "refusal":
            raise LLMError("The model declined this request.", retryable=False)
        if resp.stop_reason == "max_tokens" or resp.parsed_output is None:
            raise LLMError("The model returned an incomplete answer.", retryable=True)
        return LLMResult(resp.parsed_output, usage, resp.model)
