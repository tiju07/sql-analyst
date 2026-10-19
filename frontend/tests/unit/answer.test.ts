import { describe, expect, it } from "vitest"

import { activeStage, fromRun, newAnswer, reduce, type Answer, type RunOut, type StreamEvent } from "@/lib/answer"

function play(events: StreamEvent[]): Answer {
  return events.reduce(reduce, newAnswer("k", "Revenue by state"))
}

describe("reduce", () => {
  it("tracks stages, repeated rounds and summed time", () => {
    const a = play([
      { event: "run", data: { run_id: "r", conversation_id: "c" } },
      { event: "stage", data: { stage: "guard", status: "start", ms: null } },
      { event: "stage", data: { stage: "guard", status: "end", ms: 3 } },
      { event: "stage", data: { stage: "guard", status: "start", ms: null } },
    ])
    expect(a.runId).toBe("r")
    expect(a.stages.guard).toMatchObject({ status: "active", ms: 3, rounds: 2 })
    expect(activeStage(a)?.name).toBe("guard")
  })

  it("collects sql attempts and the final result", () => {
    const a = play([
      { event: "sql", data: { sql: "SELECT 1", attempt: 0, candidate_index: 0 } },
      { event: "sql", data: { sql: "SELECT 2", attempt: 1, candidate_index: 0 } },
      { event: "summary", data: { text: "ok", caveats: ["c"] } },
      { event: "done", data: { run_id: "r", status: "repaired", latency_ms: 900, cost_usd: 0.01, trace_id: "t" } },
    ])
    expect(a.sql.map((s) => s.attempt)).toEqual([0, 1])
    expect(a.phase).toBe("done")
    expect(a.status).toBe("repaired")
    expect(a.summary?.caveats).toEqual(["c"])
  })

  it("ends in clarifying or error phases", () => {
    const clar = play([
      { event: "clarify", data: { question: "Which?", options: ["A", "B"] } },
      { event: "done", data: { run_id: "r", status: "clarifying", latency_ms: 1, cost_usd: 0, trace_id: null } },
    ])
    expect(clar.phase).toBe("clarifying")
    expect(clar.clarify?.options).toEqual(["A", "B"])
    const err = play([
      { event: "error", data: { code: "BLOCKED_UNSAFE", message: "no", retryable: false } },
      { event: "done", data: { run_id: "r", status: "blocked", latency_ms: 1, cost_usd: 0, trace_id: null } },
    ])
    expect(err.phase).toBe("error")
  })
})

describe("fromRun", () => {
  const base: RunOut = {
    id: "r",
    conversation_id: "c",
    question: "q",
    status: "ok",
    clarification: null,
    candidates: [
      {
        index: 0,
        sql: "select 1",
        safe_sql: "SELECT 1",
        status: "ok",
        repairs: 0,
        attempts: [],
        assumptions: [],
        row_count: 1,
        result_hash: "h",
      },
    ],
    chosen_sql: "SELECT 1",
    chart_spec: { mark: "kpi", y: "n", title: "N", x: null, series: null, y_format: "count", x_format: null },
    summary: "One.",
    caveats: [],
    rows_returned: 1,
    latency_ms: 1200,
    stage_timings: { retrieve: 10, compose: 5 },
    input_tokens: 1,
    output_tokens: 1,
    cost_usd: 0.002,
    error_code: null,
    error_message: null,
    trace_id: null,
    context: null,
    created_at: "2026-10-19T00:00:00Z",
  }

  it("maps a finished run", () => {
    const a = fromRun(base)
    expect(a.phase).toBe("done")
    expect(a.stages.retrieve).toEqual({ status: "done", ms: 10, rounds: 1 })
    expect(a.sql[0].sql).toBe("SELECT 1")
  })

  it("treats a still-running run as reconnecting", () => {
    expect(fromRun({ ...base, status: "running" }).phase).toBe("reconnecting")
  })
})
