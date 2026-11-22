import { CATALOG, CONNECTION } from "@/fixtures/catalog"
import { METRICS_YAML } from "@/fixtures/metrics"
import { findScenario } from "@/fixtures/scenarios"
import { DEFAULT_PERSONA, HISTORY, PERSONAS, seedRunId, VERIFIED, type PersonaKey } from "@/fixtures/workspace"
import type { StreamEvent } from "@/lib/answer"
import { ApiError, type Schemas } from "@/lib/api/errors"
import type { DataApi } from "@/lib/mode/types"

import { buildRun, type Timed } from "./runs"

/**
 * The static demo's backend: the same DataApi as the real client, answered from fixtures and an
 * in-memory store. Writes change the store so the UI feels alive; nothing persists, a reload
 * resets everything. Reads wait a little and writes about a second, so loading states show.
 */

type Conversation = Schemas["ConversationDetail"]
type Delays = { read: number; write: number; pace: number }

const HOUR = 3_600_000

function clone<T>(v: T): T {
  return structuredClone(v)
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const t = setTimeout(resolve, ms)
    signal?.addEventListener("abort", () => {
      clearTimeout(t)
      reject(signal.reason)
    })
  })
}

/** Conversation list rows carry no runs. */
function summary({ runs, ...c }: Conversation): Schemas["ConversationOut"] {
  void runs
  return clone(c)
}

const notFound = (what: string) => new ApiError(404, "NOT_FOUND", `${what} not found.`)
const forbidden = () => new ApiError(403, "FORBIDDEN", "Only an admin can do this. Switch the persona to Ana Admin.")

function titleFrom(question: string): string {
  const t = question.replace(/\?$/, "")
  return t.length > 60 ? `${t.slice(0, 57)}...` : t
}

function toCsv(rows: Schemas["RowsEvent"]): string {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [rows.columns.map((c) => cell(c.name)).join(","), ...rows.rows.map((r) => r.map(cell).join(","))].join("\n")
}

export type DemoApi = DataApi & {
  persona(): PersonaKey
  setPersona(key: PersonaKey): void
  subscribe(listener: () => void): () => void
}

export function createDemoApi(
  delays: Delays = { read: 220, write: 1000, pace: 1 },
  now: () => number = Date.now,
): DemoApi {
  let persona: PersonaKey = DEFAULT_PERSONA
  let seq = 0
  const listeners = new Set<() => void>()
  const conversations = new Map<PersonaKey, Conversation[]>()
  const rows = new Map<string, Schemas["RowsEvent"]>()
  const scenarioOf = new Map<string, string>()
  const feedback = new Map<string, Schemas["FeedbackOut"]>()
  const jobs = new Map<string, number>()
  const tables = clone(CATALOG)
  const t0 = now()
  let verified: Schemas["VerifiedOut"][] = VERIFIED.map((v, i) => ({
    ...v,
    created_at: new Date(t0 - (i + 1) * 26 * HOUR).toISOString(),
  }))
  // The YAML parser loads only when the metrics tab is opened.
  const parse = async (text: string): Promise<unknown> => (await import("yaml")).parse(text)
  let metrics: Schemas["SemanticLayerOut"] | null = null
  const metricsInitialUpdate = new Date(t0 - 72 * HOUR).toISOString()

  const read = () => sleep(delays.read)
  const write = () => sleep(delays.write)
  const me = () => PERSONAS[persona]
  const list = () => {
    if (!conversations.has(persona)) conversations.set(persona, seed(persona))
    return conversations.get(persona)!
  }
  const findConversation = (id: string) => list().find((c) => c.id === id)
  const findRun = (id: string, anyPersona = false) => {
    const pool = anyPersona
      ? (Object.keys(PERSONAS) as PersonaKey[]).flatMap((k) => {
          if (!conversations.has(k)) conversations.set(k, seed(k))
          return conversations.get(k)!
        })
      : list()
    for (const c of pool) {
      const r = c.runs.find((x) => x.id === id)
      if (r) return { conversation: c, run: r }
    }
    return undefined
  }

  function save(conversation: Conversation, run: Schemas["RunOut"], built: Schemas["RowsEvent"] | null) {
    const i = conversation.runs.findIndex((r) => r.id === run.id)
    if (i >= 0) {
      const prev = conversation.runs[i]
      const stage_timings = { ...prev.stage_timings, ...run.stage_timings }
      run = { ...run, stage_timings, latency_ms: Object.values(stage_timings).reduce((a, b) => a + b, 0) }
      conversation.runs[i] = run
    } else conversation.runs.push(run)
    if (built) rows.set(run.id, built)
    conversation.updated_at = new Date(now()).toISOString()
  }

  /** History: each seeded question is run through the same script the live stream uses. */
  function seed(key: PersonaKey): Conversation[] {
    return HISTORY[key].map((h) => {
      const at = new Date(t0 - h.hoursAgo * HOUR).toISOString()
      const c: Conversation = { id: h.id, title: h.title, created_at: at, updated_at: at, runs: [] }
      h.questions.forEach((q, i) => {
        const runId = seedRunId(h.id, i)
        const built = buildRun(q, key, { runId, conversationId: c.id, createdAt: at })
        const id = findScenario(q)?.id
        if (id) scenarioOf.set(runId, id)
        save(c, built.run, built.rows)
        c.updated_at = at
      })
      return c
    })
  }

  async function* play(
    built: { events: Timed[] },
    onDone: () => void,
    signal: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    let last = 0
    for (const { at, ev } of built.events) {
      await sleep((at - last) * delays.pace, signal)
      last = at
      if (ev.event === "done") onDone()
      yield ev
    }
  }

  const api: DemoApi = {
    persona: () => persona,
    setPersona(key) {
      persona = key
      listeners.forEach((l) => l())
    },
    subscribe(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },

    me: async () => {
      await read()
      return clone(me())
    },

    conversations: async (q) => {
      await read()
      const needle = q?.trim().toLowerCase()
      return list()
        .filter(
          (c) =>
            !needle ||
            c.title.toLowerCase().includes(needle) ||
            c.runs.some((r) => r.question.toLowerCase().includes(needle)),
        )
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map(summary)
    },
    conversation: async (id) => {
      await read()
      const c = findConversation(id)
      if (!c) throw notFound("Conversation")
      return clone(c)
    },
    renameConversation: async (id, title) => {
      await write()
      const c = findConversation(id)
      if (!c) throw notFound("Conversation")
      c.title = title
      return summary(c)
    },
    deleteConversation: async (id) => {
      await write()
      conversations.set(
        persona,
        list().filter((c) => c.id !== id),
      )
    },

    chat(body, signal) {
      seq += 1
      const createdAt = new Date(now()).toISOString()
      let c = body.conversation_id ? findConversation(body.conversation_id) : undefined
      if (!c) {
        c = {
          id: `c-live-${seq}`,
          title: titleFrom(body.question),
          created_at: createdAt,
          updated_at: createdAt,
          runs: [],
        }
        list().unshift(c)
      }
      const conversation = c
      const runId = `r-live-${seq}`
      const built = buildRun(body.question, persona, { runId, conversationId: conversation.id, createdAt })
      const id = findScenario(body.question)?.id
      if (id) scenarioOf.set(runId, id)
      // The run exists from the start, like a server-side run that is still going.
      save(conversation, { ...built.run, status: "running", summary: null, chosen_sql: null }, null)
      return play(built, () => save(conversation, built.run, built.rows), signal)
    },
    clarify(runId, body, signal) {
      const found = findRun(runId)
      if (!found) throw notFound("Run")
      const { conversation, run } = found
      const clarification = { ...(run.clarification ?? { question: "", options: [] }), answer: body.answer }
      const from = scenarioOf.get(runId) ?? ""
      const built = buildRun(
        run.question,
        persona,
        { runId, conversationId: conversation.id, createdAt: run.created_at },
        { from, reply: body.answer, clarification },
      )
      return play(built, () => save(conversation, built.run, built.rows), signal)
    },
    cancelRun: async (runId) => {
      const found = findRun(runId)
      if (found && found.run.status === "running") found.run.status = "cancelled"
    },

    run: async (id) => {
      await read()
      // Shared run links (/runs/:id) open for every persona, like an admin viewing a run.
      const found = findRun(id, true)
      if (!found) throw notFound("Run")
      return clone(found.run)
    },
    rows: async (id, page) => {
      await read()
      findRun(id, true) // seeds the owner's history if needed
      const r = rows.get(id)
      if (!r) throw notFound("Rows")
      const offset = page?.offset ?? 0
      const limit = page?.limit ?? 200
      return { ...clone(r), rows: clone(r.rows.slice(offset, offset + limit)), offset }
    },
    downloadCsv: async (runId) => {
      const r = rows.get(runId)
      if (!r) throw notFound("Rows")
      const url = URL.createObjectURL(new Blob([toCsv(r)], { type: "text/csv" }))
      const a = document.createElement("a")
      a.href = url
      a.download = `sql-analyst-${runId}.csv`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },

    feedback: async (body) => {
      await write()
      const out = { run_id: body.run_id, rating: body.rating, comment: body.comment ?? null }
      feedback.set(body.run_id, out)
      return out
    },
    verified: async (status) => {
      await read()
      return clone(
        verified.filter((v) => !status || v.status === status).sort((a, b) => b.created_at.localeCompare(a.created_at)),
      )
    },
    proposeVerified: async (body) => {
      await write()
      const found = findRun(body.run_id)
      if (!found?.run.chosen_sql) throw new ApiError(422, "INVALID", "Only answered questions can be proposed.")
      seq += 1
      const v: Schemas["VerifiedOut"] = {
        id: `v-live-${seq}`,
        question: body.question?.trim() || found.run.question,
        sql: found.run.chosen_sql,
        status: "proposed",
        proposed_by: me().display_name,
        approved_by: null,
        created_at: new Date(now()).toISOString(),
      }
      verified = [v, ...verified]
      return clone(v)
    },
    approveVerified: async (id) => {
      await write()
      if (me().role !== "admin") throw forbidden()
      const v = verified.find((x) => x.id === id)
      if (!v) throw notFound("Verified query")
      v.status = "approved"
      v.approved_by = me().display_name
      return clone(v)
    },
    rejectVerified: async (id) => {
      await write()
      if (me().role !== "admin") throw forbidden()
      verified = verified.filter((x) => x.id !== id)
    },

    tables: async () => {
      await read()
      return tables.map(({ columns, ...t }) => ({ ...clone(t), column_count: columns.length }))
    },
    table: async (id) => {
      await read()
      const t = tables.find((x) => x.id === id)
      if (!t) throw notFound("Table")
      return clone(t)
    },
    patchTable: async (id, body) => {
      await write()
      if (me().role !== "admin") throw forbidden()
      const t = tables.find((x) => x.id === id)
      if (!t) throw notFound("Table")
      t.description = body.description ?? null
      t.description_source = "human"
      return clone(t)
    },
    patchColumn: async (id, body) => {
      await write()
      if (me().role !== "admin") throw forbidden()
      const c = tables.flatMap((t) => t.columns).find((x) => x.id === id)
      if (!c) throw notFound("Column")
      if (body.description !== undefined) {
        c.description = body.description
        c.description_source = "human"
      }
      if (body.semantic_type !== undefined) c.semantic_type = body.semantic_type
      return clone(c)
    },
    metrics: async () => {
      await read()
      metrics ??= {
        yaml: METRICS_YAML,
        layer: (await parse(METRICS_YAML)) as Schemas["SemanticLayer"],
        updated_at: metricsInitialUpdate,
      }
      return clone(metrics)
    },
    saveMetrics: async (body) => {
      await write()
      if (me().role !== "admin") throw forbidden()
      let layer: unknown
      try {
        layer = await parse(body.yaml)
      } catch (e) {
        throw new ApiError(422, "INVALID", `YAML could not be parsed: ${(e as Error).message.split("\n")[0]}`)
      }
      const list = (layer as { metrics?: unknown })?.metrics
      if (!Array.isArray(list) || list.length === 0)
        throw new ApiError(422, "INVALID", "metrics: at least one metric is required.")
      for (const [i, m] of list.entries()) {
        const metric = m as Partial<Record<"name" | "description" | "sql_expr", unknown>>
        if (typeof metric.name !== "string" || !/^[a-z][a-z0-9_]*$/.test(metric.name))
          throw new ApiError(422, "INVALID", `metrics.${i}.name: use lower case letters, digits and underscores.`)
        if (typeof metric.description !== "string" || !metric.description)
          throw new ApiError(422, "INVALID", `metrics.${i}.description is required.`)
        if (typeof metric.sql_expr !== "string" || !metric.sql_expr)
          throw new ApiError(422, "INVALID", `metrics.${i}.sql_expr is required.`)
      }
      metrics = { yaml: body.yaml, layer: layer as Schemas["SemanticLayer"], updated_at: new Date(now()).toISOString() }
      return clone(metrics)
    },
    connections: async () => {
      await read()
      return [clone(CONNECTION)]
    },
    syncConnection: async (id) => {
      await write()
      if (me().role !== "admin") throw forbidden()
      if (id !== CONNECTION.id) throw notFound("Connection")
      seq += 1
      const jobId = `job-${seq}`
      jobs.set(jobId, now())
      return { job_id: jobId, status: "queued", result: null, error: null }
    },
    job: async (id) => {
      await read()
      const started = jobs.get(id)
      if (started === undefined) return { job_id: id, status: "not_found", result: null, error: null }
      const done = now() - started > 2500
      return done
        ? {
            job_id: id,
            status: "complete",
            result: { tables: tables.length, columns: tables.reduce((n, t) => n + t.columns.length, 0) },
            error: null,
          }
        : { job_id: id, status: "in_progress", result: null, error: null }
    },
  }
  return api
}
