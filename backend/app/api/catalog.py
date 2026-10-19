import uuid

import yaml
from fastapi import APIRouter
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import AdminDep, RuntimeDep, SessionDep, UserDep, audit
from app.errors import ApiError, not_found
from app.models import (
    CatalogColumn,
    CatalogTable,
    Connection,
    DescriptionSource,
    SemanticLayerRow,
)
from app.schemas import ErrorCode
from app.schemas.catalog import (
    ColumnOut,
    ColumnPatch,
    DescriptionPatch,
    SemanticLayerIn,
    SemanticLayerOut,
    TableDetail,
    TableSummary,
)
from app.semantic.loader import get_layer_yaml, parse_layer, save_layer
from app.workers.catalog_sync import column_embedding_text, table_embedding_text

router = APIRouter(tags=["catalog"])


async def _default_connection(session: AsyncSession) -> uuid.UUID:
    # ponytail: one target connection in v1 (no user DBs); add ?connection_id when needed.
    conn_id = await session.scalar(select(Connection.id).order_by(Connection.created_at).limit(1))
    if conn_id is None:
        raise not_found("Connection")
    return conn_id


def _summary(t: CatalogTable, n_cols: int) -> TableSummary:
    return TableSummary(
        id=t.id,
        schema_name=t.schema,
        name=t.name,
        row_count=t.row_count,
        description=t.description,
        description_source=t.description_source,
        column_count=n_cols,
    )


def _column(c: CatalogColumn) -> ColumnOut:
    return ColumnOut(
        id=c.id,
        name=c.name,
        data_type=c.data_type,
        semantic_type=c.semantic_type,
        is_pk=c.is_pk,
        fk_ref=c.fk_ref,
        sample_values=c.sample_values or [],
        description=c.description,
        description_source=c.description_source,
    )


async def _detail(session: AsyncSession, table: CatalogTable) -> TableDetail:
    cols = list(
        await session.scalars(
            select(CatalogColumn)
            .where(CatalogColumn.table_id == table.id)
            .order_by(CatalogColumn.is_pk.desc(), CatalogColumn.name)
        )
    )
    return TableDetail(
        **_summary(table, len(cols)).model_dump(), columns=[_column(c) for c in cols]
    )


@router.get("/catalog/tables")
async def list_tables(_: UserDep, session: SessionDep) -> list[TableSummary]:
    conn_id = await _default_connection(session)
    rows = await session.execute(
        select(CatalogTable, func.count(CatalogColumn.id))
        .outerjoin(CatalogColumn, CatalogColumn.table_id == CatalogTable.id)
        .where(CatalogTable.connection_id == conn_id)
        .group_by(CatalogTable.id)
        .order_by(CatalogTable.name)
    )
    return [_summary(t, n) for t, n in rows.all()]


@router.get("/catalog/tables/{table_id}")
async def get_table(table_id: uuid.UUID, _: UserDep, session: SessionDep) -> TableDetail:
    table = await session.get(CatalogTable, table_id)
    if table is None:
        raise not_found("Table")
    return await _detail(session, table)


@router.patch("/catalog/tables/{table_id}")
async def patch_table(
    table_id: uuid.UUID,
    body: DescriptionPatch,
    admin: AdminDep,
    session: SessionDep,
    rt: RuntimeDep,
) -> TableDetail:
    table = await session.get(CatalogTable, table_id)
    if table is None:
        raise not_found("Table")
    table.description = body.description or None
    table.description_source = DescriptionSource.human if body.description else None
    table.embedding = (await rt.embedder.embed_documents([table_embedding_text(table)]))[0]
    audit(session, admin, "catalog.table.edit", table=table.name)
    await session.commit()
    return await _detail(session, table)


@router.patch("/catalog/columns/{column_id}")
async def patch_column(
    column_id: uuid.UUID, body: ColumnPatch, admin: AdminDep, session: SessionDep, rt: RuntimeDep
) -> ColumnOut:
    col = await session.get(CatalogColumn, column_id)
    if col is None:
        raise not_found("Column")
    table = await session.get(CatalogTable, col.table_id)
    assert table is not None  # FK guarantees it
    fields = body.model_fields_set
    if "description" in fields:
        col.description = body.description or None
        # Clearing a description hands it back to the next sync's LLM draft.
        col.description_source = DescriptionSource.human if body.description else None
    if "semantic_type" in fields:
        col.semantic_type = body.semantic_type
    col.embedding = (await rt.embedder.embed_documents([column_embedding_text(table, col)]))[0]
    audit(
        session,
        admin,
        "catalog.column.edit",
        column=f"{table.name}.{col.name}",
        fields=sorted(fields),
    )
    await session.commit()
    return _column(col)


@router.get("/semantic/metrics")
async def get_metrics(_: UserDep, session: SessionDep) -> SemanticLayerOut:
    conn_id = await _default_connection(session)
    text = await get_layer_yaml(session, conn_id)
    row = await session.get(SemanticLayerRow, conn_id)
    await session.commit()  # persists the seed row on first read
    return SemanticLayerOut(
        yaml=text, layer=parse_layer(text), updated_at=row.updated_at if row else None
    )


@router.put("/semantic/metrics")
async def put_metrics(
    body: SemanticLayerIn, admin: AdminDep, session: SessionDep
) -> SemanticLayerOut:
    conn_id = await _default_connection(session)
    try:
        layer = await save_layer(session, conn_id, body.yaml, admin.id)
    except (ValueError, yaml.YAMLError) as e:  # pydantic.ValidationError is a ValueError
        raise ApiError(ErrorCode.INVALID, f"Invalid semantic layer: {e}") from e
    audit(session, admin, "semantic.edit", metrics=len(layer.metrics))
    await session.commit()
    row = await session.get(SemanticLayerRow, conn_id)
    return SemanticLayerOut(yaml=body.yaml, layer=layer, updated_at=row.updated_at if row else None)
