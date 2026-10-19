import time
from collections.abc import Awaitable, Callable
from functools import wraps
from pathlib import Path
from typing import Any, Protocol

from langgraph.runtime import Runtime as LGRuntime
from opentelemetry import trace

from app.graph.events import StageEvent
from app.graph.state import AgentContext, AgentState, Stage
from app.sql.dialects import Dialect

tracer = trace.get_tracer("sql_analyst.graph")
PROMPTS = Path(__file__).parents[2] / "llm" / "prompts"
DIALECT_NAMES = {Dialect.postgres: "PostgreSQL", Dialect.sqlite: "SQLite"}


class Node(Protocol):
    def __call__(
        self, state: AgentState, *, runtime: LGRuntime[AgentContext]
    ) -> Awaitable[dict[str, Any]]: ...


class RunCancelled(Exception):
    pass


def prompt(name: str) -> str:
    return (PROMPTS / f"{name}.md").read_text()


def cancel_key(run_id: str) -> str:
    return f"cancel:{run_id}"


def stage(name: Stage) -> Callable[[Node], Node]:
    """Cancel check, stage start/end events, timing (summed across repair rounds), OTel span."""

    def deco(fn: Node) -> Node:
        @wraps(fn)
        async def wrapper(state: AgentState, *, runtime: LGRuntime[AgentContext]) -> dict[str, Any]:
            if await runtime.context.redis.exists(cancel_key(state["run_id"])):
                raise RunCancelled
            runtime.stream_writer(StageEvent(stage=name, status="start"))
            t0 = time.perf_counter()
            with tracer.start_as_current_span(f"node {name}") as span:
                span.set_attribute("sql_analyst.run_id", state["run_id"])
                update = await fn(state, runtime=runtime)
            ms = round((time.perf_counter() - t0) * 1000)
            runtime.stream_writer(StageEvent(stage=name, status="end", ms=ms))
            timings = dict(state.get("timings") or {})
            timings[name] = timings.get(name, 0) + ms
            return {**update, "timings": timings}

        return wrapper

    return deco


def data_block(tag: str, body: str) -> str:
    return f"<{tag}>\n{body}\n</{tag}>"


def question_block(state: AgentState) -> str:
    """The per-run, uncached part of every prompt: history, question, hint, clarification."""
    out = []
    if state["history"]:
        turns = "\n\n".join(
            f"User asked: {t['question']}\nSQL used:\n{t['sql'] or '(none)'}\n"
            f"Answer given: {t['summary'] or '(none)'}"
            for t in state["history"]
        )
        out.append(data_block("history", turns))
    out.append(f"Question: {state['question']}")
    if hint := state.get("hint"):
        out.append(f"Hint from the question author: {hint}")
    clar = state.get("clarification")
    if clar and clar.get("answer"):
        out.append(f"Clarification asked: {clar['question']}\nUser answered: {clar['answer']}")
    return "\n\n".join(out)
