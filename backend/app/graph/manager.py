"""Runs execute as background tasks so a dropped SSE connection doesn't kill them; the client
reconnects by polling GET /runs/{id}. Stop = POST /runs/{id}/cancel."""

import asyncio
import uuid
from collections.abc import AsyncIterator

import structlog
from langgraph.types import Command
from pydantic import BaseModel

from app.graph import results
from app.graph.build import AgentGraph
from app.graph.events import DoneEvent, RunEvent, encode
from app.graph.nodes.common import cancel_key
from app.graph.persist import save_outcome
from app.graph.runner import RunOutcome, stream_run
from app.graph.state import AgentContext, AgentState
from app.runtime import Runtime

log = structlog.get_logger()
Events = asyncio.Queue[BaseModel | None]


class RunManager:
    def __init__(self, rt: Runtime, graph: AgentGraph) -> None:
        self._rt = rt
        self._graph = graph
        self._tasks: dict[str, asyncio.Task[None]] = {}

    def start(
        self,
        run_id: uuid.UUID,
        conversation_id: uuid.UUID,
        ctx: AgentContext,
        start: AgentState | Command[str],
    ) -> Events:
        queue: Events = asyncio.Queue()

        async def pump() -> None:
            try:
                async for event in self._execute(run_id, conversation_id, ctx, start):
                    queue.put_nowait(event)
            finally:
                queue.put_nowait(None)
                self._tasks.pop(str(run_id), None)

        self._tasks[str(run_id)] = asyncio.create_task(pump(), name=f"run:{run_id}")
        return queue

    async def cancel(self, run_id: uuid.UUID) -> None:
        # The flag reaches runs on other API replicas (checked between nodes); the task cancel
        # stops a local run mid-node.
        await self._rt.redis.set(cancel_key(str(run_id)), 1, ex=results.RESULT_TTL_S)
        if task := self._tasks.get(str(run_id)):
            task.cancel()

    async def _execute(
        self,
        run_id: uuid.UUID,
        conversation_id: uuid.UUID,
        ctx: AgentContext,
        start: AgentState | Command[str],
    ) -> AsyncIterator[BaseModel]:
        yield RunEvent(run_id=str(run_id), conversation_id=str(conversation_id))
        outcome = RunOutcome(status="cancelled")
        try:
            async for item in stream_run(self._graph, ctx, str(run_id), start):
                if isinstance(item, RunOutcome):
                    outcome = item
                else:
                    yield item
        except asyncio.CancelledError:
            await asyncio.shield(save_outcome(self._rt, run_id, outcome, ctx.llm.usage))
            raise
        run = await save_outcome(self._rt, run_id, outcome, ctx.llm.usage)
        if outcome.status != "clarifying":
            # Checkpoints only matter while waiting for a clarification answer.
            try:
                await self._graph.checkpointer.adelete_thread(str(run_id))  # type: ignore[union-attr]
            except Exception:  # noqa: BLE001 (cleanup must never fail the run)
                log.warning("agent.checkpoint_cleanup_failed", run_id=str(run_id))
        yield DoneEvent(
            run_id=str(run_id),
            status=outcome.status,
            latency_ms=run.latency_ms or 0,
            cost_usd=float(run.cost_usd),
            trace_id=run.trace_id,
        )


async def drain(queue: Events) -> AsyncIterator[dict[str, str]]:
    while (event := await queue.get()) is not None:
        yield encode(event)
