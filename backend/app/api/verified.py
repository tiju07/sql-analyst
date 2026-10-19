"""Verified queries: any user proposes a good answer; admins approve; approved ones become
few-shot examples for similar questions."""

import uuid

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.deps import AdminDep, RuntimeDep, SessionDep, UserDep, audit
from app.errors import ApiError, not_found
from app.models import Conversation, QueryRun, RunStatus, User, VerifiedQuery
from app.schemas import ErrorCode
from app.schemas.feedback import VerifiedIn, VerifiedOut

router = APIRouter(prefix="/verified", tags=["verified"])


async def _out(session: SessionDep, v: VerifiedQuery) -> VerifiedOut:
    names = {
        u.id: u.display_name
        for u in await session.scalars(
            select(User).where(User.id.in_([i for i in (v.proposed_by, v.approved_by) if i]))
        )
    }
    return VerifiedOut(
        id=v.id,
        question=v.question,
        sql=v.sql,
        status="approved" if v.approved_by else "proposed",
        proposed_by=names.get(v.proposed_by) if v.proposed_by else None,
        approved_by=names.get(v.approved_by) if v.approved_by else None,
        created_at=v.created_at,
    )


@router.get("")
async def list_verified(
    _: UserDep,
    session: SessionDep,
    status: str | None = Query(None, pattern="^(proposed|approved)$"),
) -> list[VerifiedOut]:
    stmt = select(VerifiedQuery).order_by(VerifiedQuery.created_at.desc())
    if status == "approved":
        stmt = stmt.where(VerifiedQuery.approved_by.is_not(None))
    elif status == "proposed":
        stmt = stmt.where(VerifiedQuery.approved_by.is_(None))
    return [await _out(session, v) for v in await session.scalars(stmt.limit(500))]


@router.post("", status_code=201)
async def propose(
    body: VerifiedIn, user: UserDep, session: SessionDep, rt: RuntimeDep
) -> VerifiedOut:
    run = await session.get(QueryRun, body.run_id)
    if run is None or run.user_id != user.id:
        raise not_found("Run")
    if run.status not in (RunStatus.ok, RunStatus.repaired) or not run.chosen_sql:
        raise ApiError(ErrorCode.INVALID, "Only answered questions can be proposed.")
    conv = await session.get(Conversation, run.conversation_id)
    assert conv is not None
    question = body.question or run.question
    v = VerifiedQuery(
        connection_id=conv.connection_id,
        question=question,
        sql=run.chosen_sql,
        embedding=await rt.embedder.embed_query(question),
        proposed_by=user.id,
    )
    session.add(v)
    audit(session, user, "verified.propose", run_id=str(run.id))
    await session.commit()
    await session.refresh(v)
    return await _out(session, v)


@router.post("/{verified_id}/approve")
async def approve(verified_id: uuid.UUID, admin: AdminDep, session: SessionDep) -> VerifiedOut:
    v = await session.get(VerifiedQuery, verified_id)
    if v is None:
        raise not_found("Verified query")
    v.approved_by = admin.id
    audit(session, admin, "verified.approve", verified_id=str(v.id))
    await session.commit()
    return await _out(session, v)


@router.delete("/{verified_id}", status_code=204)
async def reject(verified_id: uuid.UUID, admin: AdminDep, session: SessionDep) -> None:
    v = await session.get(VerifiedQuery, verified_id)
    if v is None:
        raise not_found("Verified query")
    await session.delete(v)
    audit(session, admin, "verified.reject", verified_id=str(verified_id))
    await session.commit()
