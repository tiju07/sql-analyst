import asyncio
from typing import Any

from langgraph.runtime import Runtime as LGRuntime

from app.graph.events import SqlEvent
from app.graph.nodes.common import stage
from app.graph.nodes.generate import write_sql
from app.graph.state import AgentContext, AgentState, Candidate
from app.llm.client import LLMError

_ADVICE = {
    "parse_error": "Fix the syntax error.",
    "unknown_table": "Use only tables listed in <schema>, qualified exactly as shown.",
    "db_error": "Fix the query so it runs; the database error says what is wrong.",
    "empty": (
        "It ran but returned no rows. Check literal values against <values> and sample values "
        "(exact spelling, case, accents), date ranges against <notes>, and overly strict joins "
        "or filters. If no rows is genuinely the right answer, return the same query."
    ),
}


def repair_instruction(c: Candidate) -> str:
    history = "\n\n".join(
        f"Attempt {n + 1}:\n{a['sql']}\nResult: {a['error']}" for n, a in enumerate(c["attempts"])
    )
    kind = c["attempts"][-1]["kind"] or "db_error"
    return (
        f"Your previous queries for this question failed.\n\n{history}\n\n"
        f"{_ADVICE.get(kind, _ADVICE['db_error'])} Return the corrected query."
    )


@stage("repair")
async def repair(state: AgentState, *, runtime: LGRuntime[AgentContext]) -> dict[str, Any]:
    ctx = runtime.context
    candidates = [c.copy() for c in state["candidates"]]
    todo = [c for c in candidates if c["status"] == "needs_repair"]

    async def fix(c: Candidate) -> None:
        attempt = c["repairs"] + 1
        try:
            out = await write_sql(
                ctx, state, repair_instruction(c), purpose="repair", attempt=attempt
            )
        except LLMError as e:
            c["status"] = "failed"
            c["attempts"] = [*c["attempts"], {"sql": c["sql"], "error": str(e), "kind": None}]
            return
        c["sql"], c["assumptions"], c["repairs"] = out.sql, out.assumptions, attempt
        c["status"] = "pending_guard"
        runtime.stream_writer(SqlEvent(sql=out.sql, attempt=attempt, candidate_index=c["index"]))

    await asyncio.gather(*(fix(c) for c in todo))
    return {"candidates": candidates}
