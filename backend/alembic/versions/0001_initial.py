"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-10-19
"""

import os
from collections.abc import Sequence

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql as pg

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Read directly so migrating doesn't require every app secret; same var as Settings.embedding_dim.
DIM = int(os.environ.get("EMBEDDING_DIM", "384"))

uuid_pk = lambda: sa.Column(  # noqa: E731
    "id", pg.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
)
created = lambda: sa.Column(  # noqa: E731
    "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
)


def fk(
    name: str, target: str, ondelete: str | None = "CASCADE", nullable: bool = False
) -> sa.Column[object]:
    return sa.Column(
        name, pg.UUID(as_uuid=True), sa.ForeignKey(target, ondelete=ondelete), nullable=nullable
    )


def check_in(col: str, values: list[str], name: str) -> sa.CheckConstraint:
    return sa.CheckConstraint(f"{col} IN ({', '.join(repr(v) for v in values)})", name=name)


def tsv() -> sa.Column[object]:
    return sa.Column(
        "search_tsv",
        pg.TSVECTOR,
        sa.Computed(
            "to_tsvector('english', name || ' ' || coalesce(description, ''))", persisted=True
        ),
        nullable=False,
    )


def hnsw(table: str) -> None:
    op.execute(
        f"CREATE INDEX ix_{table}_embedding ON {table} USING hnsw (embedding vector_cosine_ops)"
    )


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_table(
        "users",
        uuid_pk(),
        sa.Column("email", sa.Text, nullable=False, unique=True),
        sa.Column("password_hash", sa.Text),
        sa.Column("display_name", sa.Text, nullable=False),
        sa.Column("role", sa.String(8), nullable=False),
        sa.Column("allowed_states", pg.ARRAY(sa.Text)),
        sa.Column("is_demo", sa.Boolean, nullable=False, server_default=sa.false()),
        created(),
        check_in("role", ["admin", "analyst", "regional"], "user_role"),
    )
    op.create_table(
        "connections",
        uuid_pk(),
        sa.Column("name", sa.Text, nullable=False, unique=True),
        sa.Column("dialect", sa.Text, nullable=False),
        sa.Column("dsn_secret_ref", sa.Text, nullable=False),
        sa.Column("readonly_role", sa.Text, nullable=False),
        created(),
    )
    op.create_table(
        "catalog_tables",
        uuid_pk(),
        fk("connection_id", "connections.id"),
        sa.Column("schema", sa.Text, nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("row_count", sa.BigInteger),
        sa.Column("description", sa.Text),
        sa.Column("description_source", sa.String(5)),
        sa.Column("embedding", Vector(DIM)),
        tsv(),
        check_in("description_source", ["llm", "human"], "description_source"),
        sa.UniqueConstraint(
            "connection_id", "schema", "name", name="uq_catalog_tables_conn_schema_name"
        ),
    )
    op.create_index(
        "ix_catalog_tables_tsv", "catalog_tables", ["search_tsv"], postgresql_using="gin"
    )
    hnsw("catalog_tables")

    op.create_table(
        "catalog_columns",
        uuid_pk(),
        fk("table_id", "catalog_tables.id"),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("data_type", sa.Text, nullable=False),
        sa.Column("semantic_type", sa.Text),
        sa.Column("is_pk", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("fk_ref", sa.Text),
        sa.Column("sample_values", pg.JSONB),
        sa.Column("description", sa.Text),
        sa.Column("description_source", sa.String(5)),
        sa.Column("embedding", Vector(DIM)),
        tsv(),
        check_in("description_source", ["llm", "human"], "description_source"),
        sa.UniqueConstraint("table_id", "name", name="uq_catalog_columns_table_name"),
    )
    op.create_index(
        "ix_catalog_columns_tsv", "catalog_columns", ["search_tsv"], postgresql_using="gin"
    )
    hnsw("catalog_columns")

    op.create_table(
        "catalog_values",
        uuid_pk(),
        fk("column_id", "catalog_columns.id"),
        sa.Column("value", sa.Text, nullable=False),
    )
    op.create_index("ix_catalog_values_column_id", "catalog_values", ["column_id"])
    op.create_index(
        "ix_catalog_values_trgm",
        "catalog_values",
        ["value"],
        postgresql_using="gin",
        postgresql_ops={"value": "gin_trgm_ops"},
    )

    op.create_table(
        "semantic_metrics",
        uuid_pk(),
        fk("connection_id", "connections.id"),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("sql_expr", sa.Text, nullable=False),
        sa.Column("synonyms", pg.ARRAY(sa.Text), nullable=False, server_default="{}"),
        sa.Column("description", sa.Text),
        sa.UniqueConstraint("connection_id", "name", name="uq_semantic_metrics_conn_name"),
    )

    op.create_table(
        "conversations",
        uuid_pk(),
        fk("user_id", "users.id"),
        fk("connection_id", "connections.id", ondelete=None),
        sa.Column("title", sa.Text, nullable=False),
        created(),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ix_conversations_user_updated", "conversations", ["user_id", sa.text("updated_at DESC")]
    )

    op.create_table(
        "query_runs",
        uuid_pk(),
        fk("conversation_id", "conversations.id"),
        fk("user_id", "users.id"),
        sa.Column("question", sa.Text, nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("clarification", pg.JSONB),
        sa.Column("candidates", pg.JSONB),
        sa.Column("chosen_sql", sa.Text),
        sa.Column("chart_spec", pg.JSONB),
        sa.Column("summary", sa.Text),
        sa.Column("caveats", pg.JSONB),
        sa.Column("rows_returned", sa.Integer),
        sa.Column("latency_ms", sa.Integer),
        sa.Column("stage_timings", pg.JSONB),
        sa.Column("input_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("cost_usd", sa.Numeric(12, 6), nullable=False, server_default="0"),
        sa.Column("error_code", sa.Text),
        sa.Column("error_message", sa.Text),
        sa.Column("trace_id", sa.Text),
        created(),
        check_in(
            "status",
            ["running", "clarifying", "ok", "repaired", "failed", "blocked", "cancelled"],
            "run_status",
        ),
    )
    op.create_index("ix_query_runs_conversation_id", "query_runs", ["conversation_id"])
    op.create_index("ix_query_runs_created_at", "query_runs", ["created_at"])

    op.create_table(
        "feedback",
        uuid_pk(),
        fk("run_id", "query_runs.id"),
        fk("user_id", "users.id"),
        sa.Column("rating", sa.SmallInteger, nullable=False),
        sa.Column("comment", sa.Text),
        created(),
        sa.CheckConstraint("rating IN (-1, 1)", name="feedback_rating"),
        sa.UniqueConstraint("run_id", "user_id", name="uq_feedback_run_user"),
    )

    op.create_table(
        "verified_queries",
        uuid_pk(),
        fk("connection_id", "connections.id"),
        sa.Column("question", sa.Text, nullable=False),
        sa.Column("sql", sa.Text, nullable=False),
        sa.Column("embedding", Vector(DIM)),
        fk("proposed_by", "users.id", ondelete="SET NULL", nullable=True),
        fk("approved_by", "users.id", ondelete="SET NULL", nullable=True),
        created(),
    )
    hnsw("verified_queries")

    op.create_table(
        "audit_log",
        sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True),
        fk("user_id", "users.id", ondelete="SET NULL", nullable=True),
        sa.Column("action", sa.Text, nullable=False),
        sa.Column("detail", pg.JSONB),
        created(),
    )


def downgrade() -> None:
    for t in (
        "audit_log",
        "verified_queries",
        "feedback",
        "query_runs",
        "conversations",
        "semantic_metrics",
        "catalog_values",
        "catalog_columns",
        "catalog_tables",
        "connections",
        "users",
    ):
        op.drop_table(t)
