"""Write a run's outcome to query_runs (rows stay in Redis)."""

import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import func, update

from app.graph.runner import RunOutcome
from app.llm.client import Usage
from app.metrics import LLM_COST, LLM_TOKENS, RUN_LATENCY, RUNS
from app.models import Conversation, QueryRun, RunStatus
from app.runtime import Runtime
from app.schemas.runs import RunOut

_CANDIDATE_KEYS = (
    "index", "sql", "safe_sql", "status", "repairs", "attempts", "assumptions", "row_count",
    "result_hash",
)  # fmt: skip


def run_out(run: QueryRun) -> RunOut:
    return RunOut.model_validate(
        {
            **{c: getattr(run, c) for c in RunOut.model_fields if hasattr(run, c)},
            "candidates": run.candidates or [],
            "caveats": run.caveats or [],
            "stage_timings": run.stage_timings or {},
            "cost_usd": float(run.cost_usd),
        }
    )


async def save_outcome(
    rt: Runtime, run_id: uuid.UUID, outcome: RunOutcome, usage: Usage
) -> QueryRun:
    v: dict[str, Any] = outcome.values
    chosen = next((c for c in v.get("candidates", []) if c["index"] == v.get("chosen")), None)
    ctx = v.get("context")
    async with rt.sessions() as session:
        run = await session.get(QueryRun, run_id)
        assert run is not None
        run.status = RunStatus(outcome.status)
        run.clarification = v.get("clarification")
        run.candidates = [
            {k: c.get(k) for k in _CANDIDATE_KEYS} for c in v.get("candidates", [])
        ] or run.candidates
        run.chosen_sql = chosen.get("safe_sql") if chosen else None
        run.chart_spec = v.get("chart")
        run.summary = v.get("summary")
        run.caveats = v.get("caveats")
        run.rows_returned = chosen.get("row_count") if chosen else None
        # A clarified run spans two requests: latency, tokens and cost accumulate.
        run.latency_ms = (run.latency_ms or 0) + outcome.latency_ms
        run.stage_timings = v.get("timings") or run.stage_timings
        run.input_tokens += usage.input_tokens + usage.cache_read_tokens + usage.cache_write_tokens
        run.output_tokens += usage.output_tokens
        run.cost_usd = Decimal(run.cost_usd) + Decimal(str(round(usage.cost_usd, 6)))
        run.error_code = outcome.error["code"] if outcome.error else None
        run.error_message = outcome.error["message"] if outcome.error else None
        run.trace_id = outcome.trace_id or run.trace_id
        if ctx:
            keep = ("tables", "metrics", "values", "fewshot", "notes", "schema_block")
            run.context = {k: ctx[k] for k in keep} | {"columns": v.get("result_columns", [])}
        await session.execute(
            update(Conversation)
            .where(Conversation.id == run.conversation_id)
            .values(updated_at=func.now())
        )
        await session.commit()
        await session.refresh(run)

    RUNS.labels(outcome.status).inc()
    if outcome.status != "clarifying":
        RUN_LATENCY.observe(run.latency_ms / 1000)
    LLM_COST.inc(usage.cost_usd)
    LLM_TOKENS.labels("input").inc(usage.input_tokens)
    LLM_TOKENS.labels("output").inc(usage.output_tokens)
    return run
