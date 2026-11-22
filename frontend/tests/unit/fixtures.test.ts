import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"
import { z } from "zod"

import { CATALOG } from "@/fixtures/catalog"
import { METRICS_YAML } from "@/fixtures/metrics"
import aggregates from "@/fixtures/olist-aggregates.json"
import { findScenario, SCENARIOS, SUGGESTIONS } from "@/fixtures/scenarios"
import { HISTORY, PERSONAS, VERIFIED, type PersonaKey } from "@/fixtures/workspace"
import { plan } from "@/lib/demo/runs"
import evalSummary from "@/lib/evals/summary.json"

/** Schema checks: a malformed fixture fails CI instead of breaking the demo at runtime. */

const ROOT = join(__dirname, "../../..")
const money = z.number().nonnegative()
const share = z.number().min(0).max(1)
const stateCode = z.string().regex(/^[A-Z]{2}$/)
const month = z.string().regex(/^\d{4}-\d{2}$/)

const Aggregates = z.object({
  source: z.string().min(1),
  row_counts: z.record(z.string(), z.number().int().positive()),
  total_revenue: money,
  revenue_by_state: z.array(z.tuple([stateCode, money])).min(5),
  revenue_by_state_2018_q2: z.array(z.tuple([stateCode, money])).min(5),
  sp_revenue_by_month_2018: z.array(z.tuple([month, money])).length(8),
  orders_by_month: z.array(z.tuple([month, z.number().int()])),
  late_delivery_rate: share,
  late_delivery_rate_by_state: z.array(z.tuple([stateCode, share, z.number().int()])),
  payment_share: z.array(z.tuple([z.string(), share])),
  revenue_by_category: z.array(z.tuple([z.string(), money, z.number().int()])).length(10),
  review_score_by_month_2018: z.array(z.tuple([month, z.number().min(1).max(5)])),
  aov_by_month_2018: z.array(z.tuple([month, money])),
  orders_revenue_by_month_2017: z.array(z.tuple([month, z.number().int(), money])).length(12),
  lowest_review_categories: z.array(z.tuple([z.string(), z.number().min(1).max(5), z.number().int()])),
  top_review_categories: z.array(z.tuple([z.string(), z.number().min(1).max(5), z.number().int()])),
  unique_customers: z.number().int().positive(),
  repeat_customers: z.number().int().positive(),
  delivery_days_by_state: z.array(z.tuple([stateCode, z.number().positive(), z.number().int()])),
  sp: z.object({
    orders: z.number().int(),
    top_cities_by_orders: z.array(z.tuple([z.string(), z.number().int()])),
    late_delivery_rate: share,
    payment_share: z.array(z.tuple([z.string(), share])),
    revenue_by_category: z.array(z.tuple([z.string(), money])),
    review_score_by_month_2018: z.array(z.tuple([month, z.number()])),
  }),
  order_statuses: z.array(z.string()),
  top_customer_cities: z.array(z.string()),
})

const Column = z.object({
  id: z.string(),
  name: z.string().regex(/^[a-z_]+$/),
  data_type: z.string().min(1),
  description: z.string().min(1),
  description_source: z.enum(["llm", "human"]),
  is_pk: z.boolean(),
  fk_ref: z
    .string()
    .regex(/^[a-z_]+\.[a-z_]+$/)
    .nullable(),
  semantic_type: z.enum(["currency_brl", "percent", "count", "number", "date"]).nullable(),
  sample_values: z.array(z.union([z.string(), z.number()])),
})
const Table = z.object({
  id: z.string(),
  name: z.string(),
  schema_name: z.literal("olist"),
  row_count: z.number().int().positive(),
  column_count: z.number().int().positive(),
  description: z.string().min(1),
  description_source: z.enum(["llm", "human"]),
  columns: z.array(Column).min(2),
})

describe("fixtures", () => {
  it("olist aggregates match their schema", () => {
    expect(() => Aggregates.parse(aggregates)).not.toThrow()
  })

  it("catalog tables are well formed and foreign keys point at real columns", () => {
    for (const t of CATALOG) Table.parse(t)
    const names = new Set(CATALOG.flatMap((t) => t.columns.map((c) => `${t.name}.${c.name}`)))
    for (const c of CATALOG.flatMap((t) => t.columns)) if (c.fk_ref) expect(names.has(c.fk_ref), c.fk_ref).toBe(true)
  })

  it("the semantic layer is a verbatim copy of the backend file", () => {
    expect(METRICS_YAML).toBe(readFileSync(join(ROOT, "backend/semantic/metrics.yaml"), "utf8"))
  })

  it("the evals summary matches the backend's committed results", () => {
    expect(evalSummary).toEqual(JSON.parse(readFileSync(join(ROOT, "backend/evals/results/summary.json"), "utf8")))
  })

  it.each(SCENARIOS.map((s) => [s.id, s] as const))("scenario %s is consistent", (_id, s) => {
    expect(findScenario(s.question)?.id, "its own question selects it").toBe(s.id)
    for (const r of [s.result, s.regional]) {
      if (!r) continue
      const names = r.columns.map((c) => c.name)
      for (const row of r.rows) expect(row).toHaveLength(names.length)
      if (r.chart.x) expect(names).toContain(r.chart.x)
      if (r.chart.y) expect(names).toContain(r.chart.y)
      expect(r.summary).not.toMatch(/—|!|NaN|undefined/)
    }
    for (const c of s.candidates) {
      if (s.blocked) expect(c.sql).toMatch(/^(DELETE|DROP|UPDATE|INSERT|TRUNCATE|ALTER)/)
      else expect(c.sql).toMatch(/^(SELECT|WITH)\b/)
    }
    if (!s.blocked && !s.clarify) expect(s.result ?? s.regional).toBeDefined()
  })

  it("every suggestion and every seeded question is answered for its persona", () => {
    const check = (q: string, p: PersonaKey) => expect(plan(q, p).kind, `${p}: ${q}`).not.toBe("unscripted")
    for (const q of SUGGESTIONS.all) check(q, "admin")
    for (const q of SUGGESTIONS.regional) check(q, "regional")
    for (const [p, list] of Object.entries(HISTORY) as [PersonaKey, (typeof HISTORY)[PersonaKey]][])
      for (const c of list) for (const q of c.questions) check(q, p)
  })

  it("personas are fictional and use example.com", () => {
    for (const p of Object.values(PERSONAS)) expect(p.email).toMatch(/@example\.com$/)
    expect(VERIFIED.every((v) => v.sql.startsWith("SELECT"))).toBe(true)
  })

  it("the headline answer quotes the real 2018 Q2 numbers", () => {
    const s = findScenario("Which 5 states had the highest revenue last quarter?")
    expect(s?.result?.rows[0]).toEqual(["SP", 1179247.29])
    expect(s?.result?.summary).toContain("R$1.18M")
    expect(s?.regional?.rows).toEqual([["SP", 1179247.29]])
  })
})
