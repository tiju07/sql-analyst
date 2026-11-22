import { describe, expect, it } from "vitest"

import type { StreamEvent } from "@/lib/answer"
import { createDemoApi } from "@/lib/demo/api"
import { buildRun, NOT_SCRIPTED } from "@/lib/demo/runs"

const fast = () => createDemoApi({ read: 0, write: 0, pace: 0 })

async function collect(stream: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = []
  for await (const ev of stream) out.push(ev)
  return out
}

const ids = { runId: "r1", conversationId: "c1", createdAt: "2026-01-01T00:00:00Z" }

describe("scripted runs", () => {
  it("plays a full answer in backend event order on a fixed schedule", () => {
    const { events, run, rows } = buildRun("Which 5 states had the highest revenue last quarter?", "admin", ids)
    const names = events.map((e) => e.ev.event)
    expect(names[0]).toBe("run")
    expect(names.at(-1)).toBe("done")
    expect(names.indexOf("rows")).toBeLessThan(names.indexOf("summary"))
    const times = events.map((e) => e.at)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
    expect(times.at(-1)).toBeGreaterThan(2000)
    expect(times.at(-1)).toBeLessThan(5000)
    const starts = events.filter((e) => e.ev.event === "stage" && e.ev.data.status === "start").length
    const ends = events.filter((e) => e.ev.event === "stage" && e.ev.data.status === "end").length
    expect(starts).toBe(ends)
    // Three candidates, one of which fails once and is repaired.
    expect(events.filter((e) => e.ev.event === "sql")).toHaveLength(4)
    expect(run.status).toBe("ok")
    expect(run.candidates[2].attempts[0].error).toBe("column i.revenue does not exist")
    expect(rows?.rows).toHaveLength(5)
    expect(buildRun("Which 5 states had the highest revenue last quarter?", "admin", ids)).toEqual(
      buildRun("Which 5 states had the highest revenue last quarter?", "admin", ids),
    )
  })

  it("blocks unsafe SQL before execution", () => {
    const { events, run } = buildRun("Delete all canceled orders", "admin", ids)
    const err = events.find((e) => e.ev.event === "error")?.ev
    expect(err).toMatchObject({ event: "error", data: { code: "BLOCKED_UNSAFE" } })
    expect(events.some((e) => e.ev.event === "stage" && e.ev.data.stage === "execute")).toBe(false)
    expect(run.status).toBe("blocked")
    expect(run.chosen_sql).toBeNull()
  })

  it("answers honestly when a question is not scripted", () => {
    const { run } = buildRun("What is the weather in Recife?", "admin", ids)
    expect(run.status).toBe("failed")
    expect(run.error_message).toBe(NOT_SCRIPTED)
  })

  it("applies row-level security for the SP regional manager", () => {
    const { rows, run } = buildRun("Revenue by state last quarter", "regional", ids)
    expect(rows?.rows).toEqual([["SP", 1179247.29]])
    expect(run.context?.notes.join(" ")).toContain("row-level security")
  })
})

describe("DemoApi", () => {
  it("streams a new conversation and persists the run", async () => {
    const api = fast()
    const events = await collect(
      api.chat({ question: "What is our late delivery rate?", conversation_id: null }, new AbortController().signal),
    )
    const first = events[0]
    expect(first.event).toBe("run")
    if (first.event !== "run") return
    const run = await api.run(first.data.run_id)
    expect(run.status).toBe("ok")
    expect((await api.rows(run.id)).rows).toEqual([[0.0811]])
    const list = await api.conversations()
    expect(list[0].id).toBe(first.data.conversation_id)
  })

  it("asks a clarifying question, then resumes with the reply", async () => {
    const api = fast()
    const signal = new AbortController().signal
    const first = await collect(
      api.chat({ question: "Which are our best product categories?", conversation_id: null }, signal),
    )
    expect(first.at(-1)).toMatchObject({ event: "done", data: { status: "clarifying" } })
    const runId = (first[0] as Extract<StreamEvent, { event: "run" }>).data.run_id
    const resumed = await collect(api.clarify(runId, { answer: "Revenue" }, signal))
    const rows = resumed.find((e) => e.event === "rows")
    expect(rows?.event === "rows" && rows.data.rows[0][0]).toBe("health_beauty")
    const run = await api.run(runId)
    expect(run.clarification?.answer).toBe("Revenue")
    expect(Object.keys(run.stage_timings)).toEqual(
      expect.arrayContaining(["retrieve", "clarify", "generate", "compose"]),
    )
  })

  it("stops a stream when the signal aborts", async () => {
    const api = createDemoApi({ read: 0, write: 0, pace: 1 })
    const ctrl = new AbortController()
    const stream = api.chat({ question: "What is our late delivery rate?", conversation_id: null }, ctrl.signal)
    const it = stream[Symbol.asyncIterator]()
    await it.next()
    ctrl.abort()
    await expect(it.next()).rejects.toBeDefined()
  })

  it("simulates the verified-query workflow with role checks", async () => {
    const api = fast()
    const [conv] = await api.conversations()
    const detail = await api.conversation(conv.id)
    const proposed = await api.proposeVerified({ run_id: detail.runs[0].id, question: "Top states last quarter" })
    expect((await api.verified("proposed")).map((v) => v.id)).toContain(proposed.id)
    api.setPersona("analyst")
    await expect(api.approveVerified(proposed.id)).rejects.toMatchObject({ status: 403 })
    api.setPersona("admin")
    expect((await api.approveVerified(proposed.id)).status).toBe("approved")
  })

  it("validates metric edits like the backend", async () => {
    const api = fast()
    await expect(
      api.saveMetrics({ yaml: "metrics:\n  - name: Bad Name\n    description: x\n    sql_expr: SUM(1)\n" }),
    ).rejects.toMatchObject({ status: 422 })
    await expect(api.saveMetrics({ yaml: "metrics: [" })).rejects.toMatchObject({ status: 422 })
    const ok = await api.saveMetrics({
      yaml: "metrics:\n  - name: revenue\n    description: Revenue\n    sql_expr: SUM(order_items.price)\n",
    })
    expect(ok.layer.metrics).toHaveLength(1)
  })

  it("keeps each persona's history separate and resets on a new instance", async () => {
    const api = fast()
    const admin = await api.conversations()
    api.setPersona("regional")
    const regional = await api.conversations()
    expect(regional.map((c) => c.id)).not.toEqual(admin.map((c) => c.id))
    await api.deleteConversation(regional[0].id)
    expect(await fast().conversations()).toHaveLength(admin.length)
  })

  it("runs a catalog sync job to completion", async () => {
    let now = 0
    const api = createDemoApi({ read: 0, write: 0, pace: 0 }, () => now)
    const job = await api.syncConnection("conn-olist")
    expect((await api.job(job.job_id)).status).toBe("in_progress")
    now = 3000
    expect((await api.job(job.job_id)).status).toBe("complete")
  })
})
