/**
 * The semantic layer of the demo connection: a verbatim copy of backend/semantic/metrics.yaml
 * (tests/unit/fixtures.test.ts fails if the two drift apart).
 */
export const METRICS_YAML = `# Business metric definitions for the Olist connection. Expressions use unqualified olist table
# names; the agent adds joins. Admins edit this via PUT /api/semantic/metrics (validated).
# Facts about the data the agent must know (verified against the loaded dataset).
notes:
  - >-
    Orders span 2016-09-04 to 2018-10-17, but only 20 orders fall after 2018-08-31. Resolve
    relative periods ("last quarter", "this year") against the latest complete data, not
    today's date: the last full month is 2018-08 and the last full quarter is 2018 Q2
    (Q3 2018 ends with almost no September data). State the period used as a caveat.
  - Monetary values are in Brazilian reais (BRL).
  - >-
    customer_id identifies a customer per order; use customer_unique_id to count or follow
    real customers across orders.

metrics:
  - name: revenue
    description: Product revenue in BRL. Item price only, excludes freight.
    sql_expr: SUM(order_items.price)
    semantic_type: currency_brl
    synonyms: [sales, turnover, product revenue]

  - name: gmv
    description: Gross merchandise value in BRL. Item price plus freight.
    sql_expr: SUM(order_items.price + order_items.freight_value)
    semantic_type: currency_brl
    synonyms: [gross merchandise value, revenue including freight, total billed]

  - name: freight
    description: Freight charged to customers in BRL.
    sql_expr: SUM(order_items.freight_value)
    semantic_type: currency_brl
    synonyms: [shipping cost, delivery fees]

  - name: orders
    description: Number of distinct orders, any status.
    sql_expr: COUNT(DISTINCT orders.order_id)
    semantic_type: count
    synonyms: [order count, number of orders]

  - name: delivered_orders
    description: Orders with order_status = 'delivered'.
    sql_expr: COUNT(DISTINCT orders.order_id) FILTER (WHERE orders.order_status = 'delivered')
    semantic_type: count
    synonyms: [completed orders, fulfilled orders]

  - name: unique_customers
    description: >-
      Distinct real customers. customer_id is per order in Olist, so count customer_unique_id.
    sql_expr: COUNT(DISTINCT customers.customer_unique_id)
    semantic_type: count
    synonyms: [customers, buyers, number of customers]

  - name: aov
    description: Average order value in BRL. Revenue (price only) divided by distinct orders.
    sql_expr: SUM(order_items.price) / NULLIF(COUNT(DISTINCT order_items.order_id), 0)
    semantic_type: currency_brl
    synonyms: [average order value, average basket, ticket medio]

  - name: late_delivery_rate
    description: >-
      Share of delivered orders that arrived after the estimated delivery date.
    sql_expr: >-
      AVG(CASE WHEN orders.order_delivered_customer_date > orders.order_estimated_delivery_date
      THEN 1.0 ELSE 0.0 END) FILTER (WHERE orders.order_status = 'delivered'
      AND orders.order_delivered_customer_date IS NOT NULL)
    semantic_type: percent
    synonyms: [late rate, share of late deliveries, delay rate]

  - name: avg_review_score
    description: Mean review score, 1 (worst) to 5 (best).
    sql_expr: AVG(order_reviews.review_score)
    semantic_type: number
    synonyms: [rating, average rating, customer satisfaction, review score]

  - name: payment_value
    description: Total paid by customers in BRL across all payment methods (includes freight).
    sql_expr: SUM(order_payments.payment_value)
    semantic_type: currency_brl
    synonyms: [payments, amount paid]

# Plain-language terms that map to a column rather than a metric.
dimensions:
  - term: region
    column: customers.customer_state
  - term: state
    column: customers.customer_state
  - term: city
    column: customers.customer_city
  - term: category
    column: product_category_translation.product_category_name_english
  - term: seller state
    column: sellers.seller_state
  - term: order date
    column: orders.order_purchase_timestamp
`
