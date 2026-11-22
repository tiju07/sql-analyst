import { findScenario, scenarioById, type Scenario, type ScenarioResult } from "@/fixtures/scenarios"
import type { PersonaKey } from "@/fixtures/workspace"
import type { RunStatus, StageName, StreamEvent } from "@/lib/answer"
import type { Schemas } from "@/lib/api/errors"

/**
 * Pure functions that turn a scripted scenario into what the backend would produce: the persisted
 * run (RunOut), its rows, and the SSE events on a fixed schedule. No clock, no randomness, so the
 * same question always plays the same way.
 */

type RunOut = Schemas["RunOut"]
export type Timed = { at: number; ev: StreamEvent }
export type BuiltRun = { run: RunOut; rows: Schemas["RowsEvent"] | null; events: Timed[] }

const ROW_LIMIT = 1000
/** Stream plays at this fraction of the recorded stage timings, so an answer takes 2 to 4 s. */
const PACE = 0.55

export const NOT_SCRIPTED =
  "This question is not in the demo script. The public demo answers a fixed set of questions from precomputed results on the Olist data. Try one of the suggested questions."
export const NOT_SCRIPTED_REGIONAL =
  "The demo script has no São Paulo result for this question. Try one of the suggested questions, or switch the persona back to Ana Admin."

/** The guard re-renders SQL and caps LIMIT at the row limit. */
export function guarded(sql: string): string {
  return /\blimit\s+\d+\s*$/i.test(sql) ? sql : `${sql}\nLIMIT ${ROW_LIMIT}`
}

function resultFor(s: Scenario, persona: PersonaKey): ScenarioResult | undefined {
  return persona === "regional" ? s.regional : s.result
}

type Plan =
  | { kind: "answer"; scenario: Scenario; result: ScenarioResult }
  | { kind: "clarify"; scenario: Scenario }
  | { kind: "blocked"; scenario: Scenario }
  | { kind: "unscripted"; scenario?: Scenario; message: string }

/** Decide how a question (or a clarification reply) plays for this persona. */
export function plan(question: string, persona: PersonaKey, clarifyReply?: { from: string; reply: string }): Plan {
  let scenario: Scenario | undefined
  if (clarifyReply) {
    const from = scenarioById(clarifyReply.from)
    const nextId = from?.clarify?.next[clarifyReply.reply] ?? findScenario(`${question} ${clarifyReply.reply}`)?.id
    scenario = nextId ? scenarioById(nextId) : undefined
  } else {
    scenario = findScenario(question)
  }
  if (!scenario) return { kind: "unscripted", message: NOT_SCRIPTED }
  if (scenario.blocked) return { kind: "blocked", scenario }
  if (scenario.clarify) return { kind: "clarify", scenario }
  const result = resultFor(scenario, persona)
  if (!result)
    return { kind: "unscripted", scenario, message: persona === "regional" ? NOT_SCRIPTED_REGIONAL : NOT_SCRIPTED }
  return { kind: "answer", scenario, result }
}

function candidatesOut(s: Scenario, rowCount: number | null, blocked: boolean): Schemas["CandidateOut"][] {
  return s.candidates.map((c, index) => ({
    index,
    sql: c.sql,
    safe_sql: blocked ? null : guarded(c.sql),
    status: blocked ? "blocked" : "ok",
    repairs: c.fails ? 1 : 0,
    attempts: c.fails ? [{ sql: c.fails.sql, error: c.fails.error, kind: "execute" }] : [],
    assumptions: c.assumptions,
    row_count: blocked ? null : rowCount,
    result_hash: null,
  }))
}

function contextOut(s: Scenario, persona: PersonaKey): Schemas["ContextOut"] {
  const notes = [...s.context.notes]
  if (persona === "regional")
    notes.push(
      "Row scope: customer_state = 'SP', set as a signed session value and enforced by Postgres row-level security.",
    )
  return {
    tables: s.context.tables,
    metrics: s.context.metrics,
    notes,
    values: [],
    fewshot: [],
    columns: [],
    schema_block: "",
  }
}

type Ids = { runId: string; conversationId: string; createdAt: string }

/**
 * Build the run and its event schedule.
 * `resumeFrom` continues a run that paused on a clarifying question: the stream picks up at Generate.
 */
export function buildRun(
  question: string,
  persona: PersonaKey,
  ids: Ids,
  resume?: { from: string; reply: string; clarification: Schemas["ClarificationOut"] },
): BuiltRun {
  const p = plan(question, persona, resume)
  const events: Timed[] = []
  let at = 0
  const timings: Record<string, number> = {}
  const push = (ev: StreamEvent, dt = 0) => {
    at += dt
    events.push({ at, ev })
  }
  const stage = (name: StageName, ms: number, during?: (start: number, len: number) => void) => {
    const len = Math.round(ms * PACE)
    push({ event: "stage", data: { stage: name, status: "start", ms: null } })
    const start = at
    during?.(start, len)
    at = start + len
    push({ event: "stage", data: { stage: name, status: "end", ms } })
    timings[name] = ms
  }

  push({ event: "run", data: { run_id: ids.runId, conversation_id: ids.conversationId } })

  const scenario = p.scenario
  const t = scenario?.timings ?? { retrieve: 640, clarify: 220 }
  if (!resume) {
    stage("retrieve", t.retrieve ?? 600)
    stage("clarify", t.clarify ?? 240)
  }

  let status: RunStatus
  let rows: Schemas["RowsEvent"] | null = null
  let error: Schemas["ErrorEvent"] | null = null
  let clarification: Schemas["ClarificationOut"] | null = resume?.clarification ?? null
  let summary: { text: string; caveats: string[] } | null = null
  let chart: Schemas["ChartSpec"] | null = null

  if (p.kind === "clarify") {
    const c = p.scenario.clarify!
    clarification = { question: c.question, options: c.options, answer: null }
    push({ event: "clarify", data: { question: c.question, options: c.options } }, 60)
    status = "clarifying"
  } else if (p.kind === "unscripted") {
    error = { code: "INVALID", message: p.message, retryable: false }
    push({ event: "error", data: error }, 80)
    status = "failed"
  } else {
    const s = p.scenario
    const n = s.candidates.length
    stage("generate", s.timings.generate ?? 900, (start, len) => {
      s.candidates.forEach((c, i) => {
        const sql = c.fails ? c.fails.sql : c.sql
        events.push({
          at: start + Math.round(((i + 1) * len) / (n + 1)),
          ev: { event: "sql", data: { candidate_index: i, attempt: 0, sql } },
        })
      })
    })
    stage("guard", s.timings.guard ?? 30)
    if (p.kind === "blocked") {
      error = { code: "BLOCKED_UNSAFE", message: s.blocked!, retryable: false }
      push({ event: "error", data: error }, 60)
      status = "blocked"
    } else {
      const result = p.result
      stage("execute", s.timings.execute ?? 500)
      const failing = s.candidates.map((c, i) => [c, i] as const).filter(([c]) => c.fails)
      if (failing.length) {
        stage("repair", s.timings.repair ?? 800, (start, len) => {
          failing.forEach(([c, i]) => {
            events.push({
              at: start + Math.round(len * 0.6),
              ev: { event: "sql", data: { candidate_index: i, attempt: 1, sql: c.sql } },
            })
          })
        })
      }
      stage("select", s.timings.select ?? 20)
      rows = { columns: result.columns, rows: result.rows, row_count: result.rows.length, truncated: false }
      chart = { series: null, x: null, x_format: null, y: null, y_format: null, ...result.chart }
      push({ event: "rows", data: rows })
      push({ event: "chart", data: chart })
      stage("compose", s.timings.compose ?? 900)
      summary = { text: result.summary, caveats: result.caveats }
      push({ event: "summary", data: summary })
      status = "ok"
    }
  }

  const usage = scenario?.usage ?? { input: 1800, output: 60, costUsd: 0.002 }
  const latency = Object.values(timings).reduce((a, b) => a + b, 0)
  const traceId = `demo-${ids.runId}`
  push(
    {
      event: "done",
      data: { run_id: ids.runId, status, latency_ms: latency, cost_usd: usage.costUsd, trace_id: traceId },
    },
    40,
  )

  const answered = status === "ok"
  const candidates =
    scenario && p.kind !== "clarify" && p.kind !== "unscripted"
      ? candidatesOut(scenario, rows?.row_count ?? null, p.kind === "blocked")
      : []
  const run: RunOut = {
    id: ids.runId,
    conversation_id: ids.conversationId,
    question,
    status,
    created_at: ids.createdAt,
    candidates,
    chosen_sql: answered ? (candidates[0]?.safe_sql ?? null) : null,
    clarification,
    context: scenario ? contextOut(scenario, persona) : null,
    chart_spec: chart,
    summary: summary?.text ?? null,
    caveats: summary?.caveats ?? [],
    error_code: error?.code ?? null,
    error_message: error?.message ?? null,
    stage_timings: timings,
    latency_ms: latency,
    input_tokens: usage.input,
    output_tokens: usage.output,
    cost_usd: usage.costUsd,
    rows_returned: rows?.row_count ?? null,
    trace_id: traceId,
  }
  return { run, rows, events }
}
