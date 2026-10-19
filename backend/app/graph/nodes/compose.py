import json
from typing import Any

import structlog
from langgraph.runtime import Runtime as LGRuntime

from app.graph import results
from app.graph.compose_rules import choose_chart
from app.graph.events import ColumnOut, SummaryEvent
from app.graph.llm_models import CompositionOut
from app.graph.nodes.common import data_block, prompt, question_block, stage
from app.graph.state import AgentContext, AgentState
from app.llm.client import LLMError

log = structlog.get_logger()
SAMPLE_ROWS = 30
MAX_CAVEATS = 4


def fallback_composition(state: AgentState, row_count: int) -> CompositionOut:
    return CompositionOut(
        title=state["question"][:80],
        summary=f"The query returned {row_count:,} row{'s' if row_count != 1 else ''}.",
        caveats=[],
    )


@stage("compose")
async def compose(state: AgentState, *, runtime: LGRuntime[AgentContext]) -> dict[str, Any]:
    ctx = runtime.context
    chosen = next(c for c in state["candidates"] if c["index"] == state["chosen"])
    payload = await results.load(ctx.redis, results.rows_key(state["run_id"]))
    assert payload is not None
    columns = [ColumnOut.model_validate(c) for c in payload["columns"]]
    rows: list[list[Any]] = payload["rows"]

    done = [c for c in state["candidates"] if c["status"] in ("ok", "empty")]
    agreeing = sum(1 for c in done if c.get("result_hash") == chosen.get("result_hash"))
    facts = [
        f"Rows returned: {len(rows):,}"
        + (" (truncated at the row limit)" if chosen.get("truncated") else ""),
        f"Columns: {', '.join(f'{c.name} ({c.semantic_type or c.type})' for c in columns)}",
        f"Assumptions made when writing the SQL: {'; '.join(chosen['assumptions']) or 'none'}",
    ]
    sample = json.dumps(rows[:SAMPLE_ROWS], ensure_ascii=False, default=str)
    try:
        comp = await ctx.llm.structured(
            purpose="compose",
            model=ctx.config.model_fast,
            system=prompt("compose"),
            context=None,
            prompt="\n\n".join(
                [
                    question_block(state),
                    f"SQL:\n{chosen['safe_sql']}",
                    *facts,
                    data_block("data", sample),
                ]
            ),
            schema=CompositionOut,
            max_tokens=1500,
            effort="low",
        )
    except LLMError as e:
        # The answer (SQL + rows + chart) is already useful; don't fail the run over prose.
        log.warning("compose.llm_failed", run_id=state["run_id"], error=str(e))
        comp = fallback_composition(state, len(rows))

    caveats = [c.strip() for c in comp.caveats if c.strip()][:MAX_CAVEATS]
    if chosen.get("truncated"):
        caveats.append(f"Only the first {len(rows):,} rows were returned.")
    if len(done) > 1 and agreeing < len(done):
        caveats.append(
            f"{agreeing} of {len(done)} candidate queries agreed on this result; "
            "check the SQL tab if the numbers look off."
        )
    chart = choose_chart(columns, rows, comp.title.strip() or state["question"][:80])
    runtime.stream_writer(chart)
    runtime.stream_writer(SummaryEvent(text=comp.summary, caveats=caveats))
    return {"chart": chart.model_dump(), "summary": comp.summary, "caveats": caveats}
