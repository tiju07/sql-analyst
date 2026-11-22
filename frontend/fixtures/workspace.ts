import type { Schemas } from "@/lib/api/errors"

/**
 * The demo workspace: the three fictional personas of the real product
 * (backend/app/auth/personas.py, with example.com addresses), the conversation history each one
 * starts with, and the verified-query queue. Authors and timestamps are simulated.
 */

export type PersonaKey = Schemas["PersonaOut"]["key"]

export const PERSONAS: Record<PersonaKey, Schemas["UserOut"]> = {
  admin: {
    id: "u-admin",
    email: "ana.admin@example.com",
    display_name: "Ana Admin",
    role: "admin",
    allowed_states: null,
    is_demo: true,
  },
  analyst: {
    id: "u-analyst",
    email: "bruno.analyst@example.com",
    display_name: "Bruno Analyst",
    role: "analyst",
    allowed_states: null,
    is_demo: true,
  },
  regional: {
    id: "u-regional",
    email: "carla.regional@example.com",
    display_name: "Carla Regional (SP)",
    role: "regional",
    allowed_states: ["SP"],
    is_demo: true,
  },
}

export const PERSONA_BLURB: Record<PersonaKey, string> = {
  admin: "All states. Can edit the catalog and metrics and approve verified queries.",
  analyst: "All states. Read-only catalog.",
  regional: "Only customers in São Paulo (SP), enforced by the database whatever SQL runs.",
}

export const DEFAULT_PERSONA: PersonaKey = "admin"

/** Conversations each persona starts with: [conversation title, questions asked, hours ago]. */
export const HISTORY: Record<PersonaKey, { id: string; title: string; questions: string[]; hoursAgo: number }[]> = {
  admin: [
    {
      id: "c-admin-q2",
      title: "Top states last quarter",
      questions: ["Which 5 states had the highest revenue last quarter?"],
      hoursAgo: 1,
    },
    {
      id: "c-admin-late",
      title: "Late deliveries by state",
      questions: ["What is the late delivery rate by state for delivered orders?"],
      hoursAgo: 5,
    },
    {
      id: "c-admin-delete",
      title: "Clean up canceled orders",
      questions: ["Delete all canceled orders"],
      hoursAgo: 27,
    },
    {
      id: "c-admin-2017",
      title: "2017 monthly orders and revenue",
      questions: ["Monthly orders and revenue for 2017"],
      hoursAgo: 50,
    },
    {
      id: "c-admin-payments",
      title: "Payment mix and categories",
      questions: [
        "What share of payments are credit card, boleto, voucher and debit card?",
        "Top 10 product categories by revenue",
      ],
      hoursAgo: 24 * 9,
    },
  ],
  analyst: [
    {
      id: "c-analyst-reviews",
      title: "Lowest rated categories",
      questions: ["Which product categories have the lowest average review score?"],
      hoursAgo: 3,
    },
    {
      id: "c-analyst-orders",
      title: "Orders per month",
      questions: ["How many orders were placed each month?"],
      hoursAgo: 30,
    },
    {
      id: "c-analyst-repeat",
      title: "Repeat customers",
      questions: ["How many unique customers ordered more than once?"],
      hoursAgo: 24 * 4,
    },
  ],
  regional: [
    {
      id: "c-regional-month",
      title: "SP revenue by month",
      questions: ["What was our revenue by month in 2018?"],
      hoursAgo: 2,
    },
    {
      id: "c-regional-cities",
      title: "Top SP cities",
      questions: ["Which cities have the most orders?"],
      hoursAgo: 24 * 3,
    },
  ],
}

export const VERIFIED: Omit<Schemas["VerifiedOut"], "created_at">[] = [
  {
    id: "v-total-revenue",
    question: "What is total product revenue across all years?",
    sql: "SELECT SUM(i.price) AS revenue\nFROM olist.order_items i\nJOIN olist.orders o ON o.order_id = i.order_id",
    status: "approved",
    proposed_by: "Bruno Analyst",
    approved_by: "Ana Admin",
  },
  {
    id: "v-late-rate",
    question: "What is our late delivery rate?",
    sql: "SELECT AVG(CASE WHEN o.order_delivered_customer_date > o.order_estimated_delivery_date\n                THEN 1.0 ELSE 0.0 END) AS late_delivery_rate\nFROM olist.orders o\nWHERE o.order_status = 'delivered' AND o.order_delivered_customer_date IS NOT NULL",
    status: "approved",
    proposed_by: "Ana Admin",
    approved_by: "Ana Admin",
  },
  {
    id: "v-aov-2018",
    question: "How did average order value change month by month in 2018?",
    sql: "SELECT date_trunc('month', o.order_purchase_timestamp) AS month,\n       SUM(i.price) / NULLIF(COUNT(DISTINCT i.order_id), 0) AS aov\nFROM olist.order_items i\nJOIN olist.orders o ON o.order_id = i.order_id\nWHERE o.order_purchase_timestamp >= '2018-01-01'\n  AND o.order_purchase_timestamp < '2018-09-01'\nGROUP BY 1\nORDER BY 1",
    status: "proposed",
    proposed_by: "Bruno Analyst",
    approved_by: null,
  },
]

/** Id of the n-th (0-based) seeded run in a history conversation. Also the static /runs/ pages. */
export const seedRunId = (conversationId: string, n: number) => `r-${conversationId.slice(2)}-${n + 1}`
