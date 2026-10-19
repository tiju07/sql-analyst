"""Approved verified queries most similar to the question, used as few-shot examples."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import VerifiedQuery

FEWSHOT_K = 3
# Cosine distance above this means "not about the same thing"; a bad example hurts more than none.
MAX_DISTANCE = 0.6


async def similar_verified(
    session: AsyncSession, connection_id: uuid.UUID, question_vec: list[float], k: int = FEWSHOT_K
) -> list[dict[str, str]]:
    distance = VerifiedQuery.embedding.cosine_distance(question_vec)
    rows = await session.execute(
        select(VerifiedQuery.question, VerifiedQuery.sql, distance)
        .where(VerifiedQuery.connection_id == connection_id)
        .where(VerifiedQuery.approved_by.is_not(None))
        .where(VerifiedQuery.embedding.is_not(None))
        .order_by(distance)
        .limit(k)
    )
    return [{"question": q, "sql": sql} for q, sql, d in rows.all() if d <= MAX_DISTANCE]
