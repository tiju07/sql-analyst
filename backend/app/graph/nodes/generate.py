import asyncio
from typing import Any

from langgraph.runtime import Runtime as LGRuntime

from app.graph.events import SqlEvent
from app.graph.llm_models import SqlCandidateOut
from app.graph.nodes.common import DIALECT_NAMES, prompt, question_block, stage
from app.graph.state import AgentContext, AgentState, Candidate
from app.llm.client import LLMError
from app.llm.metered import BudgetExceeded

# Sonnet 5.5 rejects non-default temperature, so diversity comes from the instruction. It sits
# after the cached prefix (system + context), so all candidates share one cache entry.
VARIANTS = [
    "Write the most direct query that answers the question.",
    "Plan the joins first: name the grain of each table, then build the query with CTEs that "
    "aggregate before joining.",
    "Start from the metric definitions and the exact filters the question implies; state every "
    "filter you add as an assumption.",
]


def sql_system(ctx: AgentContext) -> str:
    return prompt("sql_system").replace("{dialect}", DIALECT_NAMES[ctx.dialect])


async def write_sql(
    ctx: AgentContext, state: AgentState, instruction: str, *, purpose: str, attempt: int
) -> SqlCandidateOut:
    return await ctx.llm.structured(
        purpose=purpose,
        model=ctx.config.model_sql,
        system=sql_system(ctx),
        context=state["context"]["schema_block"],
        prompt=f"{question_block(state)}\n\n{instruction}",
        schema=SqlCandidateOut,
        max_tokens=8000,
        effort=ctx.config.effort_sql,
        attempt=attempt,
    )


@stage("generate")
async def generate(state: AgentState, *, runtime: LGRuntime[AgentContext]) -> dict[str, Any]:
    ctx = runtime.context
    n = max(1, min(ctx.config.n_candidates, len(VARIANTS)))
    results = await asyncio.gather(
        *(write_sql(ctx, state, VARIANTS[i], purpose="generate", attempt=0) for i in range(n)),
        return_exceptions=True,
    )
    for r in results:
        if isinstance(r, BudgetExceeded):
            raise r
    errors = [r for r in results if isinstance(r, BaseException)]
    ok = [(i, r) for i, r in enumerate(results) if isinstance(r, SqlCandidateOut)]
    if not ok:
        first = errors[0]
        if isinstance(first, LLMError):
            raise first
        raise LLMError(f"SQL generation failed: {first!r}", retryable=True) from first
    candidates: list[Candidate] = []
    for i, out in ok:
        runtime.stream_writer(SqlEvent(sql=out.sql, attempt=0, candidate_index=i))
        candidates.append(
            Candidate(
                index=i,
                sql=out.sql,
                tables_used=out.tables_used,
                assumptions=out.assumptions,
                status="pending_guard",
                repairs=0,
                attempts=[],
            )
        )
    return {"candidates": candidates}
