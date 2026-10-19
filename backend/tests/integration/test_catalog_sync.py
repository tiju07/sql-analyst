import pytest
from sqlalchemy import func, select

from app.models import CatalogColumn, CatalogTable, CatalogValue, Connection, DescriptionSource
from app.retrieval.value_index import lookup_values
from app.runtime import Runtime
from app.semantic.loader import get_layer
from app.workers.catalog_sync import sync_catalog

pytestmark = pytest.mark.integration


async def _conn_id(rt: Runtime):  # type: ignore[no-untyped-def]
    async with rt.sessions() as s:
        return await s.scalar(select(Connection.id))


async def test_sync_builds_catalog(rt: Runtime) -> None:
    async with rt.sessions() as s:
        tables = {t.name: t for t in await s.scalars(select(CatalogTable))}
        assert {"customers", "orders", "order_items", "sellers"} <= tables.keys()
        orders = tables["orders"]
        assert orders.description_source == DescriptionSource.llm
        assert orders.embedding is not None
        cols = {
            c.name: c
            for c in await s.scalars(
                select(CatalogColumn).where(CatalogColumn.table_id == orders.id)
            )
        }
        assert cols["order_id"].is_pk
        assert cols["customer_id"].fk_ref == "olist.customers.customer_id"
        assert cols["order_purchase_timestamp"].semantic_type == "date"
        assert cols["order_status"].sample_values[:2] == ["delivered", "shipped"]
        n_values = await s.scalar(select(func.count(CatalogValue.id)))
        assert n_values and n_values > 0
        layer = await get_layer(s, orders.connection_id)
        assert any(m.name == "revenue" for m in layer.metrics)


async def test_resync_preserves_human_descriptions(rt: Runtime) -> None:
    async with rt.sessions() as s:
        table = await s.scalar(select(CatalogTable).where(CatalogTable.name == "sellers"))
        assert table is not None
        table.description = "Marketplace merchants."
        table.description_source = DescriptionSource.human
        await s.commit()
    report = await sync_catalog(rt, await _conn_id(rt))
    assert report.described_tables == 0  # nothing left to draft
    async with rt.sessions() as s:
        table = await s.scalar(select(CatalogTable).where(CatalogTable.name == "sellers"))
        assert table is not None
        assert table.description == "Marketplace merchants."
        assert table.description_source == DescriptionSource.human


async def test_value_lookup_finds_literals(rt: Runtime) -> None:
    async with rt.sessions() as s:
        matches = await lookup_values(s, await _conn_id(rt), "How many orders from Campinas?")
    assert any(m.value == "campinas" and m.column == "customer_city" for m in matches)
