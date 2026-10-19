"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useRef, useState } from "react"

import { activeStage, fromRun, newAnswer, reduce, type Answer, type StreamEvent } from "@/lib/answer"
import { announce } from "@/lib/announce"
import { api, loginUrl, noticeFromError, unwrap, type ErrorBody } from "@/lib/api/client"
import { keys } from "@/lib/api/queries"
import { readSse } from "@/lib/sse"

const POLL_MS = 2000

type Options = { conversationId?: string; onConversation?: (id: string) => void }

export function useChatStream({ conversationId, onConversation }: Options) {
  const qc = useQueryClient()
  const [answers, setAnswers] = useState<Answer[]>([])
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const currentRef = useRef<Answer | null>(null)

  const update = useCallback((key: string, fn: (a: Answer) => Answer) => {
    setAnswers((list) =>
      list.map((a) => {
        if (a.key !== key) return a
        const next = fn(a)
        currentRef.current = next
        return next
      }),
    )
  }, [])

  const refreshLists = useCallback(
    (convId?: string) => {
      void qc.invalidateQueries({ queryKey: ["conversations"] })
      if (convId) void qc.invalidateQueries({ queryKey: keys.conversation(convId) })
    },
    [qc],
  )

  /** Connection dropped mid-stream: the run continues server-side, so poll until it settles. */
  const recover = useCallback(
    async (key: string, runId: string) => {
      update(key, (a) => ({ ...a, phase: "reconnecting" }))
      announce("Connection lost. Reconnecting…")
      for (;;) {
        await new Promise((r) => setTimeout(r, POLL_MS))
        const res = await api.GET("/api/runs/{run_id}", { params: { path: { run_id: runId } } })
        if (!res.data) continue // still offline or transient error: keep trying
        const run = res.data
        if (run.status === "running") continue
        const rows =
          run.status === "ok" || run.status === "repaired"
            ? await api.GET("/api/runs/{run_id}/rows", { params: { path: { run_id: runId } } }).then((r) => r.data)
            : undefined
        const recovered = fromRun(run, rows ?? undefined)
        update(key, () => ({ ...recovered, key }))
        announce(recovered.phase === "done" ? "Answer ready." : "Run finished.")
        return
      }
    },
    [update],
  )

  const run = useCallback(
    async (key: string, path: string, body: object) => {
      const controller = new AbortController()
      abortRef.current = controller
      setStreaming(true)
      try {
        const res = await fetch(path, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "text/event-stream" },
          body: JSON.stringify(body),
          credentials: "same-origin",
          signal: controller.signal,
        })
        if (res.status === 401) {
          window.location.assign(loginUrl())
          return
        }
        if (!res.ok || !res.body) {
          const err = (await res.json().catch(() => null)) as ErrorBody | null
          if (err) noticeFromError(err)
          update(key, (a) => ({
            ...a,
            phase: "error",
            error: {
              code: err?.code ?? "INTERNAL",
              message: err?.message ?? "The request failed.",
              retryable: true,
            },
          }))
          return
        }
        let lastStage = ""
        for await (const msg of readSse(res.body)) {
          const ev = { event: msg.event, data: JSON.parse(msg.data) } as StreamEvent
          update(key, (a) => reduce(a, ev))
          if (ev.event === "run") {
            if (!conversationId) onConversation?.(ev.data.conversation_id)
          } else if (ev.event === "stage" && ev.data.status === "start") {
            const label = activeStage(reduce(currentRef.current ?? newAnswer(key, ""), ev))?.active
            if (label && label !== lastStage) announce(`${label}…`)
            lastStage = label ?? lastStage
          } else if (ev.event === "error") {
            noticeFromError({ code: ev.data.code, message: ev.data.message, retry_after_s: null })
          } else if (ev.event === "done") {
            announce(
              ev.data.status === "clarifying"
                ? "A clarifying question needs your answer."
                : ev.data.status === "ok" || ev.data.status === "repaired"
                  ? "Answer ready."
                  : "The question could not be answered.",
            )
            refreshLists(currentRef.current?.conversationId)
          }
        }
        // Stream closed without a done event: the server or network cut it.
        const current = currentRef.current
        if (current && current.phase === "streaming" && current.runId) await recover(key, current.runId)
      } catch (e) {
        if (controller.signal.aborted) return
        const runId = currentRef.current?.runId
        if (runId) await recover(key, runId)
        else
          update(key, (a) => ({
            ...a,
            phase: "error",
            error: { code: "INTERNAL", message: String(e), retryable: true },
          }))
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        setStreaming(false)
      }
    },
    [conversationId, onConversation, recover, refreshLists, update],
  )

  const ask = useCallback(
    (question: string) => {
      const key = crypto.randomUUID()
      const a = newAnswer(key, question)
      currentRef.current = a
      setAnswers((list) => [...list, a])
      announce("Question sent.")
      return run(key, "/api/chat", { question, conversation_id: conversationId ?? null })
    },
    [conversationId, run],
  )

  /** Answer a clarification; the resumed stream continues in the same answer card. */
  const clarify = useCallback(
    (answer: Answer, reply: string) => {
      if (!answer.runId) return
      const resumed: Answer = {
        ...answer,
        phase: "streaming",
        clarify: answer.clarify ? { ...answer.clarify, answer: reply } : undefined,
      }
      currentRef.current = resumed
      setAnswers((list) =>
        list.some((a) => a.key === answer.key)
          ? list.map((a) => (a.key === answer.key ? resumed : a))
          : [...list, resumed],
      )
      return run(answer.key, `/api/runs/${answer.runId}/clarify`, { answer: reply })
    },
    [run],
  )

  const stop = useCallback(async () => {
    const current = currentRef.current
    abortRef.current?.abort()
    if (current) update(current.key, (a) => ({ ...a, phase: "cancelled", status: "cancelled" }))
    if (current?.runId) {
      await api
        .POST("/api/runs/{run_id}/cancel", { params: { path: { run_id: current.runId } } })
        .then(unwrap)
        .catch(() => undefined)
      refreshLists(current.conversationId)
    }
    announce("Stopped.")
  }, [refreshLists, update])

  const reset = useCallback(() => setAnswers([]), [])

  return { answers, streaming, ask, clarify, stop, reset }
}
