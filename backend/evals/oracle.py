"""An LLM stand-in that answers with the benchmark's gold SQL. It proves the harness end to end
(retrieval, guard re-rendering, execution, predictions file, official scorer) at zero cost:
with it, execution accuracy must be 100% except where a test deliberately breaks a query."""

import re

from pydantic import BaseModel

from app.graph.llm_models import ClarificationOut, CompositionOut, SqlCandidateOut
from app.llm.client import Effort, LLMError, LLMResult, Usage

BROKEN = "SELEC broken FROM"


class OracleLLM:
    def __init__(
        self, gold_by_question: dict[str, str], break_first: frozenset[str] = frozenset()
    ) -> None:
        self._gold = gold_by_question
        self._break_first = break_first

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
        m = re.search(r"^Question: (.*)$", prompt, re.M)
        question = m.group(1) if m else ""
        value: BaseModel
        if schema is SqlCandidateOut:
            if question not in self._gold:
                raise LLMError(f"oracle has no gold SQL for {question!r}", retryable=False)
            repairing = "previous queries for this question failed" in prompt
            sql = (
                BROKEN if question in self._break_first and not repairing else self._gold[question]
            )
            value = SqlCandidateOut(sql=sql, tables_used=[], assumptions=[])
        elif schema is CompositionOut:
            value = CompositionOut(title="Oracle", summary="Oracle answer.", caveats=[])
        elif schema is ClarificationOut:
            value = ClarificationOut(is_ambiguous=False, question="", options=[])
        else:
            raise LLMError(f"oracle can't produce {schema.__name__}", retryable=False)
        assert isinstance(value, schema)
        return LLMResult(value, Usage(100, 50), model)
