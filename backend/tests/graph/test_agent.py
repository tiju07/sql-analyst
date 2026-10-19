"""End-to-end graph runs: fake LLM, real Postgres (fixture data with RLS), in-memory checkpoints."""

import dataclasses
import uuid
from typing import Any

import pytest
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command
from pydantic import BaseModel
from sqlalchemy import select

from app.budget import record_spend
from app.graph import results
from app.graph.build import build_graph
from app.graph.context import agent_context
from app.graph.events import ChartSpec, ClarifyEvent, ErrorEvent, RowsEvent, SqlEvent, StageEvent, SummaryEvent
from app.graph.nodes.common import cancel_key
from app.graph.runner import RunOutcome, stream_run
from app.graph.state import AgentState
from app.models import Connection
from app.runtime import Runtime

pytestmark = pytest.mark.integration

GRAPH = build_graph(InMemorySaver())


async def run(
    rt: Runtime,
    question: str | Command[str],
    *,
    run_id: str | None = None,
    states: list[str] | None = None,
    **config: Any,
) -> tuple[list[BaseModel], RunOutcome]:
    async with rt.sessions() as s:
        conn_id = await s.scalar(select(Connection.id))
    assert conn_id is not None
    ctx = agent_context(rt, conn_id)
    ctx.config = dataclasses.replace(ctx.config, **config)
    run_id = run_id or str(uuid.uuid4())
    start: AgentState | Command[str] = (
        question
        if isinstance(question, Command)
        else AgentState(run_id=run_id, question=question, history=[], allowed_states=states)
    )
    events: list[BaseModel] = []
    outcome: RunOutcome | None = None
    async for item in stream_run(GRAPH, ctx, run_id, start):
        if isinstance(item, RunOutcome):
            outcome = item
        else:
            events.append(item)
    assert outcome is not None
    return events, outcome


def of[T](events: list[BaseModel], kind: type[T]) -> list[T]:
    return [e for e in events if isinstance(e, kind)]


@pytest.fixture(autouse=True)
async def clean_redis(rt: Runtime) -> None:
    await rt.redis.flushdb()


async def test_happy_path_streams_everything(rt: Runtime) -> None:
    events, outcome = await run(rt, "Revenue by state")
    assert outcome.status == "ok", outcome.error
    stages = [(e.stage, e.status) for e in of(events, StageEvent)]
    for name in ("retrieve", "clarify", "generate", "guard", "execute", "select", "compose"):
        assert (name, "start") in stages and (name, "end") in stages
    assert len(of(events, SqlEvent)) == 3
    rows = of(events, RowsEvent)[0]
    assert [c.name for c in rows.columns] == ["customer_state", "revenue"]
    assert rows.columns[1].semantic_type == "currency_brl"
    assert of(events, ChartSpec)[0].mark == "bar"
    assert of(events, SummaryEvent)[0].text
    assert set(outcome.values["timings"]) >= {"retrieve", "generate", "compose"}
    assert outcome.trace_id is None or len(outcome.trace_id) == 32


async def test_rls_scope_applies_to_agent_queries(rt: Runtime) -> None:
    events, outcome = await run(rt, "Revenue by state", states=["SP"])
    assert outcome.status == "ok"
    assert [r[0] for r in of(events, RowsEvent)[0].rows] == ["SP"]


async def test_clarification_interrupt_and_resume(rt: Runtime) -> None:
    run_id = str(uuid.uuid4())
    events, outcome = await run(rt, "What are our best products?", run_id=run_id)
    assert outcome.status == "clarifying"
    ask = of(events, ClarifyEvent)[0]
    assert ask.options == ["Revenue", "Number of orders", "Average review score"]
    assert not of(events, SqlEvent)

    events, outcome = await run(rt, Command(resume="Revenue"), run_id=run_id)
    assert outcome.status == "ok"
    assert outcome.values["clarification"]["answer"] == "Revenue"
    assert "customer_state" in of(events, SqlEvent)[0].sql
    assert not of(events, ClarifyEvent)  # not asked twice


async def test_unsafe_sql_is_blocked_not_repaired(rt: Runtime) -> None:
    events, outcome = await run(rt, "drop the orders table")
    assert outcome.status == "blocked"
    assert of(events, ErrorEvent)[0].code == "BLOCKED_UNSAFE"
    assert all(c["repairs"] == 0 for c in outcome.values["candidates"])
    assert not of(events, RowsEvent)


async def test_db_error_is_repaired(rt: Runtime) -> None:
    events, outcome = await run(rt, "count missing_column values")
    assert outcome.status == "repaired"
    attempts = [s.attempt for s in of(events, SqlEvent)]
    assert 0 in attempts and 1 in attempts
    chosen = outcome.values["candidates"][outcome.values["chosen"]]
    assert 'column "missing_column" does not exist' in chosen["attempts"][0]["error"]


async def test_empty_result_triggers_repair(rt: Runtime) -> None:
    _, outcome = await run(rt, "orders going nowhere")
    assert outcome.status == "repaired"
    assert outcome.values["candidates"][0]["attempts"][0]["kind"] == "empty"


async def test_no_repairs_means_failure(rt: Runtime) -> None:
    events, outcome = await run(rt, "count missing_column values", max_repairs=0)
    assert outcome.status == "failed"
    assert of(events, ErrorEvent)[0].code == "NO_ANSWER"


async def test_single_candidate_and_no_clarify(rt: Runtime) -> None:
    events, outcome = await run(rt, "What are our best products?", n_candidates=1, clarify=False)
    assert outcome.status == "ok"
    assert len(of(events, SqlEvent)) == 1


async def test_results_cached_for_paging(rt: Runtime) -> None:
    run_id = str(uuid.uuid4())
    await run(rt, "Orders by month", run_id=run_id)
    cached = await results.load(rt.redis, results.rows_key(run_id))
    assert cached is not None and cached["row_count"] == len(cached["rows"]) > 0


async def test_cancel_flag_stops_run(rt: Runtime) -> None:
    run_id = str(uuid.uuid4())
    await rt.redis.set(cancel_key(run_id), 1)
    events, outcome = await run(rt, "Revenue by state", run_id=run_id)
    assert outcome.status == "cancelled"
    assert not of(events, StageEvent)


async def test_daily_budget_exceeded(rt: Runtime) -> None:
    await record_spend(rt.redis, rt.settings.daily_llm_budget_usd + 1)
    events, _ = await run(rt, "Revenue by state")
    assert of(events, ErrorEvent)[0].code == "BUDGET_EXCEEDED"


async def test_explain_cost_ceiling_blocks_expensive_queries(rt: Runtime) -> None:
    events, outcome = await run(rt, "Revenue by state", explain_cost_limit=0.01)
    assert outcome.status == "blocked"
    assert "narrowing" in of(events, ErrorEvent)[0].message


async def test_explain_cost_ceiling_allows_cheap_queries(rt: Runtime) -> None:
    _, outcome = await run(rt, "Revenue by state", explain_cost_limit=1e9)
    assert outcome.status == "ok"
