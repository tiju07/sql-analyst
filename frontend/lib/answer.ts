import type { Schemas } from "@/lib/api/client"

export type StageName = Schemas["StageEvent"]["stage"]
export type RunStatus = Schemas["DoneEvent"]["status"]
export type RowsData = Schemas["RowsEvent"]
export type ChartSpec = Schemas["ChartSpec"]
export type RunOut = Schemas["RunOut"]

export const STAGES: { name: StageName; label: string; active: string }[] = [
  { name: "retrieve", label: "Retrieve", active: "Finding relevant tables" },
  { name: "clarify", label: "Clarify", active: "Checking the question is clear" },
  { name: "generate", label: "Generate", active: "Writing candidate queries" },
  { name: "guard", label: "Guard", active: "Checking queries are safe" },
  { name: "execute", label: "Execute", active: "Running queries" },
  { name: "repair", label: "Repair", active: "Fixing a failed query" },
  { name: "select", label: "Select", active: "Comparing results" },
  { name: "compose", label: "Compose", active: "Writing the explanation" },
]

export type StageState = {
  status: "pending" | "active" | "done"
  ms: number
  rounds: number
  startedAt?: number // client clock, for the live timer while active
}

export type Phase = "streaming" | "reconnecting" | "clarifying" | "done" | "error" | "cancelled"

export type Answer = {
  key: string
  question: string
  runId?: string
  conversationId?: string
  phase: Phase
  status?: RunStatus
  stages: Record<StageName, StageState>
  sql: { index: number; attempt: number; sql: string }[]
  rows?: RowsData
  chart?: ChartSpec
  summary?: { text: string; caveats: string[] }
  clarify?: { question: string; options: string[]; answer?: string | null }
  error?: Schemas["ErrorEvent"]
  latencyMs?: number
  costUsd?: number
  traceId?: string | null
  run?: RunOut
}

function emptyStages(): Record<StageName, StageState> {
  return Object.fromEntries(STAGES.map((s) => [s.name, { status: "pending", ms: 0, rounds: 0 }])) as Record<
    StageName,
    StageState
  >
}

export function newAnswer(key: string, question: string): Answer {
  return { key, question, phase: "streaming", stages: emptyStages(), sql: [] }
}

export type StreamEvent =
  | { event: "run"; data: Schemas["RunEvent"] }
  | { event: "stage"; data: Schemas["StageEvent"] }
  | { event: "clarify"; data: Schemas["ClarifyEvent"] }
  | { event: "sql"; data: Schemas["SqlEvent"] }
  | { event: "rows"; data: RowsData }
  | { event: "chart"; data: ChartSpec }
  | { event: "summary"; data: Schemas["SummaryEvent"] }
  | { event: "done"; data: Schemas["DoneEvent"] }
  | { event: "error"; data: Schemas["ErrorEvent"] }

export function reduce(a: Answer, ev: StreamEvent): Answer {
  switch (ev.event) {
    case "run":
      return { ...a, runId: ev.data.run_id, conversationId: ev.data.conversation_id }
    case "stage": {
      const prev = a.stages[ev.data.stage]
      const next: StageState =
        ev.data.status === "start"
          ? { ...prev, status: "active", rounds: prev.rounds + 1, startedAt: Date.now() }
          : { ...prev, status: "done", ms: prev.ms + (ev.data.ms ?? 0) }
      return { ...a, stages: { ...a.stages, [ev.data.stage]: next } }
    }
    case "clarify":
      return { ...a, clarify: { question: ev.data.question, options: ev.data.options } }
    case "sql":
      return { ...a, sql: [...a.sql, { index: ev.data.candidate_index, attempt: ev.data.attempt, sql: ev.data.sql }] }
    case "rows":
      return { ...a, rows: ev.data }
    case "chart":
      return { ...a, chart: ev.data }
    case "summary":
      return { ...a, summary: { text: ev.data.text, caveats: ev.data.caveats } }
    case "error":
      return { ...a, error: ev.data }
    case "done": {
      const phase: Phase =
        ev.data.status === "clarifying"
          ? "clarifying"
          : ev.data.status === "cancelled"
            ? "cancelled"
            : a.error
              ? "error"
              : "done"
      return {
        ...a,
        phase,
        status: ev.data.status,
        latencyMs: ev.data.latency_ms,
        costUsd: ev.data.cost_usd,
        traceId: ev.data.trace_id,
      }
    }
  }
}

/** Rebuild an answer from a persisted run (history, reconnect, share page). */
export function fromRun(run: RunOut, rows?: RowsData): Answer {
  const stages = emptyStages()
  for (const [name, ms] of Object.entries(run.stage_timings)) {
    if (name in stages) stages[name as StageName] = { status: "done", ms, rounds: 1 }
  }
  const phase: Phase =
    run.status === "running"
      ? "reconnecting"
      : run.status === "clarifying"
        ? "clarifying"
        : run.status === "cancelled"
          ? "cancelled"
          : run.error_code
            ? "error"
            : "done"
  return {
    key: run.id,
    question: run.question,
    runId: run.id,
    conversationId: run.conversation_id,
    phase,
    status: run.status,
    stages,
    sql: run.candidates.map((c) => ({ index: c.index, attempt: c.repairs, sql: c.safe_sql ?? c.sql })),
    rows,
    chart: run.chart_spec ?? undefined,
    summary: run.summary ? { text: run.summary, caveats: run.caveats } : undefined,
    clarify: run.clarification ?? undefined,
    error: run.error_code
      ? { code: run.error_code as Schemas["ErrorEvent"]["code"], message: run.error_message ?? "", retryable: true }
      : undefined,
    latencyMs: run.latency_ms ?? undefined,
    costUsd: run.cost_usd,
    traceId: run.trace_id,
    run,
  }
}

export function activeStage(a: Answer): (typeof STAGES)[number] | undefined {
  return STAGES.find((s) => a.stages[s.name].status === "active")
}
