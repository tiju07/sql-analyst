"""Source of truth for golden_set.jsonl. Run to validate every gold query on the real Olist data
(as the schema owner, no RLS) and regenerate the JSONL:

    uv run --env-file ../.env python -m evals.golden.build_golden
"""

import asyncio
import json
import os
from pathlib import Path

import asyncpg

OUT = Path(__file__).parent / "golden_set.jsonl"

# Conventions (from semantic/metrics.yaml): revenue = SUM(order_items.price); GMV adds freight;
# "last quarter" = 2018 Q2 (data thins out after 2018-08); customers = customer_unique_id.
Q2_2018 = "o.order_purchase_timestamp >= '2018-04-01' AND o.order_purchase_timestamp < '2018-07-01'"
ITEMS = "olist.order_items i JOIN olist.orders o ON o.order_id = i.order_id"
ITEMS_CUST = ITEMS + " JOIN olist.customers c ON c.customer_id = o.customer_id"
ITEMS_CAT = (
    ITEMS + " JOIN olist.products p ON p.product_id = i.product_id"
    " LEFT JOIN olist.product_category_translation t ON t.product_category_name = p.product_category_name"
)

CASES: list[dict[str, object]] = [
    # --- revenue and GMV ---------------------------------------------------------------------
    {"id": "rev-01", "category": "revenue", "question": "What is total product revenue across all years?",
     "sql": f"SELECT SUM(i.price) AS revenue FROM {ITEMS}"},
    {"id": "rev-02", "category": "revenue", "question": "What is total GMV including freight?",
     "sql": f"SELECT SUM(i.price + i.freight_value) AS gmv FROM {ITEMS}"},
    {"id": "rev-03", "category": "revenue", "question": "Which 5 states had the highest revenue last quarter?",
     "sql": f"SELECT c.customer_state, SUM(i.price) AS revenue FROM {ITEMS_CUST} WHERE {Q2_2018} GROUP BY c.customer_state ORDER BY revenue DESC LIMIT 5"},
    {"id": "rev-04", "category": "revenue", "question": "Revenue by month in 2017",
     "sql": f"SELECT date_trunc('month', o.order_purchase_timestamp) AS month, SUM(i.price) AS revenue FROM {ITEMS} WHERE o.order_purchase_timestamp >= '2017-01-01' AND o.order_purchase_timestamp < '2018-01-01' GROUP BY 1 ORDER BY 1"},
    {"id": "rev-05", "category": "revenue", "question": "What was revenue in 2018 compared with 2017?",
     "sql": f"SELECT EXTRACT(YEAR FROM o.order_purchase_timestamp) AS year, SUM(i.price) AS revenue FROM {ITEMS} WHERE o.order_purchase_timestamp >= '2017-01-01' AND o.order_purchase_timestamp < '2019-01-01' GROUP BY 1 ORDER BY 1"},
    {"id": "rev-06", "category": "revenue", "question": "Top 10 product categories by revenue, in English",
     "sql": f"SELECT t.product_category_name_english AS category, SUM(i.price) AS revenue FROM {ITEMS_CAT} GROUP BY 1 ORDER BY revenue DESC LIMIT 10"},
    {"id": "rev-07", "category": "revenue", "question": "What share of GMV is freight?",
     "sql": f"SELECT SUM(i.freight_value) / SUM(i.price + i.freight_value) AS freight_share FROM {ITEMS}"},
    {"id": "rev-08", "category": "revenue", "question": "What is the average order value?",
     "sql": f"SELECT SUM(i.price) / COUNT(DISTINCT i.order_id) AS aov FROM {ITEMS}"},
    {"id": "rev-09", "category": "revenue", "question": "Average order value by customer state, highest first",
     "sql": f"SELECT c.customer_state, SUM(i.price) / COUNT(DISTINCT i.order_id) AS aov FROM {ITEMS_CUST} GROUP BY c.customer_state ORDER BY aov DESC"},
    {"id": "rev-10", "category": "revenue", "question": "Which month had the highest revenue ever?",
     "sql": f"SELECT date_trunc('month', o.order_purchase_timestamp) AS month, SUM(i.price) AS revenue FROM {ITEMS} GROUP BY 1 ORDER BY revenue DESC LIMIT 1"},
    {"id": "rev-11", "category": "revenue", "question": "Revenue from São Paulo city customers in 2018",
     "sql": f"SELECT SUM(i.price) AS revenue FROM {ITEMS_CUST} WHERE c.customer_city = 'sao paulo' AND o.order_purchase_timestamp >= '2018-01-01' AND o.order_purchase_timestamp < '2019-01-01'"},
    {"id": "rev-12", "category": "revenue", "question": "Revenue from delivered orders only",
     "sql": f"SELECT SUM(i.price) AS revenue FROM {ITEMS} WHERE o.order_status = 'delivered'"},
    # --- orders ------------------------------------------------------------------------------
    {"id": "ord-01", "category": "orders", "question": "How many orders were placed in total?",
     "sql": "SELECT COUNT(*) AS orders FROM olist.orders"},
    {"id": "ord-02", "category": "orders", "question": "How many orders are in each status?",
     "sql": "SELECT order_status, COUNT(*) AS orders FROM olist.orders GROUP BY order_status ORDER BY orders DESC"},
    {"id": "ord-03", "category": "orders", "question": "Number of orders per month in 2018",
     "sql": "SELECT date_trunc('month', order_purchase_timestamp) AS month, COUNT(*) AS orders FROM olist.orders WHERE order_purchase_timestamp >= '2018-01-01' AND order_purchase_timestamp < '2019-01-01' GROUP BY 1 ORDER BY 1"},
    {"id": "ord-04", "category": "orders", "question": "What share of orders were canceled?",
     "sql": "SELECT AVG(CASE WHEN order_status = 'canceled' THEN 1.0 ELSE 0.0 END) AS canceled_share FROM olist.orders"},
    {"id": "ord-05", "category": "orders", "question": "On which weekday are the most orders placed?",
     "sql": "SELECT to_char(order_purchase_timestamp, 'FMDay') AS weekday, COUNT(*) AS orders FROM olist.orders GROUP BY 1 ORDER BY orders DESC LIMIT 1"},
    {"id": "ord-06", "category": "orders", "question": "Orders by hour of day",
     "sql": "SELECT EXTRACT(HOUR FROM order_purchase_timestamp) AS hour, COUNT(*) AS orders FROM olist.orders GROUP BY 1 ORDER BY 1"},
    {"id": "ord-07", "category": "orders", "question": "How many items does an order contain on average?",
     "sql": "SELECT AVG(n) AS avg_items FROM (SELECT order_id, COUNT(*) AS n FROM olist.order_items GROUP BY order_id) x"},
    {"id": "ord-08", "category": "orders", "question": "How many orders were delivered in 2017?",
     "sql": "SELECT COUNT(*) AS delivered_orders FROM olist.orders WHERE order_status = 'delivered' AND order_purchase_timestamp >= '2017-01-01' AND order_purchase_timestamp < '2018-01-01'"},
    # --- delivery ------------------------------------------------------------------------------
    {"id": "del-01", "category": "delivery", "question": "What is the late delivery rate?",
     "sql": "SELECT AVG(CASE WHEN order_delivered_customer_date > order_estimated_delivery_date THEN 1.0 ELSE 0.0 END) AS late_delivery_rate FROM olist.orders WHERE order_status = 'delivered' AND order_delivered_customer_date IS NOT NULL"},
    {"id": "del-02", "category": "delivery", "question": "Late delivery rate by customer state, worst 5",
     "sql": "SELECT c.customer_state, AVG(CASE WHEN o.order_delivered_customer_date > o.order_estimated_delivery_date THEN 1.0 ELSE 0.0 END) AS late_delivery_rate FROM olist.orders o JOIN olist.customers c ON c.customer_id = o.customer_id WHERE o.order_status = 'delivered' AND o.order_delivered_customer_date IS NOT NULL GROUP BY c.customer_state ORDER BY late_delivery_rate DESC LIMIT 5"},
    {"id": "del-03", "category": "delivery", "question": "Average delivery time in days from purchase to delivery",
     "sql": "SELECT AVG(EXTRACT(EPOCH FROM (order_delivered_customer_date - order_purchase_timestamp)) / 86400) AS avg_days FROM olist.orders WHERE order_status = 'delivered' AND order_delivered_customer_date IS NOT NULL"},
    {"id": "del-04", "category": "delivery", "question": "Average delivery time in days by customer state, slowest first",
     "sql": "SELECT c.customer_state, AVG(EXTRACT(EPOCH FROM (o.order_delivered_customer_date - o.order_purchase_timestamp)) / 86400) AS avg_days FROM olist.orders o JOIN olist.customers c ON c.customer_id = o.customer_id WHERE o.order_status = 'delivered' AND o.order_delivered_customer_date IS NOT NULL GROUP BY c.customer_state ORDER BY avg_days DESC"},
    {"id": "del-05", "category": "delivery", "question": "Late delivery rate by month in 2018",
     "sql": "SELECT date_trunc('month', order_purchase_timestamp) AS month, AVG(CASE WHEN order_delivered_customer_date > order_estimated_delivery_date THEN 1.0 ELSE 0.0 END) AS late_delivery_rate FROM olist.orders WHERE order_status = 'delivered' AND order_delivered_customer_date IS NOT NULL AND order_purchase_timestamp >= '2018-01-01' AND order_purchase_timestamp < '2019-01-01' GROUP BY 1 ORDER BY 1"},
    {"id": "del-06", "category": "delivery", "question": "How many delivered orders arrived more than 10 days late?",
     "sql": "SELECT COUNT(*) AS orders FROM olist.orders WHERE order_status = 'delivered' AND order_delivered_customer_date > order_estimated_delivery_date + INTERVAL '10 days'"},
    {"id": "del-07", "category": "delivery", "question": "Average review score of late versus on-time deliveries",
     "sql": "SELECT (o.order_delivered_customer_date > o.order_estimated_delivery_date) AS late, AVG(r.review_score) AS avg_review_score FROM olist.orders o JOIN olist.order_reviews r ON r.order_id = o.order_id WHERE o.order_status = 'delivered' AND o.order_delivered_customer_date IS NOT NULL GROUP BY 1 ORDER BY 1"},
    {"id": "del-08", "category": "delivery", "question": "Average freight cost per item by customer state, top 5",
     "sql": f"SELECT c.customer_state, AVG(i.freight_value) AS avg_freight FROM {ITEMS_CUST} GROUP BY c.customer_state ORDER BY avg_freight DESC LIMIT 5"},
    # --- reviews -------------------------------------------------------------------------------
    {"id": "rvw-01", "category": "reviews", "question": "What is the average review score?",
     "sql": "SELECT AVG(review_score) AS avg_review_score FROM olist.order_reviews"},
    {"id": "rvw-02", "category": "reviews", "question": "How are review scores distributed?",
     "sql": "SELECT review_score, COUNT(*) AS reviews FROM olist.order_reviews GROUP BY review_score ORDER BY review_score"},
    {"id": "rvw-03", "category": "reviews", "question": "Which 5 product categories have the lowest average review score, with at least 100 reviews?",
     "sql": "SELECT t.product_category_name_english AS category, AVG(r.review_score) AS avg_review_score FROM olist.order_reviews r JOIN olist.order_items i ON i.order_id = r.order_id JOIN olist.products p ON p.product_id = i.product_id LEFT JOIN olist.product_category_translation t ON t.product_category_name = p.product_category_name GROUP BY 1 HAVING COUNT(*) >= 100 ORDER BY avg_review_score ASC LIMIT 5"},
    {"id": "rvw-04", "category": "reviews", "question": "Average review score by month in 2018",
     "sql": "SELECT date_trunc('month', review_creation_date) AS month, AVG(review_score) AS avg_review_score FROM olist.order_reviews WHERE review_creation_date >= '2018-01-01' AND review_creation_date < '2019-01-01' GROUP BY 1 ORDER BY 1"},
    {"id": "rvw-05", "category": "reviews", "question": "What share of reviews have a written comment?",
     "sql": "SELECT AVG(CASE WHEN review_comment_message IS NOT NULL THEN 1.0 ELSE 0.0 END) AS share_with_comment FROM olist.order_reviews"},
    {"id": "rvw-06", "category": "reviews", "question": "What share of reviews are 1-star?",
     "sql": "SELECT AVG(CASE WHEN review_score = 1 THEN 1.0 ELSE 0.0 END) AS one_star_share FROM olist.order_reviews"},
    {"id": "rvw-07", "category": "reviews", "question": "Average review score by customer state, lowest 5",
     "sql": "SELECT c.customer_state, AVG(r.review_score) AS avg_review_score FROM olist.order_reviews r JOIN olist.orders o ON o.order_id = r.order_id JOIN olist.customers c ON c.customer_id = o.customer_id GROUP BY c.customer_state ORDER BY avg_review_score ASC LIMIT 5"},
    # --- payments ------------------------------------------------------------------------------
    {"id": "pay-01", "category": "payments", "question": "What share of payments by value comes from each payment type?",
     "sql": "SELECT payment_type, SUM(payment_value) / (SELECT SUM(payment_value) FROM olist.order_payments) AS share FROM olist.order_payments GROUP BY payment_type ORDER BY share DESC"},
    {"id": "pay-02", "category": "payments", "question": "How many payments were made with each payment type?",
     "sql": "SELECT payment_type, COUNT(*) AS payments FROM olist.order_payments GROUP BY payment_type ORDER BY payments DESC"},
    {"id": "pay-03", "category": "payments", "question": "Average number of installments for credit card payments",
     "sql": "SELECT AVG(payment_installments) AS avg_installments FROM olist.order_payments WHERE payment_type = 'credit_card'"},
    {"id": "pay-04", "category": "payments", "question": "Total amount paid by boleto in 2018",
     "sql": "SELECT SUM(p.payment_value) AS amount FROM olist.order_payments p JOIN olist.orders o ON o.order_id = p.order_id WHERE p.payment_type = 'boleto' AND o.order_purchase_timestamp >= '2018-01-01' AND o.order_purchase_timestamp < '2019-01-01'"},
    {"id": "pay-05", "category": "payments", "question": "How many orders were paid with more than one payment method?",
     "sql": "SELECT COUNT(*) AS orders FROM (SELECT order_id FROM olist.order_payments GROUP BY order_id HAVING COUNT(DISTINCT payment_type) > 1) x"},
    # --- customers -----------------------------------------------------------------------------
    {"id": "cus-01", "category": "customers", "question": "How many unique customers are there?",
     "sql": "SELECT COUNT(DISTINCT customer_unique_id) AS customers FROM olist.customers"},
    {"id": "cus-02", "category": "customers", "question": "How many customers ordered more than once?",
     "sql": "SELECT COUNT(*) AS repeat_customers FROM (SELECT c.customer_unique_id FROM olist.customers c JOIN olist.orders o ON o.customer_id = c.customer_id GROUP BY c.customer_unique_id HAVING COUNT(DISTINCT o.order_id) > 1) x"},
    {"id": "cus-03", "category": "customers", "question": "Number of unique customers by state, top 10",
     "sql": "SELECT customer_state, COUNT(DISTINCT customer_unique_id) AS customers FROM olist.customers GROUP BY customer_state ORDER BY customers DESC LIMIT 10"},
    {"id": "cus-04", "category": "customers", "question": "Which 10 cities have the most orders?",
     "sql": "SELECT c.customer_city, COUNT(*) AS orders FROM olist.orders o JOIN olist.customers c ON c.customer_id = o.customer_id GROUP BY c.customer_city ORDER BY orders DESC LIMIT 10"},
    {"id": "cus-05", "category": "customers", "question": "How many orders came from customers in Campinas?",
     "sql": "SELECT COUNT(*) AS orders FROM olist.orders o JOIN olist.customers c ON c.customer_id = o.customer_id WHERE c.customer_city = 'campinas'"},
    # --- sellers and products --------------------------------------------------------------------
    {"id": "sel-01", "category": "sellers", "question": "How many sellers are there per state, top 5?",
     "sql": "SELECT seller_state, COUNT(*) AS sellers FROM olist.sellers GROUP BY seller_state ORDER BY sellers DESC LIMIT 5"},
    {"id": "sel-02", "category": "sellers", "question": "Top 10 sellers by revenue",
     "sql": "SELECT seller_id, SUM(price) AS revenue FROM olist.order_items GROUP BY seller_id ORDER BY revenue DESC LIMIT 10"},
    {"id": "sel-03", "category": "sellers", "question": "How many sellers sold at least one item in 2018?",
     "sql": f"SELECT COUNT(DISTINCT i.seller_id) AS sellers FROM {ITEMS} WHERE o.order_purchase_timestamp >= '2018-01-01' AND o.order_purchase_timestamp < '2019-01-01'"},
    {"id": "sel-04", "category": "sellers", "question": "What share of revenue comes from sellers in São Paulo state?",
     "sql": "SELECT SUM(CASE WHEN s.seller_state = 'SP' THEN i.price ELSE 0 END) / SUM(i.price) AS sp_share FROM olist.order_items i JOIN olist.sellers s ON s.seller_id = i.seller_id"},
    {"id": "prd-01", "category": "products", "question": "How many products are in each category, top 10 in English?",
     "sql": "SELECT t.product_category_name_english AS category, COUNT(*) AS products FROM olist.products p LEFT JOIN olist.product_category_translation t ON t.product_category_name = p.product_category_name GROUP BY 1 ORDER BY products DESC LIMIT 10"},
    {"id": "prd-02", "category": "products", "question": "What is the average product weight in kilograms?",
     "sql": "SELECT AVG(product_weight_g) / 1000.0 AS avg_weight_kg FROM olist.products"},
    {"id": "prd-03", "category": "products", "question": "Average item price in the health and beauty category",
     "sql": "SELECT AVG(i.price) AS avg_price FROM olist.order_items i JOIN olist.products p ON p.product_id = i.product_id WHERE p.product_category_name = 'beleza_saude'"},
    # --- ambiguous: the agent should ask, then answer with the chosen reading ---------------------
    {"id": "amb-01", "category": "ambiguous", "question": "What are our best products?", "expect_clarify": True,
     "clarify_answer": "By revenue",
     "sql": "SELECT i.product_id, SUM(i.price) AS revenue FROM olist.order_items i GROUP BY i.product_id ORDER BY revenue DESC LIMIT 10"},
    {"id": "amb-02", "category": "ambiguous", "question": "Who are our top customers?", "expect_clarify": True,
     "clarify_answer": "By total amount spent",
     "sql": "SELECT c.customer_unique_id, SUM(i.price) AS revenue FROM olist.order_items i JOIN olist.orders o ON o.order_id = i.order_id JOIN olist.customers c ON c.customer_id = o.customer_id GROUP BY c.customer_unique_id ORDER BY revenue DESC LIMIT 10"},
    {"id": "amb-03", "category": "ambiguous", "question": "Which category is the biggest?", "expect_clarify": True,
     "clarify_answer": "By revenue",
     "sql": f"SELECT t.product_category_name_english AS category, SUM(i.price) AS revenue FROM {ITEMS_CAT} GROUP BY 1 ORDER BY revenue DESC LIMIT 1"},
    {"id": "amb-04", "category": "ambiguous", "question": "Which sellers perform best?", "expect_clarify": True,
     "clarify_answer": "By average review score, with at least 50 orders",
     "sql": "SELECT i.seller_id, AVG(r.review_score) AS avg_review_score FROM olist.order_items i JOIN olist.order_reviews r ON r.order_id = i.order_id GROUP BY i.seller_id HAVING COUNT(DISTINCT i.order_id) >= 50 ORDER BY avg_review_score DESC LIMIT 10"},
    {"id": "amb-05", "category": "ambiguous", "question": "What is the most popular product category?", "expect_clarify": True,
     "clarify_answer": "By number of orders",
     "sql": f"SELECT t.product_category_name_english AS category, COUNT(DISTINCT i.order_id) AS orders FROM {ITEMS_CAT} GROUP BY 1 ORDER BY orders DESC LIMIT 1"},
    {"id": "amb-06", "category": "ambiguous", "question": "Which region is doing worst?", "expect_clarify": True,
     "clarify_answer": "Lowest average review score",
     "sql": "SELECT c.customer_state, AVG(r.review_score) AS avg_review_score FROM olist.order_reviews r JOIN olist.orders o ON o.order_id = r.order_id JOIN olist.customers c ON c.customer_id = o.customer_id GROUP BY c.customer_state ORDER BY avg_review_score ASC LIMIT 1"},
    {"id": "amb-07", "category": "ambiguous", "question": "How big is an average order?", "expect_clarify": True,
     "clarify_answer": "In value (BRL)",
     "sql": f"SELECT SUM(i.price) / COUNT(DISTINCT i.order_id) AS aov FROM {ITEMS}"},
    {"id": "amb-08", "category": "ambiguous", "question": "Which state has the most customers?", "expect_clarify": False,
     "notes": "Not ambiguous: the semantic layer defines customers as customer_unique_id.",
     "sql": "SELECT customer_state, COUNT(DISTINCT customer_unique_id) AS customers FROM olist.customers GROUP BY customer_state ORDER BY customers DESC LIMIT 1"},
]  # fmt: skip


async def main() -> None:
    conn = await asyncpg.connect(os.environ["TARGET_ADMIN_DATABASE_URL"])
    lines = []
    try:
        for case in CASES:
            rows = await conn.fetch(str(case["sql"]))
            assert rows, f"{case['id']} returned no rows"
            print(f"{case['id']:<8} {len(rows):>4} rows  {dict(rows[0])}"[:150])
            lines.append(json.dumps({"expect_clarify": False, **case}, ensure_ascii=False))
    finally:
        await conn.close()
    OUT.write_text("\n".join(lines) + "\n")
    print(f"{len(lines)} cases written to {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
