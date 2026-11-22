import type { Schemas } from "@/lib/api/errors"

import aggregates from "./olist-aggregates.json"

/**
 * The data catalog of the demo connection. Table and column names, types and keys come from
 * backend/scripts/sql/olist_schema.sql; row counts from the Olist CSVs (olist-aggregates.json).
 * Descriptions are written for the demo in the style of the catalog sync. Sample values are
 * category-like values only (states, statuses, categories), never ids or personal data.
 */

type Column = Schemas["app__schemas__catalog__ColumnOut"]
type Semantic = Column["semantic_type"]

type ColumnSpec = [
  name: string,
  type: string,
  description: string,
  extra?: { pk?: boolean; fk?: string; semantic?: Semantic; samples?: unknown[] },
]

type TableSpec = {
  name: keyof typeof aggregates.row_counts
  description: string
  source: "llm" | "human"
  columns: ColumnSpec[]
}

const STATES = ["SP", "RJ", "MG", "RS", "PR"]
const CATEGORIES = aggregates.revenue_by_category.slice(0, 4).map(([c]) => c)

const SPECS: TableSpec[] = [
  {
    name: "orders",
    source: "human",
    description: "One row per order, with its status and the purchase, approval and delivery timestamps.",
    columns: [
      ["order_id", "text", "Order identifier (hashed in the public dataset).", { pk: true }],
      [
        "customer_id",
        "text",
        "Customer for this order. Unique per order; see customers.customer_unique_id.",
        { fk: "customers.customer_id" },
      ],
      ["order_status", "text", "Lifecycle status of the order.", { samples: aggregates.order_statuses.slice(0, 4) }],
      [
        "order_purchase_timestamp",
        "timestamp",
        "When the customer placed the order.",
        { semantic: "date", samples: ["2017-11-24 10:12", "2018-05-16 21:40"] },
      ],
      ["order_approved_at", "timestamp", "When payment was approved.", { semantic: "date" }],
      [
        "order_delivered_carrier_date",
        "timestamp",
        "When the seller handed the order to the carrier.",
        { semantic: "date" },
      ],
      [
        "order_delivered_customer_date",
        "timestamp",
        "When the customer received the order. Empty if not delivered.",
        { semantic: "date" },
      ],
      [
        "order_estimated_delivery_date",
        "timestamp",
        "Delivery date promised at purchase. Late means delivered after this.",
        { semantic: "date" },
      ],
    ],
  },
  {
    name: "order_items",
    source: "llm",
    description: "Items within each order: product, seller, price and freight. Revenue is SUM(price).",
    columns: [
      ["order_id", "text", "Order this item belongs to.", { pk: true, fk: "orders.order_id" }],
      [
        "order_item_id",
        "integer",
        "Position of the item within the order, starting at 1.",
        { pk: true, semantic: "count" },
      ],
      ["product_id", "text", "Product sold.", { fk: "products.product_id" }],
      ["seller_id", "text", "Seller who fulfilled the item.", { fk: "sellers.seller_id" }],
      [
        "shipping_limit_date",
        "timestamp",
        "Deadline for the seller to hand the item to the carrier.",
        { semantic: "date" },
      ],
      [
        "price",
        "numeric(10,2)",
        "Item price in BRL, excluding freight.",
        { semantic: "currency_brl", samples: [29.9, 119.0, 54.5] },
      ],
      [
        "freight_value",
        "numeric(10,2)",
        "Freight charged for the item in BRL.",
        { semantic: "currency_brl", samples: [15.1, 8.72, 22.4] },
      ],
    ],
  },
  {
    name: "customers",
    source: "llm",
    description: "Customer location per order. customer_unique_id follows one real customer across orders.",
    columns: [
      ["customer_id", "text", "Customer key used by orders. Different for each order.", { pk: true }],
      ["customer_unique_id", "text", "Stable id of the person across orders. Count this for unique customers."],
      ["customer_zip_code_prefix", "text", "First five digits of the postcode."],
      [
        "customer_city",
        "text",
        "City name, lower case without accents.",
        { samples: aggregates.top_customer_cities.slice(0, 3) },
      ],
      [
        "customer_state",
        "char(2)",
        "Two-letter state code. Row-level security filters on this column.",
        { samples: STATES },
      ],
    ],
  },
  {
    name: "order_payments",
    source: "llm",
    description: "Payments per order. An order can be paid in several parts and instalments.",
    columns: [
      ["order_id", "text", "Order paid.", { pk: true, fk: "orders.order_id" }],
      [
        "payment_sequential",
        "integer",
        "Sequence number when an order has several payments.",
        { pk: true, semantic: "count" },
      ],
      ["payment_type", "text", "Payment method.", { samples: aggregates.payment_share.slice(0, 4).map(([t]) => t) }],
      ["payment_installments", "integer", "Number of instalments chosen.", { semantic: "count", samples: [1, 3, 10] }],
      ["payment_value", "numeric(10,2)", "Amount paid in BRL, including freight.", { semantic: "currency_brl" }],
    ],
  },
  {
    name: "order_reviews",
    source: "llm",
    description: "Customer reviews left after delivery, scored from 1 to 5.",
    columns: [
      ["review_id", "text", "Review identifier.", { pk: true }],
      ["order_id", "text", "Order reviewed.", { pk: true, fk: "orders.order_id" }],
      ["review_score", "smallint", "Score from 1 (worst) to 5 (best).", { semantic: "number", samples: [5, 4, 1] }],
      ["review_comment_title", "text", "Optional title, in Portuguese."],
      ["review_comment_message", "text", "Optional comment, in Portuguese."],
      ["review_creation_date", "timestamp", "When the review survey was sent.", { semantic: "date" }],
      ["review_answer_timestamp", "timestamp", "When the customer answered.", { semantic: "date" }],
    ],
  },
  {
    name: "products",
    source: "llm",
    description: "Product attributes. Category names are in Portuguese; join the translation table for English.",
    columns: [
      ["product_id", "text", "Product identifier.", { pk: true }],
      [
        "product_category_name",
        "text",
        "Category in Portuguese.",
        { fk: "product_category_translation.product_category_name", samples: ["beleza_saude", "cama_mesa_banho"] },
      ],
      ["product_name_length", "integer", "Characters in the product name.", { semantic: "count" }],
      ["product_description_length", "integer", "Characters in the description.", { semantic: "count" }],
      ["product_photos_qty", "integer", "Number of photos.", { semantic: "count" }],
      ["product_weight_g", "integer", "Weight in grams.", { semantic: "number" }],
      ["product_length_cm", "integer", "Length in centimetres.", { semantic: "number" }],
      ["product_height_cm", "integer", "Height in centimetres.", { semantic: "number" }],
      ["product_width_cm", "integer", "Width in centimetres.", { semantic: "number" }],
    ],
  },
  {
    name: "sellers",
    source: "llm",
    description: "Sellers on the marketplace and where they are based.",
    columns: [
      ["seller_id", "text", "Seller identifier.", { pk: true }],
      ["seller_zip_code_prefix", "text", "First five digits of the postcode."],
      ["seller_city", "text", "City name.", { samples: ["sao paulo", "curitiba"] }],
      ["seller_state", "char(2)", "Two-letter state code.", { samples: STATES.slice(0, 3) }],
    ],
  },
  {
    name: "product_category_translation",
    source: "human",
    description: "Maps Portuguese category names to English.",
    columns: [
      ["product_category_name", "text", "Category in Portuguese.", { pk: true }],
      ["product_category_name_english", "text", "Category in English.", { samples: CATEGORIES }],
    ],
  },
  {
    name: "geolocation",
    source: "llm",
    description: "Latitude and longitude by postcode prefix. Several rows per prefix.",
    columns: [
      ["geolocation_id", "bigint", "Surrogate key.", { pk: true }],
      ["geolocation_zip_code_prefix", "text", "First five digits of the postcode."],
      ["geolocation_lat", "double precision", "Latitude.", { semantic: "number" }],
      ["geolocation_lng", "double precision", "Longitude.", { semantic: "number" }],
      ["geolocation_city", "text", "City name.", { samples: ["sao paulo", "rio de janeiro"] }],
      ["geolocation_state", "char(2)", "Two-letter state code.", { samples: STATES.slice(0, 3) }],
    ],
  },
]

/** Stable, readable ids: "t-orders", "c-orders-order_status". */
export const CATALOG: Schemas["TableDetail"][] = SPECS.map((t) => ({
  id: `t-${t.name}`,
  name: t.name,
  schema_name: "olist",
  row_count: aggregates.row_counts[t.name],
  column_count: t.columns.length,
  description: t.description,
  description_source: t.source,
  columns: t.columns.map(([name, type, description, extra]) => ({
    id: `c-${t.name}-${name}`,
    name,
    data_type: type,
    description,
    description_source: t.source,
    is_pk: extra?.pk ?? false,
    fk_ref: extra?.fk ?? null,
    semantic_type: extra?.semantic ?? null,
    sample_values: extra?.samples ?? [],
  })),
}))

export const CONNECTION: Schemas["ConnectionOut"] = {
  id: "conn-olist",
  name: "Olist marketplace (read-only)",
  dialect: "postgresql",
  table_count: CATALOG.length,
}
