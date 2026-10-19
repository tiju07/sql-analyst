import uuid

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.deps import SessionDep, UserDep
from app.errors import not_found
from app.graph.persist import run_out
from app.models import Connection, Conversation, QueryRun, User
from app.schemas.runs import ConversationDetail, ConversationIn, ConversationOut

router = APIRouter(prefix="/conversations", tags=["conversations"])


async def _own(session: SessionDep, conv_id: uuid.UUID, user: User) -> Conversation:
    conv = await session.get(Conversation, conv_id)
    if conv is None or conv.user_id != user.id:
        raise not_found("Conversation")
    return conv


def _out(c: Conversation) -> ConversationOut:
    return ConversationOut(id=c.id, title=c.title, created_at=c.created_at, updated_at=c.updated_at)


@router.get("")
async def list_conversations(
    user: UserDep, session: SessionDep, q: str | None = Query(None, max_length=100)
) -> list[ConversationOut]:
    stmt = select(Conversation).where(Conversation.user_id == user.id)
    if q:
        stmt = stmt.where(
            Conversation.title.ilike(f"%{q.replace('%', r'\%').replace('_', r'\_')}%")
        )
    rows = await session.scalars(stmt.order_by(Conversation.updated_at.desc()).limit(200))
    return [_out(c) for c in rows]


@router.post("", status_code=201)
async def create_conversation(
    body: ConversationIn, user: UserDep, session: SessionDep
) -> ConversationOut:
    connection_id = await session.scalar(select(Connection.id).order_by(Connection.created_at))
    if connection_id is None:
        raise not_found("Connection")
    conv = Conversation(user_id=user.id, connection_id=connection_id, title=body.title)
    session.add(conv)
    await session.commit()
    await session.refresh(conv)
    return _out(conv)


@router.get("/{conv_id}")
async def get_conversation(
    conv_id: uuid.UUID, user: UserDep, session: SessionDep
) -> ConversationDetail:
    conv = await _own(session, conv_id, user)
    runs = await session.scalars(
        select(QueryRun).where(QueryRun.conversation_id == conv.id).order_by(QueryRun.created_at)
    )
    return ConversationDetail(**_out(conv).model_dump(), runs=[run_out(r) for r in runs])


@router.patch("/{conv_id}")
async def rename_conversation(
    conv_id: uuid.UUID, body: ConversationIn, user: UserDep, session: SessionDep
) -> ConversationOut:
    conv = await _own(session, conv_id, user)
    conv.title = body.title
    await session.commit()
    await session.refresh(conv)
    return _out(conv)


@router.delete("/{conv_id}", status_code=204)
async def delete_conversation(conv_id: uuid.UUID, user: UserDep, session: SessionDep) -> None:
    await session.delete(await _own(session, conv_id, user))
    await session.commit()
