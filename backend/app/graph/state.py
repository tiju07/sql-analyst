"""Agent state (checkpointed, so JSON-friendly only) and per-run context (live objects)."""

import uuid
from dataclasses import dataclass, field
from typing import Literal, NotRequired, TypedDict

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.llm.metered import MeteredLLM
from app.retrieval.embeddings import Embedder
from app.sql.dialects import Dialect
from app.sql.executor import Executor

Stage = Literal[
    "retrieve", "clarify", "generate", "guard", "execute", "repair", "select", "compose"
]
CandidateStatus = Literal[
    "pending_guard",  # new or repaired SQL waiting for the guard
    "pending_exec",  # guard passed
    "needs_repair",  # parse error, unknown table, DB error, or empty result
    "ok",  # rows returned
    "empty",  # still empty after all repairs: accepted as a real "no rows" answer
    "blocked",  # unsafe; never repaired
    "failed",  # timeout or out of repairs
]


class Turn(TypedDict):
    question: str
    sql: str | None
    summary: str | None


AttemptKind = Literal["parse_error", "unknown_table", "db_error", "empty", "timeout", "unsafe"]


class Attempt(TypedDict):
    sql: str
    error: str | None
    kind: AttemptKind | None


class Candidate(TypedDict):
    index: int
    sql: str  # latest SQL (as written by the model)
    safe_sql: NotRequired[str]  # guard-rendered SQL that actually runs
    limited: NotRequired[bool]
    tables_used: list[str]
    assumptions: list[str]
    status: CandidateStatus
    repairs: int
    attempts: list[Attempt]
    result_hash: NotRequired[str]
    row_count: NotRequired[int]
    truncated: NotRequired[bool]
    columns: NotRequired[list[dict[str, str | None]]]


class Clarification(TypedDict):
    question: str
    options: list[str]
    answer: NotRequired[str]


class RetrievedContext(TypedDict):
    schema_block: str  # the full cacheable context: schema DDL, metrics, notes, values, examples
    tables: list[str]  # linked tables shown to the model
    allowed_tables: list[str]  # every catalogued table (the guard's allow-list)
    metrics: list[str]
    metric_types: dict[str, str]
    values: list[dict[str, str | float]]
    fewshot: list[dict[str, str]]
    notes: list[str]


class AgentError(TypedDict):
    code: str
    message: str
    retryable: bool


class AgentState(TypedDict):
    run_id: str
    question: str
    hint: NotRequired[str | None]  # BIRD "evidence"; never set by the app
    history: list[Turn]
    allowed_states: list[str] | None
    context: NotRequired[RetrievedContext]
    clarification: NotRequired[Clarification | None]
    candidates: NotRequired[list[Candidate]]
    chosen: NotRequired[int | None]
    result_columns: NotRequired[list[dict[str, str | None]]]  # name/type/semantic_type
    chart: NotRequired[dict[str, object] | None]
    summary: NotRequired[str | None]
    caveats: NotRequired[list[str]]
    timings: NotRequired[dict[str, int]]
    error: NotRequired[AgentError | None]


@dataclass(frozen=True)
class AgentConfig:
    """Feature switches; the defaults are the product, the eval ablations turn pieces off."""

    schema_linking: bool = True
    value_retrieval: bool = True
    few_shot: bool = True
    clarify: bool = True
    n_candidates: int = 3
    max_repairs: int = 2
    row_limit: int = 1000
    statement_timeout_ms: int = 10_000
    explain_cost_limit: float | None = None
    model_sql: str = "claude-sonnet-5-5"
    model_fast: str = "claude-haiku-5-5"
    effort_sql: Literal["low", "medium", "high"] = "medium"


@dataclass
class AgentContext:
    """Live dependencies for one run, passed as LangGraph runtime context (never checkpointed)."""

    connection_id: uuid.UUID
    dialect: Dialect
    default_schema: str | None
    executor: Executor
    sessions: async_sessionmaker[AsyncSession]
    redis: Redis
    llm: MeteredLLM
    embedder: Embedder
    config: AgentConfig = field(default_factory=AgentConfig)
