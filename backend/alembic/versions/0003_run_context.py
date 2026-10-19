"""query_runs.context: what the agent retrieved (shown in the Inspector)

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("query_runs", sa.Column("context", pg.JSONB))
    op.create_index("ix_query_runs_user_created", "query_runs", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_query_runs_user_created", "query_runs")
    op.drop_column("query_runs", "context")
