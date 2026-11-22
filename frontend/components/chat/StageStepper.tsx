"use client"

import { Check, LoaderCircle } from "lucide-react"
import { useEffect, useState } from "react"

import { Badge } from "@/design-system"
import { STAGES, type Answer, type StageState } from "@/lib/answer"
import { formatMs } from "@/lib/format"
import { cn } from "@/lib/utils"

function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(t)
  }, [active])
  return now
}

function elapsed(s: StageState, now: number): number {
  return s.status === "active" && s.startedAt ? s.ms + Math.max(0, now - s.startedAt) : s.ms
}

/**
 * The pipeline trail: every answer shows the path it took and what each step cost.
 * Desktop lists all eight steps; phones show the current step and a segmented bar.
 */
export function StageStepper({
  answer,
  live,
  simulated = false,
}: {
  answer: Answer
  live: boolean
  simulated?: boolean
}) {
  const now = useTicker(live)
  const current = STAGES.find((s) => answer.stages[s.name].status === "active")
  const done = STAGES.filter((s) => answer.stages[s.name].status === "done").length
  const total = STAGES.reduce((sum, s) => sum + elapsed(answer.stages[s.name], now), 0)

  return (
    <div className="text-sm">
      {/* compact: phones */}
      <div className="flex items-center gap-3 sm:hidden">
        <div className="flex flex-1 gap-0.5" aria-hidden>
          {STAGES.map((s) => (
            <span
              key={s.name}
              className={cn(
                "h-1 flex-1 rounded-full",
                answer.stages[s.name].status === "done" && "bg-accent",
                answer.stages[s.name].status === "active" && "bg-accent/50 motion-safe:animate-pulse",
                answer.stages[s.name].status === "pending" && "bg-surface-3",
              )}
            />
          ))}
        </div>
        <span className="text-fg-muted shrink-0 text-xs">{current ? current.active : `${done} steps`}</span>
        <span className="text-fg-2 tabular shrink-0 text-xs">{formatMs(total)}</span>
      </div>

      {/* full trail: tablet and up */}
      <ol className="hidden flex-wrap items-center gap-x-1 gap-y-2 sm:flex" aria-label="Answer pipeline">
        {STAGES.map((s, i) => {
          const st = answer.stages[s.name]
          const skipped = !live && st.status === "pending"
          return (
            <li key={s.name} className="flex items-center gap-1">
              {i > 0 && (
                <span aria-hidden className={cn("h-px w-2.5", st.status === "pending" ? "bg-line" : "bg-accent/50")} />
              )}
              <span
                className={cn(
                  "inline-flex h-6 items-center gap-1.5 rounded-sm border px-1.5 text-xs",
                  st.status === "done" && "border-line bg-surface-2 text-fg",
                  st.status === "active" && "border-accent bg-accent-soft text-fg",
                  st.status === "pending" && "border-line-strong text-fg-muted border-dashed",
                  skipped && "opacity-60",
                )}
              >
                {st.status === "done" && <Check aria-hidden className="text-success size-3" />}
                {st.status === "active" && (
                  <LoaderCircle aria-hidden className="text-accent-ink size-3 motion-safe:animate-spin" />
                )}
                <span>{s.label}</span>
                {st.status !== "pending" && (
                  <span className="text-fg-muted tabular font-mono text-[11px]">
                    {formatMs(elapsed(st, now))}
                    {st.rounds > 1 && ` x${st.rounds}`}
                  </span>
                )}
                <span className="sr-only">
                  {st.status === "done"
                    ? "done"
                    : st.status === "active"
                      ? "in progress"
                      : skipped
                        ? "skipped"
                        : "waiting"}
                </span>
              </span>
            </li>
          )
        })}
        {simulated && !live ? (
          <li className="ml-1">
            <Badge mono>Simulated timings</Badge>
          </li>
        ) : null}
      </ol>
    </div>
  )
}
