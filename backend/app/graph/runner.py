"""Drive one agent run (or a resume after clarification) and translate it into SSE events."""

import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, cast

import structlog
from langchain_core.runnables import RunnableConfig
from langgraph.types import Command, StreamMode
from opentelemetry import trace
from pydantic import BaseModel

from app.graph.build import AgentGraph
from app.graph.events import ClarifyEvent, ErrorEvent, RunStatus
from app.graph.nodes.common import RunCancelled
from app.graph.state import AgentContext, AgentError, AgentState
from app.llm.client import LLMError
from app.llm.metered import BudgetExceeded
from app.schemas import ErrorCode

log = structlog.get_logger()
tracer = trace.get_tracer("sql_analyst.agent")


@dataclass
class RunOutcome:
    status: RunStatus
    values: dict[str, Any] = field(default_factory=dict)
    error: AgentError | None = None
    latency_ms: int = 0
    trace_id: str | None = None


def final_status(values: dict[str, Any], interrupted: bool) -> RunStatus:
    if interrupted:
        return "clarifying"
    if values.get("error"):
        return "blocked" if values["error"]["code"] == ErrorCode.BLOCKED_UNSAFE else "failed"
    chosen = next((c for c in values["candidates"] if c["index"] == values.get("chosen")), None)
    return "repaired" if chosen and chosen["repairs"] else "ok"


def _error(code: ErrorCode, message: str, retryable: bool) -> AgentError:
    return AgentError(code=code, message=message, retryable=retryable)


async def stream_run(
    graph: AgentGraph, ctx: AgentContext, run_id: str, start: AgentState | Command[str]
) -> AsyncIterator[BaseModel | RunOutcome]:
    """Yields event models as they happen, then exactly one RunOutcome (last)."""
    config: RunnableConfig = {"configurable": {"thread_id": run_id}}
    modes: list[StreamMode] = ["custom", "updates"]
    t0 = time.perf_counter()
    outcome = RunOutcome(status="failed")
    with tracer.start_as_current_span("agent.run") as span:
        span.set_attribute("sql_analyst.run_id", run_id)
        sc = span.get_span_context()
        outcome.trace_id = format(sc.trace_id, "032x") if sc.is_valid else None
        try:
            async for item in graph.astream(start, config, context=ctx, stream_mode=modes):
                # With a list of modes LangGraph yields (mode, chunk) pairs.
                mode, chunk = cast(tuple[str, Any], item)
                if mode == "custom":
                    yield chunk
                elif "__interrupt__" in chunk:
                    yield ClarifyEvent.model_validate(chunk["__interrupt__"][0].value)
            snapshot = await graph.aget_state(config)
            outcome.values = dict(snapshot.values)
            outcome.status = final_status(outcome.values, interrupted=bool(snapshot.next))
            outcome.error = outcome.values.get("error")
        except RunCancelled:
            outcome.status = "cancelled"
        except BudgetExceeded as e:
            msg = (
                "The demo has reached today's AI budget. Please come back tomorrow."
                if e.scope == "daily"
                else "This question needed more AI work than one run allows. Try a simpler one."
            )
            outcome.error = _error(ErrorCode.BUDGET_EXCEEDED, msg, retryable=False)
        except LLMError as e:
            outcome.error = _error(
                ErrorCode.UPSTREAM_LLM,
                "The AI service had a problem. Please try again.",
                e.retryable,
            )
        except Exception:
            log.exception("agent.run_failed", run_id=run_id)
            outcome.error = _error(ErrorCode.INTERNAL, "Something went wrong on our side.", True)
        if not outcome.values:
            snapshot = await graph.aget_state(config)
            outcome.values = dict(snapshot.values)
        span.set_attribute("sql_analyst.status", outcome.status)
    outcome.latency_ms = round((time.perf_counter() - t0) * 1000)
    if outcome.error:
        yield ErrorEvent(**outcome.error)
    yield outcome
