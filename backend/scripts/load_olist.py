"""Load the Olist CSVs into the target DB, then apply the read-only role and RLS.

Usage: python -m scripts.load_olist [--data-dir ../data/olist]
Env: TARGET_ADMIN_DATABASE_URL (schema owner), TARGET_DATABASE_URL (analyst_ro, its password is
reused), RLS_SIGNING_SECRET.
"""

import argparse
import asyncio
import os
import time
from pathlib import Path
from urllib.parse import unquote, urlparse

import asyncpg

SQL_DIR = Path(__file__).parent / "sql"

# (table, csv file, columns in CSV order). Load order respects foreign keys.
CSVS: list[tuple[str, str, list[str]]] = [
    ("customers", "olist_customers_dataset.csv",
     ["customer_id", "customer_unique_id", "customer_zip_code_prefix", "customer_city",
      "customer_state"]),
    ("sellers", "olist_sellers_dataset.csv",
     ["seller_id", "seller_zip_code_prefix", "seller_city", "seller_state"]),
    ("product_category_translation", "product_category_name_translation.csv",
     ["product_category_name", "product_category_name_english"]),
    ("products", "olist_products_dataset.csv",
     ["product_id", "product_category_name", "product_name_length", "product_description_length",
      "product_photos_qty", "product_weight_g", "product_length_cm", "product_height_cm",
      "product_width_cm"]),
    ("geolocation", "olist_geolocation_dataset.csv",
     ["geolocation_zip_code_prefix", "geolocation_lat", "geolocation_lng", "geolocation_city",
      "geolocation_state"]),
    ("orders", "olist_orders_dataset.csv",
     ["order_id", "customer_id", "order_status", "order_purchase_timestamp", "order_approved_at",
      "order_delivered_carrier_date", "order_delivered_customer_date",
      "order_estimated_delivery_date"]),
    ("order_items", "olist_order_items_dataset.csv",
     ["order_id", "order_item_id", "product_id", "seller_id", "shipping_limit_date", "price",
      "freight_value"]),
    ("order_payments", "olist_order_payments_dataset.csv",
     ["order_id", "payment_sequential", "payment_type", "payment_installments", "payment_value"]),
    ("order_reviews", "olist_order_reviews_dataset.csv",
     ["review_id", "order_id", "review_score", "review_comment_title", "review_comment_message",
      "review_creation_date", "review_answer_timestamp"]),
]  # fmt: skip


def quote_literal(value: str) -> str:
    # Utility statements (ALTER ROLE ... PASSWORD) can't take bind parameters.
    return "'" + value.replace("'", "''") + "'"


async def apply_schema(conn: asyncpg.Connection) -> None:
    await conn.execute((SQL_DIR / "olist_schema.sql").read_text())


async def apply_security(conn: asyncpg.Connection, ro_password: str, signing_key: str) -> None:
    sql = (SQL_DIR / "olist_security.sql").read_text()
    sql = sql.replace("{ro_password}", quote_literal(ro_password))
    sql = sql.replace("{signing_key}", quote_literal(signing_key))
    await conn.execute(sql)


async def load(conn: asyncpg.Connection, data_dir: Path) -> None:
    missing = [f for _, f, _ in CSVS if not (data_dir / f).is_file()]
    if missing:
        raise SystemExit(f"Missing CSVs in {data_dir}: {', '.join(missing)}")
    for table, filename, columns in CSVS:
        t0 = time.perf_counter()
        status = await conn.copy_to_table(
            table,
            source=data_dir / filename,
            schema_name="olist",
            columns=columns,
            format="csv",
            header=True,
        )
        print(
            f"  {table:<30} {status.removeprefix('COPY '):>9} rows  {time.perf_counter() - t0:.1f}s"
        )


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=Path("../data/olist"))
    args = parser.parse_args()

    ro_url = urlparse(os.environ["TARGET_DATABASE_URL"])
    if ro_url.username != "analyst_ro" or not ro_url.password:
        raise SystemExit("TARGET_DATABASE_URL must connect as analyst_ro with a password")

    conn = await asyncpg.connect(os.environ["TARGET_ADMIN_DATABASE_URL"])
    try:
        async with conn.transaction():
            print("Creating schema olist and loading CSVs")
            await apply_schema(conn)
            await load(conn, args.data_dir)
            print("Applying analyst_ro role and row-level security")
            await apply_security(conn, unquote(ro_url.password), os.environ["RLS_SIGNING_SECRET"])
        await conn.execute("ANALYZE")
    finally:
        await conn.close()
    print("Done")


if __name__ == "__main__":
    asyncio.run(main())
