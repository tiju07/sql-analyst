"use client"

import { useQuery } from "@tanstack/react-query"
import { Ban, WifiOff } from "lucide-react"

import { AnswerActions } from "@/components/chat/AnswerActions"
import { ChartView } from "@/components/chat/ChartView"
import { ClarifyCard } from "@/components/chat/ClarifyCard"
import { ResultTable } from "@/components/chat/ResultTable"
import { SqlBlock } from "@/components/chat/SqlBlock"
import { StageStepper } from "@/components/chat/StageStepper"
import { Button } from "@/components/ui/button"
import { Badge, Callout } from "@/design-system"
import { Skeleton } from "@/components/ui/skeleton"
import type { Answer } from "@/lib/answer"
import { mode } from "app-mode"

import { keys } from "@/lib/api/queries"
import { formatMs, formatUsd } from "@/lib/format"

const ERROR_HINT: Record<string, string> = {
  BLOCKED_UNSAFE: "The generated query was blocked by the safety checks, so nothing ran.",
  QUERY_TIMEOUT: "The database stopped the query because it ran too long.",
  NO_ANSWER: "None of the candidate queries produced a usable result.",
  UPSTREAM_LLM: "The AI service didn't respond properly.",
  BUDGET_EXCEEDED: "The demo's AI budget is used up for today.",
  RATE_LIMITED: "Too many questions in a short time.",
  INVALID: "The question could not be answered as asked.",
}

function chosenSql(a: Answer): string | undefined {
  return a.run?.chosen_sql ?? a.sql.at(-1)?.sql
}

export function AnswerCard({
  answer,
  live,
  busy,
  onClarify,
  onInspect,
  onRerun,
  readOnly = false,
}: {
  answer: Answer
  readOnly?: boolean
  live: boolean
  busy: boolean
  onClarify: (reply: string) => void
  onInspect: () => void
  onRerun: () => void
}) {
  const answered = answer.status === "ok" || answer.status === "repaired"
  const needsRows = answered && !answer.rows && Boolean(answer.runId)
  const rows = useQuery({
    queryKey: keys.rows(answer.runId ?? ""),
    queryFn: () => mode.data.rows(answer.runId as string),
    enabled: needsRows,
    staleTime: Infinity,
  })
  const data = answer.rows ?? rows.data
  const sql = chosenSql(answer)

  return (
    <article className="space-y-4" aria-label={`Answer to: ${answer.question}`}>
      <StageStepper answer={answer} live={live && answer.phase === "streaming"} simulated={mode.isDemo} />

      {answer.phase === "reconnecting" && (
        <p role="status" className="text-fg-muted flex items-center gap-2 text-sm">
          <WifiOff aria-hidden className="size-4" />
          Reconnecting… the answer keeps running on the server.
        </p>
      )}

      {answer.clarify && (
        <ClarifyCard
          question={answer.clarify.question}
          options={answer.clarify.options}
          answered={answer.clarify.answer}
          disabled={busy || answer.phase !== "clarifying"}
          onAnswer={onClarify}
        />
      )}

      {answer.error && (
        <div role="alert">
          <Callout
            tone={answer.error.code === "INVALID" ? "info" : "danger"}
            title={ERROR_HINT[answer.error.code] ?? "Something went wrong."}
          >
            <p>{answer.error.message}</p>
            {answer.error.code === "BLOCKED_UNSAFE" ? (
              <p className="text-fg-muted mt-1">
                Rows executed: 0. Three layers stop writes: this guard, a read-only database role, and row-level
                security.
              </p>
            ) : null}
            {answer.error.retryable && answer.error.code !== "BUDGET_EXCEEDED" && (
              <Button size="sm" variant="outline" className="mt-3" onClick={onRerun} disabled={busy}>
                Try again
              </Button>
            )}
          </Callout>
        </div>
      )}

      {answer.phase === "cancelled" && (
        <p className="text-fg-muted flex items-center gap-2 text-sm">
          <Ban aria-hidden className="size-4" />
          Stopped before an answer was ready.
        </p>
      )}

      {sql && (answered || answer.phase === "streaming") && <SqlBlock sql={sql} />}

      {needsRows && rows.isPending && <Skeleton className="h-40 w-full" />}
      {needsRows && rows.isError && (
        <p className="text-fg-muted text-sm">
          The rows couldn&apos;t be loaded.{" "}
          <Button variant="link" className="h-auto p-0" onClick={() => rows.refetch()}>
            Retry
          </Button>
        </p>
      )}
      {data && <ResultTable data={data} runId={answer.runId} label={answer.chart?.title ?? answer.question} />}
      {data && answer.chart && <ChartView spec={answer.chart} data={data} runId={answer.runId} />}

      {answer.summary && (
        <div className="space-y-2">
          <p className="text-fg leading-relaxed text-pretty">{answer.summary.text}</p>
          {answer.summary.caveats.length > 0 && (
            <ul className="text-fg-muted list-disc space-y-1 pl-5 text-sm">
              {answer.summary.caveats.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {answer.runId && answer.phase !== "streaming" && answer.phase !== "reconnecting" && (
        <footer className="border-line flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          {readOnly ? (
            <button
              className="text-accent-ink text-sm font-medium underline-offset-4 hover:underline"
              onClick={onInspect}
            >
              Inspect queries and timing
            </button>
          ) : (
            <AnswerActions
              runId={answer.runId}
              question={answer.question}
              canPropose={answered}
              onInspect={onInspect}
              onRerun={onRerun}
            />
          )}
          {answer.latencyMs !== undefined && (
            <p className="text-fg-muted tabular flex items-center gap-3 text-xs">
              <span>{formatMs(answer.latencyMs)}</span>
              {answer.costUsd !== undefined && <span>{formatUsd(answer.costUsd)}</span>}
              {mode.isDemo ? <Badge mono>Simulated</Badge> : null}
            </p>
          )}
        </footer>
      )}
    </article>
  )
}
