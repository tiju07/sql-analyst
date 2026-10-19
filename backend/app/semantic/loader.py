"""The semantic layer is YAML. semantic/metrics.yaml seeds semantic_layers once per connection;
after that the DB row is the source of truth (admin edits) and semantic_metrics mirrors it."""

import uuid
from pathlib import Path

import yaml
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Connection, SemanticLayerRow, SemanticMetric
from app.semantic.models import SemanticLayer

METRICS_PATH = Path(__file__).resolve().parents[2] / "semantic" / "metrics.yaml"


def parse_layer(text: str) -> SemanticLayer:
    return SemanticLayer.model_validate(yaml.safe_load(text))


# Only the demo connection ships a semantic layer; others (e.g. BIRD databases) start empty.
SEEDED_CONNECTION = "olist"
EMPTY_LAYER = "metrics: []\n"


async def get_layer_yaml(session: AsyncSession, connection_id: uuid.UUID) -> str:
    """Current YAML for a connection, seeding the demo connection from the bundled file."""
    row = await session.get(SemanticLayerRow, connection_id)
    if row is not None:
        return row.yaml
    conn = await session.get(Connection, connection_id)
    if conn is None or conn.name != SEEDED_CONNECTION:
        return EMPTY_LAYER
    row = SemanticLayerRow(connection_id=connection_id, yaml=METRICS_PATH.read_text())
    session.add(row)
    await session.flush()
    return row.yaml


async def get_layer(session: AsyncSession, connection_id: uuid.UUID) -> SemanticLayer:
    return parse_layer(await get_layer_yaml(session, connection_id))


async def save_layer(
    session: AsyncSession, connection_id: uuid.UUID, text: str, user_id: uuid.UUID
) -> SemanticLayer:
    layer = parse_layer(text)  # raises on invalid YAML/schema before anything is written
    row = await session.scalar(
        select(SemanticLayerRow).where(SemanticLayerRow.connection_id == connection_id)
    )
    if row is None:
        session.add(SemanticLayerRow(connection_id=connection_id, yaml=text, updated_by=user_id))
    else:
        row.yaml, row.updated_by = text, user_id
    await sync_metrics(session, connection_id, layer)
    return layer


async def sync_metrics(
    session: AsyncSession, connection_id: uuid.UUID, layer: SemanticLayer
) -> None:
    await session.execute(
        delete(SemanticMetric).where(
            SemanticMetric.connection_id == connection_id,
            SemanticMetric.name.not_in([m.name for m in layer.metrics]),
        )
    )
    if not layer.metrics:
        return
    stmt = insert(SemanticMetric).values(
        [
            {
                "connection_id": connection_id,
                "name": m.name,
                "sql_expr": m.sql_expr,
                "synonyms": m.synonyms,
                "description": m.description,
            }
            for m in layer.metrics
        ]
    )
    await session.execute(
        stmt.on_conflict_do_update(
            index_elements=[SemanticMetric.connection_id, SemanticMetric.name],
            set_={c: stmt.excluded[c] for c in ("sql_expr", "synonyms", "description")},
        )
    )
