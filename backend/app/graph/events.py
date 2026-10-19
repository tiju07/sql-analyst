"""SSE event contract: `event:` name + JSON `data:`. Frontend types are generated from these."""

from typing import Literal

from pydantic import BaseModel

from app.graph.state import Stage
from app.schemas import ErrorCode

ChartMark = Literal["bar", "line", "area", "scatter", "pie", "table", "kpi"]
ValueFormat = Literal["currency_brl", "percent", "count", "number", "date"]
RunStatus = Literal["running", "clarifying", "ok", "repaired", "failed", "blocked", "cancelled"]


class RunEvent(BaseModel):
    run_id: str
    conversation_id: str


class StageEvent(BaseModel):
    stage: Stage
    status: Literal["start", "end"]
    ms: int | None = None


class ClarifyEvent(BaseModel):
    question: str
    options: list[str]


class SqlEvent(BaseModel):
    sql: str
    attempt: int
    candidate_index: int


class ColumnOut(BaseModel):
    name: str
    type: str
    semantic_type: ValueFormat | None


class RowsEvent(BaseModel):
    columns: list[ColumnOut]
    rows: list[list[object]]
    row_count: int
    truncated: bool


class ChartSpec(BaseModel):
    mark: ChartMark
    x: str | None = None
    y: str | None = None
    series: str | None = None
    title: str
    y_format: ValueFormat | None = None
    x_format: ValueFormat | None = None


class SummaryEvent(BaseModel):
    text: str
    caveats: list[str]


class DoneEvent(BaseModel):
    run_id: str
    status: RunStatus
    latency_ms: int
    cost_usd: float
    trace_id: str | None


class ErrorEvent(BaseModel):
    code: ErrorCode
    message: str
    retryable: bool


EVENT_NAMES: dict[type[BaseModel], str] = {
    RunEvent: "run",
    StageEvent: "stage",
    ClarifyEvent: "clarify",
    SqlEvent: "sql",
    RowsEvent: "rows",
    ChartSpec: "chart",
    SummaryEvent: "summary",
    DoneEvent: "done",
    ErrorEvent: "error",
}


def encode(event: BaseModel) -> dict[str, str]:
    """For sse-starlette: {"event": name, "data": json}."""
    return {"event": EVENT_NAMES[type(event)], "data": event.model_dump_json()}
