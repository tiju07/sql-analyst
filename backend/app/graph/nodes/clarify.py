from typing import Any

from langgraph.runtime import Runtime as LGRuntime
from langgraph.types import interrupt

from app.graph.llm_models import ClarificationOut
from app.graph.nodes.common import prompt, question_block, stage
from app.graph.state import AgentContext, AgentState, Clarification

MAX_OPTIONS = 4


@stage("clarify")
async def clarify(state: AgentState, *, runtime: LGRuntime[AgentContext]) -> dict[str, Any]:
    ctx = runtime.context
    if not ctx.config.clarify or state.get("clarification"):
        return {}
    out = await ctx.llm.structured(
        purpose="clarify",
        model=ctx.config.model_fast,
        system=prompt("clarify"),
        context=state["context"]["schema_block"],
        prompt=question_block(state),
        schema=ClarificationOut,
        max_tokens=1000,
        effort="low",
    )
    options = [o.strip() for o in out.options if o.strip()][:MAX_OPTIONS]
    if not out.is_ambiguous or not out.question.strip() or len(options) < 2:
        return {"clarification": None}
    return {"clarification": Clarification(question=out.question.strip(), options=options)}


async def ask(state: AgentState) -> dict[str, Any]:
    """Pause for the user's answer. Kept separate from `clarify` because LangGraph re-runs the
    whole node on resume; here that re-run is free, in `clarify` it would repeat an LLM call."""
    clar = state.get("clarification")
    assert clar is not None
    answer = interrupt({"question": clar["question"], "options": clar["options"]})
    return {"clarification": {**clar, "answer": str(answer)[:500]}}


def needs_answer(state: AgentState) -> bool:
    clar = state.get("clarification")
    return clar is not None and "answer" not in clar
