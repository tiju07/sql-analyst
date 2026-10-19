"""App DB tables (catalog, runs, users). The target (Olist) DB is not modelled here.

Vector columns are declared without a dimension: the migration sets it from EMBEDDING_DIM.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    ARRAY,
    Computed,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Role(StrEnum):
    admin = "admin"
    analyst = "analyst"
    regional = "regional"


class RunStatus(StrEnum):
    running = "running"
    clarifying = "clarifying"
    ok = "ok"
    repaired = "repaired"
    failed = "failed"
    blocked = "blocked"
    cancelled = "cancelled"


class DescriptionSource(StrEnum):
    llm = "llm"
    human = "human"


def _enum(e: type[StrEnum], name: str) -> Enum:
    # VARCHAR + CHECK instead of a native PG enum: adding a value is a plain migration.
    return Enum(e, name=name, native_enum=False, values_callable=lambda x: [m.value for m in x])


class Base(DeclarativeBase):
    # SQLAlchemy reads this class attribute; it is never mutated.
    type_annotation_map = {dict[str, Any]: JSONB, list[Any]: JSONB, list[str]: ARRAY(Text)}  # noqa: RUF012


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(primary_key=True, default=uuid.uuid4)


class User(TimestampMixin, Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = _uuid_pk()
    email: Mapped[str] = mapped_column(Text, unique=True)
    # Null for demo personas: they can only sign in through /auth/demo/{persona}.
    password_hash: Mapped[str | None] = mapped_column(Text)
    display_name: Mapped[str] = mapped_column(Text)
    role: Mapped[Role] = mapped_column(_enum(Role, "user_role"))
    # Null means all states; RLS still requires an explicit signed "*" at query time.
    allowed_states: Mapped[list[str] | None]
    is_demo: Mapped[bool] = mapped_column(default=False)


class Connection(TimestampMixin, Base):
    __tablename__ = "connections"
    id: Mapped[uuid.UUID] = _uuid_pk()
    name: Mapped[str] = mapped_column(Text, unique=True)
    dialect: Mapped[str] = mapped_column(Text)
    # Name of the env var holding the DSN; DSNs are never stored in the DB.
    dsn_secret_ref: Mapped[str] = mapped_column(Text)
    readonly_role: Mapped[str] = mapped_column(Text)


class CatalogTable(Base):
    __tablename__ = "catalog_tables"
    id: Mapped[uuid.UUID] = _uuid_pk()
    connection_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("connections.id", ondelete="CASCADE")
    )
    schema: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    row_count: Mapped[int | None]
    description: Mapped[str | None] = mapped_column(Text)
    description_source: Mapped[DescriptionSource | None] = mapped_column(
        _enum(DescriptionSource, "description_source")
    )
    embedding: Mapped[list[float] | None] = mapped_column(Vector())
    search_tsv: Mapped[str] = mapped_column(
        TSVECTOR,
        Computed(
            "to_tsvector('english', name || ' ' || coalesce(description, ''))", persisted=True
        ),
    )
    __table_args__ = (
        Index("uq_catalog_tables_conn_schema_name", connection_id, schema, name, unique=True),
        Index("ix_catalog_tables_tsv", search_tsv, postgresql_using="gin"),
    )


class CatalogColumn(Base):
    __tablename__ = "catalog_columns"
    id: Mapped[uuid.UUID] = _uuid_pk()
    table_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("catalog_tables.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(Text)
    data_type: Mapped[str] = mapped_column(Text)
    semantic_type: Mapped[str | None] = mapped_column(Text)
    is_pk: Mapped[bool] = mapped_column(default=False)
    fk_ref: Mapped[str | None] = mapped_column(Text)  # "schema.table.column"
    sample_values: Mapped[list[Any] | None]
    description: Mapped[str | None] = mapped_column(Text)
    description_source: Mapped[DescriptionSource | None] = mapped_column(
        _enum(DescriptionSource, "description_source")
    )
    embedding: Mapped[list[float] | None] = mapped_column(Vector())
    search_tsv: Mapped[str] = mapped_column(
        TSVECTOR,
        Computed(
            "to_tsvector('english', name || ' ' || coalesce(description, ''))", persisted=True
        ),
    )
    __table_args__ = (
        Index("uq_catalog_columns_table_name", table_id, name, unique=True),
        Index("ix_catalog_columns_tsv", search_tsv, postgresql_using="gin"),
    )


class CatalogValue(Base):
    __tablename__ = "catalog_values"
    id: Mapped[uuid.UUID] = _uuid_pk()
    column_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("catalog_columns.id", ondelete="CASCADE"), index=True
    )
    value: Mapped[str] = mapped_column(Text)
    __table_args__ = (
        Index(
            "ix_catalog_values_trgm",
            value,
            postgresql_using="gin",
            postgresql_ops={"value": "gin_trgm_ops"},
        ),
    )


class SemanticMetric(Base):
    __tablename__ = "semantic_metrics"
    id: Mapped[uuid.UUID] = _uuid_pk()
    connection_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("connections.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(Text)
    sql_expr: Mapped[str] = mapped_column(Text)
    synonyms: Mapped[list[str]] = mapped_column(server_default="{}")
    description: Mapped[str | None] = mapped_column(Text)
    __table_args__ = (Index("uq_semantic_metrics_conn_name", connection_id, name, unique=True),)


class Conversation(TimestampMixin, Base):
    __tablename__ = "conversations"
    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    connection_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("connections.id"))
    title: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    __table_args__ = (Index("ix_conversations_user_updated", user_id, updated_at.desc()),)


class QueryRun(TimestampMixin, Base):
    __tablename__ = "query_runs"
    id: Mapped[uuid.UUID] = _uuid_pk()
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    question: Mapped[str] = mapped_column(Text)
    status: Mapped[RunStatus] = mapped_column(_enum(RunStatus, "run_status"))
    clarification: Mapped[dict[str, Any] | None]
    candidates: Mapped[list[Any] | None]
    chosen_sql: Mapped[str | None] = mapped_column(Text)
    chart_spec: Mapped[dict[str, Any] | None]
    summary: Mapped[str | None] = mapped_column(Text)
    caveats: Mapped[list[Any] | None]
    rows_returned: Mapped[int | None]
    latency_ms: Mapped[int | None]
    stage_timings: Mapped[dict[str, Any] | None]
    input_tokens: Mapped[int] = mapped_column(default=0)
    output_tokens: Mapped[int] = mapped_column(default=0)
    cost_usd: Mapped[Decimal] = mapped_column(Numeric(12, 6), default=Decimal(0))
    error_code: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    trace_id: Mapped[str | None] = mapped_column(Text)
    # Daily budget check sums cost_usd by created_at.
    __table_args__ = (Index("ix_query_runs_created_at", "created_at"),)


class Feedback(TimestampMixin, Base):
    __tablename__ = "feedback"
    id: Mapped[uuid.UUID] = _uuid_pk()
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("query_runs.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    rating: Mapped[int] = mapped_column(SmallInteger)  # -1 or 1
    comment: Mapped[str | None] = mapped_column(Text)
    __table_args__ = (Index("uq_feedback_run_user", run_id, user_id, unique=True),)


class VerifiedQuery(TimestampMixin, Base):
    __tablename__ = "verified_queries"
    id: Mapped[uuid.UUID] = _uuid_pk()
    connection_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("connections.id", ondelete="CASCADE")
    )
    question: Mapped[str] = mapped_column(Text)
    sql: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float] | None] = mapped_column(Vector())
    proposed_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )


class AuditLog(TimestampMixin, Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(Text)
    detail: Mapped[dict[str, Any] | None]
