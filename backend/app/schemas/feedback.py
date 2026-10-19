import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class FeedbackIn(BaseModel):
    run_id: uuid.UUID
    rating: Literal[-1, 1]
    comment: str | None = Field(default=None, max_length=1000)


class FeedbackOut(BaseModel):
    run_id: uuid.UUID
    rating: int
    comment: str | None


class VerifiedIn(BaseModel):
    run_id: uuid.UUID
    question: str | None = Field(default=None, min_length=1, max_length=1000)


class VerifiedOut(BaseModel):
    id: uuid.UUID
    question: str
    sql: str
    status: Literal["proposed", "approved"]
    proposed_by: str | None
    approved_by: str | None
    created_at: datetime
