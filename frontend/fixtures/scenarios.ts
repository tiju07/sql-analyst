import type { ChartSpec, StageName } from "@/lib/answer"
import type { Schemas } from "@/lib/api/errors"

import agg from "./olist-aggregates.json"

/**
 * Scripted answers for the static demo. Each scenario is one question the real agent answers,
 * with the SQL it writes (from the backend's deterministic test model, backend/app/graph/fake.py,
 * and the golden set, backend/evals/golden/golden_set.jsonl) and the rows that SQL returns on the
 * public Olist data (computed offline into olist-aggregates.json by scripts/olist_fixtures.py).
 *
 * Result numbers are real. Stage timings, token counts and cost are simulated and labelled so.
 */

type Column = Schemas["app__graph__events__ColumnOut"]
type Cell = string | number | null

/** Chart spec as written in fixtures; unset fields default to null. */
export type ChartInput = Partial<ChartSpec> & Pick<ChartSpec, "mark" | "title">

export type ScenarioResult = {
  columns: Column[]
  rows: Cell[][]
  chart: ChartInput
  summary: string
  caveats: string[]
}

export type Candidate = {
  label: string
  sql: string
  assumptions: string[]
  /** The first attempt fails at execution with this database error, then the repair runs. */
  fails?: { sql: string; error: string }
}

export type Scenario = {
  id: string
  /** Shown as a suggestion. Also the canonical wording for tests. */
  question: string
  /** The question matches when every pattern of any group matches (case-insensitive). */
  match: string[][]
  context: { tables: string[]; metrics: string[]; notes: string[] }
  candidates: Candidate[]
  /** Answer for personas who see all states. */
  result?: ScenarioResult
  /** Answer under row-level security for the SP regional manager. Undefined: not scripted. */
  regional?: ScenarioResult
  /** The guard rejects every candidate with this message. */
  blocked?: string
  clarify?: { question: string; options: string[]; next: Record<string, string> }
  /** Simulated. */
  timings: Partial<Record<StageName, number>>
  /** Simulated. */
  usage: { input: number; output: number; costUsd: number }
}

const col = (name: string, type: string, semantic_type: Column["semantic_type"] = null): Column => ({
  name,
  type,
  semantic_type,
})

const brl = (v: number) =>
  v >= 1_000_000 ? `R$${(v / 1_000_000).toFixed(2)}M` : v >= 1000 ? `R$${Math.round(v / 1000)}k` : `R$${v.toFixed(2)}`
const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`
const month = (m: string) => `${m}-01`

const STATE_NAME: Record<string, string> = {
  SP: "São Paulo",
  RJ: "Rio de Janeiro",
  MG: "Minas Gerais",
  PR: "Paraná",
  RS: "Rio Grande do Sul",
}

const PERIOD_NOTE = "The data ends in August 2018, so the last full quarter is 2018 Q2."
const RLS_CAVEAT = "Row-level security limits this account to customers in SP."

/* ── Revenue by state, 2018 Q2 ─────────────────────────────────────────── */

const q2 = agg.revenue_by_state_2018_q2 as [string, number][]
const q2Total = q2.reduce((s, [, v]) => s + v, 0)
const q2Top = q2.slice(0, 5)
const q2TopShare = q2Top.reduce((s, [, v]) => s + v, 0) / q2Total
const [sp, rj, mg, pr] = q2Top

const Q2_SQL = `SELECT c.customer_state, SUM(i.price) AS revenue
FROM olist.order_items i
JOIN olist.orders o ON o.order_id = i.order_id
JOIN olist.customers c ON c.customer_id = o.customer_id
WHERE o.order_purchase_timestamp >= '2018-04-01'
  AND o.order_purchase_timestamp < '2018-07-01'
GROUP BY c.customer_state
ORDER BY revenue DESC
LIMIT 5`

const Q2_CTE = `WITH q2_orders AS (
  SELECT o.order_id, c.customer_state
  FROM olist.orders o
  JOIN olist.customers c ON c.customer_id = o.customer_id
  WHERE o.order_purchase_timestamp >= '2018-04-01'
    AND o.order_purchase_timestamp < '2018-07-01'
)
SELECT q.customer_state, SUM(i.price) AS revenue
FROM q2_orders q
JOIN olist.order_items i ON i.order_id = q.order_id
GROUP BY q.customer_state
ORDER BY revenue DESC
LIMIT 5`

const Q2_METRIC = `SELECT c.customer_state, SUM(i.price) AS revenue
FROM olist.orders o
JOIN olist.customers c ON c.customer_id = o.customer_id
JOIN olist.order_items i ON i.order_id = o.order_id
WHERE o.order_purchase_timestamp >= '2018-04-01'
  AND o.order_purchase_timestamp < '2018-07-01'
GROUP BY 1
ORDER BY 2 DESC
LIMIT 5`

const stateColumns = [col("customer_state", "text"), col("revenue", "numeric", "currency_brl")]
const stateChart: ChartInput = {
  mark: "bar",
  title: "Revenue by customer state, 2018 Q2",
  x: "customer_state",
  y: "revenue",
  y_format: "currency_brl",
}

export const revenueQ2: Scenario = {
  id: "revenue-q2-states",
  question: "Which 5 states had the highest revenue last quarter?",
  match: [
    ["revenue|sales", "last quarter|q2|quarter"],
    ["revenue|sales", "state", "last|quarter|q2"],
  ],
  context: {
    tables: ["olist.order_items", "olist.orders", "olist.customers"],
    metrics: ["revenue = SUM(order_items.price)"],
    notes: [PERIOD_NOTE],
  },
  candidates: [
    { label: "Direct query", sql: Q2_SQL, assumptions: ["Last quarter means 2018 Q2."] },
    { label: "Joins planned with CTEs", sql: Q2_CTE, assumptions: ["Last quarter means 2018 Q2."] },
    {
      label: "From the metric definitions",
      sql: Q2_METRIC,
      assumptions: ["Revenue uses the semantic layer's definition."],
      fails: {
        sql: Q2_METRIC.replace("SUM(i.price) AS revenue", "SUM(i.revenue) AS revenue"),
        error: "column i.revenue does not exist",
      },
    },
  ],
  result: {
    columns: stateColumns,
    rows: q2Top,
    chart: stateChart,
    summary: `${STATE_NAME[sp[0]]} led 2018 Q2 with ${brl(sp[1])} in product revenue, more than ${STATE_NAME[rj[0]]}, ${STATE_NAME[mg[0]]} and ${STATE_NAME[pr[0]]} combined. The five states account for ${pct(q2TopShare, 0)} of the quarter's revenue.`,
    caveats: [
      "'Last quarter' read as 2018 Q2, because the data ends in August 2018.",
      "Revenue is item price only, without freight.",
    ],
  },
  regional: {
    columns: stateColumns,
    rows: [sp],
    chart: stateChart,
    summary: `${STATE_NAME[sp[0]]} had ${brl(sp[1])} in product revenue in 2018 Q2. Other states are outside this account's scope.`,
    caveats: [RLS_CAVEAT, "'Last quarter' read as 2018 Q2, because the data ends in August 2018."],
  },
  timings: {
    retrieve: 780,
    clarify: 310,
    generate: 1420,
    guard: 40,
    execute: 620,
    repair: 890,
    select: 30,
    compose: 1150,
  },
  usage: { input: 6840, output: 912, costUsd: 0.012 },
}

/* ── Revenue by state, all years ───────────────────────────────────────── */

const allStates = agg.revenue_by_state as [string, number][]
const ALL_STATES_SQL = `SELECT c.customer_state, SUM(i.price) AS revenue
FROM olist.order_items i
JOIN olist.orders o ON o.order_id = i.order_id
JOIN olist.customers c ON c.customer_id = o.customer_id
GROUP BY c.customer_state
ORDER BY revenue DESC
LIMIT 10`

const allStatesChart: ChartInput = { ...stateChart, title: "Revenue by customer state, all years" }

const revenueAllStates: Scenario = {
  id: "revenue-states",
  question: "Revenue by customer state across all years",
  match: [["revenue|sales", "state"]],
  context: {
    tables: ["olist.order_items", "olist.orders", "olist.customers"],
    metrics: ["revenue = SUM(order_items.price)"],
    notes: [],
  },
  candidates: [
    { label: "Direct query", sql: ALL_STATES_SQL, assumptions: ["All years in the dataset, 2016 to 2018."] },
    { label: "Joins planned with CTEs", sql: ALL_STATES_SQL, assumptions: ["All years in the dataset."] },
  ],
  result: {
    columns: stateColumns,
    rows: allStates.slice(0, 10),
    chart: allStatesChart,
    summary: `São Paulo is the largest market with ${brl(allStates[0][1])} of ${brl(agg.total_revenue)} in product revenue (${pct(allStates[0][1] / agg.total_revenue, 0)}). Rio de Janeiro and Minas Gerais follow.`,
    caveats: ["Covers every order from 2016 to 2018.", "Revenue is item price only, without freight."],
  },
  regional: {
    columns: stateColumns,
    rows: [allStates[0]],
    chart: allStatesChart,
    summary: `Customers in São Paulo bought ${brl(allStates[0][1])} in products across all years.`,
    caveats: [RLS_CAVEAT],
  },
  timings: { retrieve: 690, clarify: 280, generate: 1190, guard: 35, execute: 540, select: 25, compose: 980 },
  usage: { input: 5920, output: 744, costUsd: 0.009 },
}

/* ── Best categories (asks first) and revenue by category ──────────────── */

const cats = agg.revenue_by_category as [string, number, number][]
const spCats = agg.sp.revenue_by_category as [string, number][]
const CATEGORY_SQL = `SELECT t.product_category_name_english AS category, SUM(i.price) AS revenue
FROM olist.order_items i
JOIN olist.orders o ON o.order_id = i.order_id
JOIN olist.products p ON p.product_id = i.product_id
LEFT JOIN olist.product_category_translation t
  ON t.product_category_name = p.product_category_name
GROUP BY 1
ORDER BY revenue DESC
LIMIT 10`

const categoryColumns = [col("category", "text"), col("revenue", "numeric", "currency_brl")]
const categoryChart: ChartInput = {
  mark: "bar",
  title: "Revenue by product category",
  x: "category",
  y: "revenue",
  y_format: "currency_brl",
}

export const revenueByCategory: Scenario = {
  id: "revenue-categories",
  question: "Top 10 product categories by revenue",
  match: [["categor", "revenue|sales|top"]],
  context: {
    tables: ["olist.order_items", "olist.orders", "olist.products", "olist.product_category_translation"],
    metrics: ["revenue = SUM(order_items.price)"],
    notes: ["Category names are in Portuguese; the translation table gives English."],
  },
  candidates: [
    { label: "Direct query", sql: CATEGORY_SQL, assumptions: ["English category names."] },
    { label: "Joins planned with CTEs", sql: CATEGORY_SQL, assumptions: ["English category names."] },
    {
      label: "From the metric definitions",
      sql: CATEGORY_SQL,
      assumptions: ["Revenue uses the semantic layer's definition."],
    },
  ],
  result: {
    columns: categoryColumns,
    rows: cats.map(([c, v]) => [c, v]),
    chart: categoryChart,
    summary: `health_beauty (${brl(cats[0][1])}), watches_gifts (${brl(cats[1][1])}) and bed_bath_table (${brl(cats[2][1])}) are the top three categories by product revenue.`,
    caveats: ["Covers every order from 2016 to 2018."],
  },
  regional: {
    columns: categoryColumns,
    rows: spCats,
    chart: categoryChart,
    summary: `For customers in SP, bed_bath_table leads with ${brl(spCats[0][1])}, ahead of health_beauty and watches_gifts.`,
    caveats: [RLS_CAVEAT],
  },
  timings: { retrieve: 820, clarify: 300, generate: 1260, guard: 45, execute: 710, select: 30, compose: 1040 },
  usage: { input: 6410, output: 820, costUsd: 0.011 },
}

const bestCategories: Scenario = {
  id: "best-categories",
  question: "Which are our best product categories?",
  match: [["best", "categor"]],
  context: revenueByCategory.context,
  candidates: [],
  clarify: {
    question: "Best by which measure?",
    options: ["Revenue", "Number of orders", "Average review score"],
    next: {
      Revenue: "revenue-categories",
      "Number of orders": "orders-categories",
      "Average review score": "review-categories",
    },
  },
  timings: { retrieve: 760, clarify: 540 },
  usage: { input: 2210, output: 96, costUsd: 0.002 },
}

const ORDERS_BY_CATEGORY_SQL = `SELECT t.product_category_name_english AS category, COUNT(DISTINCT i.order_id) AS orders
FROM olist.order_items i
JOIN olist.products p ON p.product_id = i.product_id
LEFT JOIN olist.product_category_translation t
  ON t.product_category_name = p.product_category_name
GROUP BY 1
ORDER BY orders DESC
LIMIT 10`

const ordersByCategory: Scenario = {
  id: "orders-categories",
  question: "Top product categories by number of orders",
  match: [["categor", "number of orders|most orders"]],
  context: revenueByCategory.context,
  candidates: [
    { label: "Direct query", sql: ORDERS_BY_CATEGORY_SQL, assumptions: ["Counts distinct orders per category."] },
  ],
  result: {
    columns: [col("category", "text"), col("orders", "bigint", "count")],
    rows: [...cats].sort((a, b) => b[2] - a[2]).map(([c, , n]) => [c, n]),
    chart: { mark: "bar", title: "Orders by product category", x: "category", y: "orders", y_format: "count" },
    summary: `bed_bath_table appears in the most orders (${cats.find(([c]) => c === "bed_bath_table")?.[2].toLocaleString("en-US")}), followed by health_beauty and sports_leisure.`,
    caveats: [
      "Ranked among the ten categories with the highest revenue.",
      "An order with items from two categories counts once in each.",
    ],
  },
  timings: { retrieve: 700, clarify: 260, generate: 980, guard: 30, execute: 650, select: 20, compose: 900 },
  usage: { input: 5210, output: 640, costUsd: 0.008 },
}

const lowReview = agg.lowest_review_categories as [string, number, number][]
const topReview = agg.top_review_categories as [string, number, number][]
const REVIEW_CATEGORY_SQL = (dir: "ASC" | "DESC") => `SELECT t.product_category_name_english AS category,
       AVG(r.review_score) AS avg_review_score,
       COUNT(*) AS reviews
FROM olist.order_reviews r
JOIN olist.order_items i ON i.order_id = r.order_id
JOIN olist.products p ON p.product_id = i.product_id
LEFT JOIN olist.product_category_translation t
  ON t.product_category_name = p.product_category_name
GROUP BY 1
HAVING COUNT(*) >= 500
ORDER BY avg_review_score ${dir}
LIMIT 10`

const reviewColumns = [
  col("category", "text"),
  col("avg_review_score", "numeric", "number"),
  col("reviews", "bigint", "count"),
]

const reviewCategories: Scenario = {
  id: "review-categories",
  question: "Which product categories have the highest average review score?",
  match: [["categor", "review|rating", "highest|best|top"]],
  context: {
    tables: ["olist.order_reviews", "olist.order_items", "olist.products", "olist.product_category_translation"],
    metrics: ["avg_review_score = AVG(order_reviews.review_score)"],
    notes: [],
  },
  candidates: [
    {
      label: "Direct query",
      sql: REVIEW_CATEGORY_SQL("DESC"),
      assumptions: ["Only categories with at least 500 reviews."],
    },
  ],
  result: {
    columns: reviewColumns,
    rows: topReview,
    chart: {
      mark: "bar",
      title: "Highest average review score by category",
      x: "category",
      y: "avg_review_score",
      y_format: "number",
    },
    summary: `stationery has the highest average score (${topReview[0][1].toFixed(2)} of 5), then perfumery and toys. Every category in the top ten scores above 4.`,
    caveats: ["Categories with fewer than 500 reviews are left out."],
  },
  timings: { retrieve: 740, clarify: 290, generate: 1100, guard: 40, execute: 830, select: 25, compose: 950 },
  usage: { input: 5630, output: 700, costUsd: 0.009 },
}

const lowReviewCategories: Scenario = {
  ...reviewCategories,
  id: "low-review-categories",
  question: "Which product categories have the lowest average review score?",
  match: [["categor", "review|rating", "lowest|worst"]],
  candidates: [
    {
      label: "Direct query",
      sql: REVIEW_CATEGORY_SQL("ASC"),
      assumptions: ["Only categories with at least 500 reviews."],
    },
  ],
  result: {
    columns: reviewColumns,
    rows: lowReview,
    chart: {
      mark: "bar",
      title: "Lowest average review score by category",
      x: "category",
      y: "avg_review_score",
      y_format: "number",
    },
    summary: `office_furniture has the lowest average score (${lowReview[0][1].toFixed(2)} of 5) across ${lowReview[0][2].toLocaleString("en-US")} reviews. Furniture and home categories make up half of the bottom ten.`,
    caveats: [
      "Categories with fewer than 500 reviews are left out.",
      "'uncategorised' groups products without a category.",
    ],
  },
}

/* ── Orders by month ───────────────────────────────────────────────────── */

const MONTHLY_ORDERS_SQL = `SELECT date_trunc('month', o.order_purchase_timestamp) AS order_month,
       COUNT(DISTINCT o.order_id) AS orders
FROM olist.orders o
WHERE o.order_purchase_timestamp < '2018-09-01'
GROUP BY 1
ORDER BY 1`

const obm = agg.orders_by_month as [string, number][]
const peak = obm.reduce((a, b) => (b[1] > a[1] ? b : a))

const monthlyOrders: Scenario = {
  id: "monthly-orders",
  question: "How many orders were placed each month?",
  match: [["order", "month|trend"]],
  context: { tables: ["olist.orders"], metrics: ["orders = COUNT(DISTINCT orders.order_id)"], notes: [PERIOD_NOTE] },
  candidates: [
    { label: "Direct query", sql: MONTHLY_ORDERS_SQL, assumptions: ["Months after August 2018 are left out."] },
  ],
  result: {
    columns: [col("order_month", "timestamp", "date"), col("orders", "bigint", "count")],
    rows: obm.map(([m, n]) => [month(m), n]),
    chart: {
      mark: "line",
      title: "Orders per month",
      x: "order_month",
      y: "orders",
      x_format: "date",
      y_format: "count",
    },
    summary: `Orders grew through 2017 and peaked in ${peak[0] === "2017-11" ? "November 2017" : peak[0]} with ${peak[1].toLocaleString("en-US")} orders, the month of Black Friday. 2018 held steady at ${Math.min(...obm.filter(([m]) => m.startsWith("2018")).map(([, n]) => n)).toLocaleString("en-US")} to ${Math.max(...obm.filter(([m]) => m.startsWith("2018")).map(([, n]) => n)).toLocaleString("en-US")} a month.`,
    caveats: ["September 2016 to December 2016 has very few orders.", "Months after August 2018 are left out."],
  },
  timings: { retrieve: 610, clarify: 240, generate: 870, guard: 30, execute: 480, select: 20, compose: 860 },
  usage: { input: 4710, output: 590, costUsd: 0.007 },
}

/* ── Revenue by month 2018 (regional) and 2017 ─────────────────────────── */

const spMonths = agg.sp_revenue_by_month_2018 as [string, number][]
const REVENUE_MONTH_SQL = (
  year: number,
) => `SELECT date_trunc('month', o.order_purchase_timestamp) AS month, SUM(i.price) AS revenue
FROM olist.order_items i
JOIN olist.orders o ON o.order_id = i.order_id
WHERE o.order_purchase_timestamp >= '${year}-01-01'
  AND o.order_purchase_timestamp < '${year + 1}-01-01'
GROUP BY 1
ORDER BY 1`

const monthRevenueColumns = [col("month", "timestamp", "date"), col("revenue", "numeric", "currency_brl")]

const revenueByMonth2018: Scenario = {
  id: "revenue-month-2018",
  question: "What was our revenue by month in 2018?",
  match: [["revenue|sales", "month", "2018"]],
  context: {
    tables: ["olist.order_items", "olist.orders"],
    metrics: ["revenue = SUM(order_items.price)"],
    notes: [PERIOD_NOTE],
  },
  candidates: [
    { label: "Direct query", sql: REVENUE_MONTH_SQL(2018), assumptions: ["Calendar months, purchase date."] },
  ],
  regional: {
    columns: monthRevenueColumns,
    rows: spMonths.map(([m, v]) => [month(m), v]),
    chart: {
      mark: "line",
      title: "SP revenue per month, 2018",
      x: "month",
      y: "revenue",
      x_format: "date",
      y_format: "currency_brl",
    },
    summary: `Revenue from SP customers ranged from ${brl(Math.min(...spMonths.map(([, v]) => v)))} (February) to ${brl(Math.max(...spMonths.map(([, v]) => v)))} (May) a month in 2018.`,
    caveats: [RLS_CAVEAT, "September 2018 has almost no orders and is left out."],
  },
  timings: { retrieve: 640, clarify: 250, generate: 920, guard: 30, execute: 450, select: 20, compose: 870 },
  usage: { input: 4980, output: 610, costUsd: 0.008 },
}

const r2017 = agg.orders_revenue_by_month_2017 as [string, number, number][]
const ORDERS_REVENUE_2017_SQL = `SELECT date_trunc('month', o.order_purchase_timestamp) AS month,
       COUNT(DISTINCT o.order_id) AS orders,
       SUM(i.price) AS revenue
FROM olist.orders o
JOIN olist.order_items i ON i.order_id = o.order_id
WHERE o.order_purchase_timestamp >= '2017-01-01'
  AND o.order_purchase_timestamp < '2018-01-01'
GROUP BY 1
ORDER BY 1`

const ordersRevenue2017: Scenario = {
  id: "orders-revenue-2017",
  question: "Monthly orders and revenue for 2017",
  match: [["2017", "month|monthly"]],
  context: {
    tables: ["olist.orders", "olist.order_items"],
    metrics: ["orders = COUNT(DISTINCT orders.order_id)", "revenue = SUM(order_items.price)"],
    notes: [],
  },
  candidates: [
    { label: "Direct query", sql: ORDERS_REVENUE_2017_SQL, assumptions: ["Orders with at least one item."] },
  ],
  result: {
    columns: [
      col("month", "timestamp", "date"),
      col("orders", "bigint", "count"),
      col("revenue", "numeric", "currency_brl"),
    ],
    rows: r2017.map(([m, n, v]) => [month(m), n, v]),
    chart: {
      mark: "line",
      title: "Revenue per month, 2017",
      x: "month",
      y: "revenue",
      x_format: "date",
      y_format: "currency_brl",
    },
    summary: `Revenue rose from ${brl(r2017[0][2])} in January to ${brl(Math.max(...r2017.map(([, , v]) => v)))} in November 2017, when Black Friday lifted orders ${pct(r2017[10][1] / r2017[9][1] - 1, 0)} above October.`,
    caveats: ["Orders without items are not counted."],
  },
  timings: { retrieve: 660, clarify: 260, generate: 1010, guard: 35, execute: 590, select: 20, compose: 920 },
  usage: { input: 5150, output: 690, costUsd: 0.008 },
}

/* ── Late deliveries ───────────────────────────────────────────────────── */

const LATE_SQL = `SELECT AVG(CASE WHEN o.order_delivered_customer_date > o.order_estimated_delivery_date
                THEN 1.0 ELSE 0.0 END) AS late_delivery_rate
FROM olist.orders o
WHERE o.order_status = 'delivered' AND o.order_delivered_customer_date IS NOT NULL`

const LATE_BY_STATE_SQL = `SELECT c.customer_state,
       AVG(CASE WHEN o.order_delivered_customer_date > o.order_estimated_delivery_date
                THEN 1.0 ELSE 0.0 END) AS late_delivery_rate,
       COUNT(*) AS delivered_orders
FROM olist.orders o
JOIN olist.customers c ON c.customer_id = o.customer_id
WHERE o.order_status = 'delivered' AND o.order_delivered_customer_date IS NOT NULL
GROUP BY c.customer_state
ORDER BY late_delivery_rate DESC`

const lateCtx = {
  tables: ["olist.orders", "olist.customers"],
  metrics: ["late_delivery_rate"],
  notes: ["Late means delivered after the estimated delivery date."],
}
const lateKpi = (rate: number, title: string): Pick<ScenarioResult, "columns" | "rows" | "chart"> => ({
  columns: [col("late_delivery_rate", "numeric", "percent")],
  rows: [[rate]],
  chart: { mark: "kpi", title, y: "late_delivery_rate", y_format: "percent" },
})

const lateByState: Scenario = {
  id: "late-by-state",
  question: "What is the late delivery rate by state for delivered orders?",
  match: [["late", "state"]],
  context: lateCtx,
  candidates: [{ label: "Direct query", sql: LATE_BY_STATE_SQL, assumptions: ["Delivered orders only."] }],
  result: {
    columns: [
      col("customer_state", "text"),
      col("late_delivery_rate", "numeric", "percent"),
      col("delivered_orders", "bigint", "count"),
    ],
    rows: agg.late_delivery_rate_by_state as Cell[][],
    chart: {
      mark: "bar",
      title: "Late delivery rate by state",
      x: "customer_state",
      y: "late_delivery_rate",
      y_format: "percent",
    },
    summary: `Alagoas has the highest late rate (${pct(agg.late_delivery_rate_by_state[0][1] as number)}), three times the national ${pct(agg.late_delivery_rate)}. Northeastern states are late most often.`,
    caveats: ["Delivered orders only.", "Small states have few orders, so their rates move a lot."],
  },
  regional: {
    ...lateKpi(agg.sp.late_delivery_rate, "Late delivery rate, SP"),
    summary: `${pct(agg.sp.late_delivery_rate)} of delivered orders to SP customers arrived after the estimated date.`,
    caveats: [RLS_CAVEAT],
  },
  timings: { retrieve: 700, clarify: 260, generate: 1050, guard: 35, execute: 760, select: 20, compose: 930 },
  usage: { input: 5480, output: 700, costUsd: 0.009 },
}

const lateRate: Scenario = {
  id: "late-rate",
  question: "What is our late delivery rate?",
  match: [["late"]],
  context: lateCtx,
  candidates: [{ label: "Direct query", sql: LATE_SQL, assumptions: ["Delivered orders only."] }],
  result: {
    ...lateKpi(agg.late_delivery_rate, "Late delivery rate"),
    summary: `${pct(agg.late_delivery_rate)} of delivered orders arrived after the estimated delivery date.`,
    caveats: ["Delivered orders with a delivery date only."],
  },
  regional: lateByState.regional,
  timings: { retrieve: 580, clarify: 230, generate: 760, guard: 25, execute: 410, select: 15, compose: 720 },
  usage: { input: 4320, output: 410, costUsd: 0.006 },
}

/* ── Payment types ─────────────────────────────────────────────────────── */

const PAYMENT_SQL = `SELECT p.payment_type,
       COUNT(*)::numeric / SUM(COUNT(*)) OVER () AS share
FROM olist.order_payments p
GROUP BY p.payment_type
ORDER BY share DESC`

const shareRows = (rows: [string, number][]) => rows.filter(([, v]) => v > 0)
const paymentColumns = [col("payment_type", "text"), col("share", "numeric", "percent")]
const paymentChart: ChartInput = {
  mark: "bar",
  title: "Share of payments by type",
  x: "payment_type",
  y: "share",
  y_format: "percent",
}

const paymentShare: Scenario = {
  id: "payment-share",
  question: "What share of payments are credit card, boleto, voucher and debit card?",
  match: [["payment|paying|pay"]],
  context: { tables: ["olist.order_payments"], metrics: [], notes: ["An order can have several payments."] },
  candidates: [{ label: "Direct query", sql: PAYMENT_SQL, assumptions: ["Share of payment records, not of value."] }],
  result: {
    columns: paymentColumns,
    rows: shareRows(agg.payment_share as [string, number][]),
    chart: paymentChart,
    summary: `Credit cards are ${pct(agg.payment_share[0][1] as number, 0)} of payments and boleto ${pct(agg.payment_share[1][1] as number, 0)}. Vouchers and debit cards make up the rest.`,
    caveats: ["Counts payment records; one order can have several."],
  },
  regional: {
    columns: paymentColumns,
    rows: shareRows(agg.sp.payment_share as [string, number][]),
    chart: paymentChart,
    summary: `SP customers pay by credit card ${pct(agg.sp.payment_share[0][1] as number, 0)} of the time, close to the national mix.`,
    caveats: [RLS_CAVEAT],
  },
  timings: { retrieve: 560, clarify: 220, generate: 810, guard: 30, execute: 390, select: 15, compose: 760 },
  usage: { input: 4100, output: 520, costUsd: 0.006 },
}

/* ── Average order value, repeat customers, delivery time, cities ──────── */

const aov = agg.aov_by_month_2018 as [string, number][]
const aovScenario: Scenario = {
  id: "aov-2018",
  question: "How did average order value change month by month in 2018?",
  match: [["average order value|aov|basket"]],
  context: {
    tables: ["olist.order_items", "olist.orders"],
    metrics: ["aov = SUM(order_items.price) / COUNT(DISTINCT order_items.order_id)"],
    notes: [PERIOD_NOTE],
  },
  candidates: [
    {
      label: "From the metric definitions",
      sql: `SELECT date_trunc('month', o.order_purchase_timestamp) AS month,
       SUM(i.price) / NULLIF(COUNT(DISTINCT i.order_id), 0) AS aov
FROM olist.order_items i
JOIN olist.orders o ON o.order_id = i.order_id
WHERE o.order_purchase_timestamp >= '2018-01-01'
  AND o.order_purchase_timestamp < '2018-09-01'
GROUP BY 1
ORDER BY 1`,
      assumptions: ["Item price only, without freight."],
    },
  ],
  result: {
    columns: [col("month", "timestamp", "date"), col("aov", "numeric", "currency_brl")],
    rows: aov.map(([m, v]) => [month(m), v]),
    chart: {
      mark: "line",
      title: "Average order value per month, 2018",
      x: "month",
      y: "aov",
      x_format: "date",
      y_format: "currency_brl",
    },
    summary: `Average order value stayed between R$${Math.min(...aov.map(([, v]) => v)).toFixed(0)} and R$${Math.max(...aov.map(([, v]) => v)).toFixed(0)}, highest in May 2018.`,
    caveats: ["Item price only, without freight."],
  },
  timings: { retrieve: 650, clarify: 240, generate: 930, guard: 30, execute: 520, select: 20, compose: 840 },
  usage: { input: 4860, output: 600, costUsd: 0.007 },
}

const repeatCustomers: Scenario = {
  id: "repeat-customers",
  question: "How many unique customers ordered more than once?",
  match: [["more than once|repeat|returning"]],
  context: {
    tables: ["olist.orders", "olist.customers"],
    metrics: ["unique_customers = COUNT(DISTINCT customers.customer_unique_id)"],
    notes: ["customer_id is per order; customer_unique_id follows a person."],
  },
  candidates: [
    {
      label: "Direct query",
      sql: `SELECT COUNT(*) AS repeat_customers
FROM (
  SELECT c.customer_unique_id
  FROM olist.orders o
  JOIN olist.customers c ON c.customer_id = o.customer_id
  GROUP BY c.customer_unique_id
  HAVING COUNT(DISTINCT o.order_id) > 1
) r`,
      assumptions: ["Uses customer_unique_id, not customer_id."],
    },
  ],
  result: {
    columns: [col("repeat_customers", "bigint", "count")],
    rows: [[agg.repeat_customers]],
    chart: { mark: "kpi", title: "Customers with more than one order", y: "repeat_customers", y_format: "count" },
    summary: `${agg.repeat_customers.toLocaleString("en-US")} of ${agg.unique_customers.toLocaleString("en-US")} customers (${pct(agg.repeat_customers / agg.unique_customers)}) ordered more than once.`,
    caveats: ["customer_id changes with every order, so the query counts customer_unique_id."],
  },
  timings: { retrieve: 620, clarify: 230, generate: 880, guard: 30, execute: 690, select: 15, compose: 780 },
  usage: { input: 4520, output: 520, costUsd: 0.007 },
}

const days = agg.delivery_days_by_state as [string, number, number][]
const deliveryDays: Scenario = {
  id: "delivery-days",
  question: "Average delivery time in days by customer state",
  match: [["delivery time|days"]],
  context: lateCtx,
  candidates: [
    {
      label: "Direct query",
      sql: `SELECT c.customer_state,
       AVG(EXTRACT(EPOCH FROM o.order_delivered_customer_date - o.order_purchase_timestamp) / 86400) AS avg_days,
       COUNT(*) AS delivered_orders
FROM olist.orders o
JOIN olist.customers c ON c.customer_id = o.customer_id
WHERE o.order_status = 'delivered' AND o.order_delivered_customer_date IS NOT NULL
GROUP BY 1
ORDER BY avg_days DESC`,
      assumptions: ["From purchase to delivery, delivered orders only."],
    },
  ],
  result: {
    columns: [
      col("customer_state", "text"),
      col("avg_days", "numeric", "number"),
      col("delivered_orders", "bigint", "count"),
    ],
    rows: days,
    chart: {
      mark: "bar",
      title: "Average delivery time by state, days",
      x: "customer_state",
      y: "avg_days",
      y_format: "number",
    },
    summary: `Orders to Roraima take ${days[0][1]} days on average, the longest. São Paulo, closest to most sellers, is the fastest at ${days[days.length - 1][1]} days.`,
    caveats: ["From purchase to delivery, delivered orders only."],
  },
  timings: { retrieve: 690, clarify: 250, generate: 990, guard: 35, execute: 820, select: 20, compose: 900 },
  usage: { input: 5260, output: 660, costUsd: 0.008 },
}

const cities: Scenario = {
  id: "cities",
  question: "Which cities have the most orders?",
  match: [["cit(y|ies)"]],
  context: {
    tables: ["olist.orders", "olist.customers"],
    metrics: ["orders = COUNT(DISTINCT orders.order_id)"],
    notes: [],
  },
  candidates: [
    {
      label: "Direct query",
      sql: `SELECT c.customer_city, COUNT(DISTINCT o.order_id) AS orders
FROM olist.orders o
JOIN olist.customers c ON c.customer_id = o.customer_id
GROUP BY c.customer_city
ORDER BY orders DESC
LIMIT 10`,
      assumptions: ["Customer city, not seller city."],
    },
  ],
  regional: {
    columns: [col("customer_city", "text"), col("orders", "bigint", "count")],
    rows: agg.sp.top_cities_by_orders,
    chart: { mark: "bar", title: "Orders by city, SP", x: "customer_city", y: "orders", y_format: "count" },
    summary: `São Paulo city accounts for ${agg.sp.top_cities_by_orders[0][1].toLocaleString("en-US")} of ${agg.sp.orders.toLocaleString("en-US")} orders from the state, ten times Campinas.`,
    caveats: [RLS_CAVEAT],
  },
  timings: { retrieve: 600, clarify: 230, generate: 860, guard: 30, execute: 480, select: 15, compose: 770 },
  usage: { input: 4410, output: 540, costUsd: 0.007 },
}

/* ── Unsafe request: the guard blocks it ───────────────────────────────── */

export const deleteCanceled: Scenario = {
  id: "delete-canceled",
  question: "Delete all canceled orders",
  match: [["\\b(delete|drop|truncate|update|insert|alter)\\b"]],
  context: { tables: ["olist.orders"], metrics: [], notes: [] },
  candidates: [
    { label: "Direct query", sql: "DELETE FROM olist.orders WHERE order_status = 'canceled'", assumptions: [] },
  ],
  blocked: "Only SELECT queries are allowed, got DELETE.",
  timings: { retrieve: 520, clarify: 210, generate: 640, guard: 20 },
  usage: { input: 3020, output: 140, costUsd: 0.004 },
}

/** Order matters: the first matching scenario answers. Specific before general. */
export const SCENARIOS: Scenario[] = [
  deleteCanceled,
  bestCategories,
  lowReviewCategories,
  reviewCategories,
  ordersByCategory,
  revenueByCategory,
  revenueQ2,
  revenueByMonth2018,
  ordersRevenue2017,
  revenueAllStates,
  lateByState,
  lateRate,
  paymentShare,
  aovScenario,
  repeatCustomers,
  deliveryDays,
  cities,
  monthlyOrders,
]

export function findScenario(question: string): Scenario | undefined {
  const q = question.toLowerCase()
  return SCENARIOS.find((s) => s.match.some((group) => group.every((p) => new RegExp(p, "i").test(q))))
}

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id)
}

/** Suggested questions per persona: only questions the script answers for that persona. */
export const SUGGESTIONS: Record<"all" | "regional", string[]> = {
  all: [
    revenueQ2.question,
    lateByState.question,
    ordersRevenue2017.question,
    lowReviewCategories.question,
    paymentShare.question,
    bestCategories.question,
  ],
  regional: [
    revenueByMonth2018.question,
    cities.question,
    lateRate.question,
    revenueByCategory.question,
    "How are customers paying, by payment type?",
    revenueQ2.question,
  ],
}
