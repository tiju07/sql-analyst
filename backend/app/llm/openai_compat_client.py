"""OpenAI-compatible chat completions (OpenAI, Azure OpenAI, vLLM, an LLM gateway via base_url)."""

import openai
from pydantic import BaseModel, ValidationError

from app.llm.client import Effort, LLMError, LLMResult, Usage


class OpenAICompatClient:
    def __init__(
        self, base_url: str | None, api_key: str | None, model_override: str | None
    ) -> None:
        self._client = openai.AsyncOpenAI(base_url=base_url, api_key=api_key, timeout=60.0)
        # Self-hosted backends usually serve one model; route every call to it when set.
        self._model_override = model_override

    async def structured[T: BaseModel](
        self,
        *,
        model: str,
        system: str,
        context: str | None,
        prompt: str,
        schema: type[T],
        max_tokens: int = 4096,
        effort: Effort = "medium",  # no portable equivalent; ignored
    ) -> LLMResult[T]:
        model = self._model_override or model
        system_text = f"{system}\n\n{context}" if context else system
        try:
            resp = await self._client.chat.completions.create(
                model=model,
                max_tokens=max_tokens,
                messages=[
                    {"role": "system", "content": system_text},
                    {"role": "user", "content": prompt},
                ],
                # json_schema is the most widely supported structured-output form (vLLM, Azure).
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": schema.__name__,
                        "schema": schema.model_json_schema(),
                        "strict": True,
                    },
                },
            )
        except (openai.RateLimitError, openai.APIConnectionError) as e:
            raise LLMError(f"LLM unavailable: {e}", retryable=True) from e
        except openai.APIStatusError as e:
            raise LLMError(
                f"LLM error {e.status_code}: {e.message}", retryable=e.status_code >= 500
            ) from e

        u = resp.usage
        cached = (
            (u.prompt_tokens_details.cached_tokens or 0) if u and u.prompt_tokens_details else 0
        )
        usage = Usage.priced(
            resp.model,
            (u.prompt_tokens - cached) if u else 0,
            u.completion_tokens if u else 0,
            cached,
            0,
        )
        content = resp.choices[0].message.content if resp.choices else None
        if not content:
            raise LLMError("The model returned an empty answer.", retryable=True)
        try:
            return LLMResult(schema.model_validate_json(content), usage, resp.model)
        except ValidationError as e:
            raise LLMError(f"The model returned malformed output: {e}", retryable=True) from e
