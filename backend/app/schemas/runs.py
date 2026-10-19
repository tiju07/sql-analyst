import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.graph.events import ChartSpec, ColumnOut, RunStatus

QUESTION_MAX = 1000


class ChatIn(BaseModel):
    conversation_id: uuid.UUID | None = None
    question: str = Field(min_length=1, max_length=QUESTION_MAX)


class ClarifyIn(BaseModel):
    answer: str = Field(min_length=1, max_length=500)


class AttemptOut(BaseModel):
    sql: str
    error: str | None
    kind: str | None


class CandidateOut(BaseModel):
    index: int
    sql: str
    safe_sql: str | None = None
    status: str
    repairs: int
    attempts: list[AttemptOut]
    assumptions: list[str]
    row_count: int | None = None
    result_hash: str | None = None


class ClarificationOut(BaseModel):
    question: str
    options: list[str]
    answer: str | None = None


class ContextOut(BaseModel):
    tables: list[str] = []
    metrics: list[str] = []
    values: list[dict[str, Any]] = []
    fewshot: list[dict[str, str]] = []
    notes: list[str] = []
    schema_block: str = ""
    columns: list[ColumnOut] = []


class RunOut(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    question: str
    status: RunStatus
    clarification: ClarificationOut | None
    candidates: list[CandidateOut]
    chosen_sql: str | None
    chart_spec: ChartSpec | None
    summary: str | None
    caveats: list[str]
    rows_returned: int | None
    latency_ms: int | None
    stage_timings: dict[str, int]
    input_tokens: int
    output_tokens: int
    cost_usd: float
    error_code: str | None
    error_message: str | None
    trace_id: str | None
    context: ContextOut | None
    created_at: datetime


class RowsPage(BaseModel):
    columns: list[ColumnOut]
    rows: list[list[Any]]
    offset: int
    row_count: int
    truncated: bool


class ConversationOut(BaseModel):
    id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime


class ConversationDetail(ConversationOut):
    runs: list[RunOut]


class ConversationIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
