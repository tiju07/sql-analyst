"use client"

import { useQuery } from "@tanstack/react-query"
import { AlertCircle, Ban, WifiOff } from "lucide-react"

import { AnswerActions } from "@/components/chat/AnswerActions"
import { ChartView } from "@/components/chat/ChartView"
import { ClarifyCard } from "@/components/chat/ClarifyCard"
import { ResultTable } from "@/components/chat/ResultTable"
import { SqlBlock } from "@/components/chat/SqlBlock"
import { StageStepper } from "@/components/chat/StageStepper"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { Answer } from "@/lib/answer"
import { api, unwrap } from "@/lib/api/client"
import { keys } from "@/lib/api/queries"
import { formatMs, formatUsd } from "@/lib/format"

const ERROR_HINT: Record<string, string> = {
  BLOCKED_UNSAFE: "The generated query was blocked by the safety checks, so nothing ran.",
  QUERY_TIMEOUT: "The database stopped the query because it ran too long.",
  NO_ANSWER: "None of the candidate queries produced a usable result.",
  UPSTREAM_LLM: "The AI service didn't respond properly.",
  BUDGET_EXCEEDED: "The demo's AI budget is used up for today.",
  RATE_LIMITED: "Too many questions in a short time.",
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
    queryFn: async () =>
      unwrap(await api.GET("/api/runs/{run_id}/rows", { params: { path: { run_id: answer.runId as string } } })),
    enabled: needsRows,
    staleTime: Infinity,
  })
  const data = answer.rows ?? rows.data
  const sql = chosenSql(answer)

  return (
    <article className="space-y-4" aria-label={`Answer to: ${answer.question}`}>
      <StageStepper answer={answer} live={live && answer.phase === "streaming"} />

      {answer.phase === "reconnecting" && (
        <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
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
        <div role="alert" className="border-destructive/40 rounded-lg border p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <AlertCircle aria-hidden className="text-destructive size-4" />
            {ERROR_HINT[answer.error.code] ?? "Something went wrong."}
          </p>
          <p className="text-muted-foreground mt-1">{answer.error.message}</p>
          {answer.error.retryable && answer.error.code !== "BUDGET_EXCEEDED" && (
            <Button size="sm" variant="outline" className="mt-3" onClick={onRerun} disabled={busy}>
              Try again
            </Button>
          )}
        </div>
      )}

      {answer.phase === "cancelled" && (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Ban aria-hidden className="size-4" />
          Stopped before an answer was ready.
        </p>
      )}

      {sql && (answered || answer.phase === "streaming") && <SqlBlock sql={sql} />}

      {needsRows && rows.isPending && <Skeleton className="h-40 w-full" />}
      {needsRows && rows.isError && (
        <p className="text-muted-foreground text-sm">
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
          <p className="leading-relaxed">{answer.summary.text}</p>
          {answer.summary.caveats.length > 0 && (
            <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
              {answer.summary.caveats.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {answer.runId && answer.phase !== "streaming" && answer.phase !== "reconnecting" && (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          {readOnly ? (
            <button className="text-primary text-sm font-medium underline-offset-4 hover:underline" onClick={onInspect}>
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
            <p className="text-muted-foreground tabular text-xs">
              {formatMs(answer.latencyMs)}
              {answer.costUsd !== undefined && <span className="ml-3">{formatUsd(answer.costUsd)}</span>}
            </p>
          )}
        </footer>
      )}
    </article>
  )
}
