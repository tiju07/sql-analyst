import { Suspense } from "react"

import { LoginForm } from "@/components/auth/LoginForm"
import { UserMenu } from "@/components/layout/UserMenu"
import type { StreamEvent } from "@/lib/answer"
import { api, ApiError, loginUrl, noticeFromError, unwrap, type ErrorBody } from "@/lib/api/client"
import { EXAMPLES } from "@/lib/personas"
import { readSse } from "@/lib/sse"

import type { DataApi, Mode } from "./types"

/** The full-stack mode: every call goes to the FastAPI backend through the generated client. */

async function* streamRun(path: string, body: object, signal: AbortSignal): AsyncGenerator<StreamEvent> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    signal,
  })
  if (res.status === 401) {
    window.location.assign(loginUrl())
    throw new ApiError(401, "UNAUTHENTICATED", "Signed out.")
  }
  if (!res.ok || !res.body) {
    const err = (await res.json().catch(() => null)) as ErrorBody | null
    if (err) noticeFromError(err)
    throw new ApiError(res.status, err?.code ?? "INTERNAL", err?.message ?? "The request failed.")
  }
  for await (const msg of readSse(res.body)) {
    yield { event: msg.event, data: JSON.parse(msg.data) } as StreamEvent
  }
}

async function noContent(res: { response: Response }, what: string): Promise<void> {
  if (!res.response.ok) throw new ApiError(res.response.status, "INTERNAL", `${what} failed.`)
}

const data: DataApi = {
  me: async () => unwrap(await api.GET("/api/auth/me")),

  conversations: async (q) => unwrap(await api.GET("/api/conversations", { params: { query: q ? { q } : {} } })),
  conversation: async (id) =>
    unwrap(await api.GET("/api/conversations/{conv_id}", { params: { path: { conv_id: id } } })),
  renameConversation: async (id, title) =>
    unwrap(await api.PATCH("/api/conversations/{conv_id}", { params: { path: { conv_id: id } }, body: { title } })),
  deleteConversation: async (id) =>
    noContent(await api.DELETE("/api/conversations/{conv_id}", { params: { path: { conv_id: id } } }), "Delete"),

  chat: (body, signal) => streamRun("/api/chat", body, signal),
  clarify: (runId, body, signal) => streamRun(`/api/runs/${runId}/clarify`, body, signal),
  cancelRun: async (runId) => {
    unwrap(await api.POST("/api/runs/{run_id}/cancel", { params: { path: { run_id: runId } } }))
  },

  run: async (id) => unwrap(await api.GET("/api/runs/{run_id}", { params: { path: { run_id: id } } })),
  rows: async (id, page) =>
    unwrap(await api.GET("/api/runs/{run_id}/rows", { params: { path: { run_id: id }, query: page ?? {} } })),
  downloadCsv: async (runId) => {
    const a = document.createElement("a")
    a.href = `/api/runs/${runId}/export.csv`
    a.download = ""
    a.click()
  },

  feedback: async (body) => unwrap(await api.POST("/api/feedback", { body })),
  verified: async (status) => unwrap(await api.GET("/api/verified", { params: { query: { status } } })),
  proposeVerified: async (body) => unwrap(await api.POST("/api/verified", { body })),
  approveVerified: async (id) =>
    unwrap(await api.POST("/api/verified/{verified_id}/approve", { params: { path: { verified_id: id } } })),
  rejectVerified: async (id) =>
    noContent(await api.DELETE("/api/verified/{verified_id}", { params: { path: { verified_id: id } } }), "Reject"),

  tables: async () => unwrap(await api.GET("/api/catalog/tables")),
  table: async (id) => unwrap(await api.GET("/api/catalog/tables/{table_id}", { params: { path: { table_id: id } } })),
  patchTable: async (id, body) =>
    unwrap(await api.PATCH("/api/catalog/tables/{table_id}", { params: { path: { table_id: id } }, body })),
  patchColumn: async (id, body) =>
    unwrap(await api.PATCH("/api/catalog/columns/{column_id}", { params: { path: { column_id: id } }, body })),
  metrics: async () => unwrap(await api.GET("/api/semantic/metrics")),
  saveMetrics: async (body) => unwrap(await api.PUT("/api/semantic/metrics", { body })),
  connections: async () => unwrap(await api.GET("/api/connections")),
  syncConnection: async (id) =>
    unwrap(await api.POST("/api/connections/{connection_id}/sync", { params: { path: { connection_id: id } } })),
  job: async (id) => unwrap(await api.GET("/api/jobs/{job_id}", { params: { path: { job_id: id } } })),
}

function SignIn() {
  return (
    <div className="grid w-full max-w-3xl gap-8">
      <div className="grid gap-2">
        <h1 className="text-2xl tracking-tight">Sign in</h1>
        <p className="text-fg-muted max-w-prose">
          The demo runs on the public Olist dataset. Queries are read-only and every answer shows its SQL.
        </p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  )
}

export const mode: Mode = { isDemo: false, data, SignIn, AccountMenu: UserMenu, examples: EXAMPLES }
