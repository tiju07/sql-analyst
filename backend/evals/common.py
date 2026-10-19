"""Shared eval plumbing: ablation configs, LLM record/replay, runtime setup."""

import dataclasses
import hashlib
import json
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel

from app.graph.state import AgentConfig
from app.llm.client import Effort, LLMClient, LLMError, LLMResult, Usage

EVALS_DIR = Path(__file__).parent
RESULTS_DIR = EVALS_DIR / "results"
LlmMode = Literal["real", "record", "replay"]


@dataclass(frozen=True)
class Ablation:
    id: str
    label: str
    overrides: dict[str, Any]

    def config(self, base: AgentConfig) -> AgentConfig:
        return dataclasses.replace(base, clarify=False, **self.overrides)


def load_ablations(path: Path = EVALS_DIR / "ablations.yaml") -> list[Ablation]:
    raw = yaml.safe_load(path.read_text())["ablations"]
    return [
        Ablation(a["id"], a["label"], {k: v for k, v in a.items() if k not in ("id", "label")})
        for a in raw
    ]


def call_key(model: str, system: str, context: str | None, prompt: str, schema: str) -> str:
    blob = json.dumps([model, system, context, prompt, schema], ensure_ascii=False)
    return hashlib.sha256(blob.encode()).hexdigest()


class RecordingLLM:
    """`record`: call the real model and append every response to a JSONL file.
    `replay`: answer only from that file, so CI never calls a paid API."""

    def __init__(
        self, inner: LLMClient | None, path: Path, mode: Literal["record", "replay"]
    ) -> None:
        self._inner = inner
        self._path = path
        self._mode = mode
        self._store: dict[str, dict[str, Any]] = {}
        if path.exists():
            for line in path.read_text().splitlines():
                rec = json.loads(line)
                self._store[rec["key"]] = rec

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
        key = call_key(model, system, context, prompt, schema.__name__)
        if key in self._store:
            rec = self._store[key]
            return LLMResult(
                schema.model_validate(rec["value"]), Usage(**rec["usage"]), rec["model"]
            )
        if self._mode == "replay" or self._inner is None:
            raise LLMError(
                f"No recorded response for {schema.__name__} call {key[:12]}", retryable=False
            )
        result = await self._inner.structured(
            model=model, system=system, context=context, prompt=prompt, schema=schema,
            max_tokens=max_tokens, effort=effort,
        )  # fmt: skip
        rec = {
            "key": key,
            "model": result.model,
            "value": result.value.model_dump(mode="json"),
            "usage": dataclasses.asdict(result.usage),
        }
        self._store[key] = rec
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._path.open("a") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        return result


def percentile(values: Sequence[float], p: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    k = (len(s) - 1) * p
    lo, hi = int(k), min(int(k) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)
