import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from langgraph.types import Command
from sqlalchemy import select
from sse_starlette.sse import EventSourceResponse

from app.budget import budget_left
from app.deps import LimiterDep, RuntimeDep, SessionDep, UserDep, rate_limit
from app.errors import ApiError, not_found
from app.graph.context import agent_context
from app.graph.manager import RunManager, drain
from app.graph.state import AgentState, Turn
from app.models import Connection, Conversation, QueryRun, RunStatus, User
from app.schemas import ErrorCode
from app.schemas.runs import ChatIn, ClarifyIn

router = APIRouter(tags=["chat"])
HISTORY_TURNS = 4
SSE_HEADERS = {"Cache-Control": "no-store", "X-Accel-Buffering": "no"}
SSE_RESPONSE: dict[int | str, dict[str, Any]] = {
    200: {"content": {"text/event-stream": {}}, "description": "SSE stream"}
}


def get_manager(request: Request) -> RunManager:
    manager: RunManager = request.app.state.runs
    return manager


ManagerDep = Annotated[RunManager, Depends(get_manager)]


async def _admit(user: User, rt: RuntimeDep, limiter: LimiterDep) -> None:
    await rate_limit(limiter, f"chat:{user.id}", per_minute=rt.settings.rate_limit_per_min)
    if not await budget_left(rt.redis, rt.settings.daily_llm_budget_usd):
        raise ApiError(
            ErrorCode.BUDGET_EXCEEDED, "The demo has reached today's AI budget. Back tomorrow."
        )


@router.post("/chat", response_class=EventSourceResponse, responses=SSE_RESPONSE)
async def chat(
    body: ChatIn,
    user: UserDep,
    session: SessionDep,
    rt: RuntimeDep,
    limiter: LimiterDep,
    manager: ManagerDep,
) -> EventSourceResponse:
    await _admit(user, rt, limiter)
    if body.conversation_id:
        conv = await session.get(Conversation, body.conversation_id)
        if conv is None or conv.user_id != user.id:
            raise not_found("Conversation")
    else:
        connection_id = await session.scalar(select(Connection.id).order_by(Connection.created_at))
        if connection_id is None:
            raise not_found("Connection")
        conv = Conversation(user_id=user.id, connection_id=connection_id, title=body.question[:80])
        session.add(conv)
        await session.flush()

    previous = await session.scalars(
        select(QueryRun)
        .where(QueryRun.conversation_id == conv.id)
        .where(QueryRun.status.in_([RunStatus.ok, RunStatus.repaired]))
        .order_by(QueryRun.created_at.desc())
        .limit(HISTORY_TURNS)
    )
    history = [Turn(question=r.question, sql=r.chosen_sql, summary=r.summary) for r in previous][
        ::-1
    ]
    run = QueryRun(
        conversation_id=conv.id, user_id=user.id, question=body.question, status=RunStatus.running
    )
    session.add(run)
    await session.commit()

    start = AgentState(
        run_id=str(run.id),
        question=body.question,
        history=history,
        allowed_states=user.allowed_states,
    )
    queue = manager.start(run.id, conv.id, agent_context(rt, conv.connection_id), start)
    return EventSourceResponse(drain(queue), ping=15, headers=SSE_HEADERS)


@router.post("/runs/{run_id}/clarify", response_class=EventSourceResponse, responses=SSE_RESPONSE)
async def clarify(
    run_id: uuid.UUID,
    body: ClarifyIn,
    user: UserDep,
    session: SessionDep,
    rt: RuntimeDep,
    limiter: LimiterDep,
    manager: ManagerDep,
) -> EventSourceResponse:
    run = await session.get(QueryRun, run_id)
    if run is None or run.user_id != user.id:
        raise not_found("Run")
    if run.status != RunStatus.clarifying:
        raise ApiError(ErrorCode.INVALID, "This question isn't waiting for a clarification.")
    await _admit(user, rt, limiter)
    conv = await session.get(Conversation, run.conversation_id)
    assert conv is not None
    run.status = RunStatus.running
    await session.commit()
    queue = manager.start(
        run.id, conv.id, agent_context(rt, conv.connection_id), Command(resume=body.answer)
    )
    return EventSourceResponse(drain(queue), ping=15, headers=SSE_HEADERS)
