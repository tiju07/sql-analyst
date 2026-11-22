"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useRef, useState } from "react"

import { activeStage, fromRun, newAnswer, reduce, type Answer, type StreamEvent } from "@/lib/answer"
import { announce } from "@/lib/announce"
import { mode } from "app-mode"

import type { Schemas } from "@/lib/api/errors"
import { ApiError, noticeFromError } from "@/lib/api/errors"
import { keys } from "@/lib/api/queries"

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
        const run = await mode.data.run(runId).catch(() => null)
        if (!run) continue // still offline or transient error: keep trying
        if (run.status === "running") continue
        const rows =
          run.status === "ok" || run.status === "repaired"
            ? await mode.data.rows(runId).catch(() => undefined)
            : undefined
        const recovered = fromRun(run, rows)
        update(key, () => ({ ...recovered, key }))
        announce(recovered.phase === "done" ? "Answer ready." : "Run finished.")
        return
      }
    },
    [update],
  )

  const run = useCallback(
    async (key: string, open: (signal: AbortSignal) => AsyncIterable<StreamEvent>) => {
      const controller = new AbortController()
      abortRef.current = controller
      setStreaming(true)
      try {
        let lastStage = ""
        for await (const ev of open(controller.signal)) {
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
            error: {
              code: (e instanceof ApiError ? e.code : "INTERNAL") as Schemas["ErrorEvent"]["code"],
              message: e instanceof Error ? e.message : String(e),
              retryable: true,
            },
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
      return run(key, (signal) => mode.data.chat({ question, conversation_id: conversationId ?? null }, signal))
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
      const runId = answer.runId
      return run(answer.key, (signal) => mode.data.clarify(runId, { answer: reply }, signal))
    },
    [run],
  )

  const stop = useCallback(async () => {
    const current = currentRef.current
    abortRef.current?.abort()
    if (current) update(current.key, (a) => ({ ...a, phase: "cancelled", status: "cancelled" }))
    if (current?.runId) {
      await mode.data.cancelRun(current.runId).catch(() => undefined)
      refreshLists(current.conversationId)
    }
    announce("Stopped.")
  }, [refreshLists, update])

  const reset = useCallback(() => setAnswers([]), [])

  return { answers, streaming, ask, clarify, stop, reset }
}
