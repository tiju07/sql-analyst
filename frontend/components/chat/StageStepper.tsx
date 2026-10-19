"use client"

import { Check, LoaderCircle } from "lucide-react"
import { useEffect, useState } from "react"

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
export function StageStepper({ answer, live }: { answer: Answer; live: boolean }) {
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
                answer.stages[s.name].status === "done" && "bg-primary",
                answer.stages[s.name].status === "active" && "bg-primary/50 motion-safe:animate-pulse",
                answer.stages[s.name].status === "pending" && "bg-muted",
              )}
            />
          ))}
        </div>
        <span className="text-muted-foreground shrink-0 text-xs">{current ? current.active : `${done} steps`}</span>
        <span className="tabular shrink-0 text-xs">{formatMs(total)}</span>
      </div>

      {/* full trail: tablet and up */}
      <ol className="hidden flex-wrap items-center gap-x-1 gap-y-2 sm:flex" aria-label="Answer pipeline">
        {STAGES.map((s, i) => {
          const st = answer.stages[s.name]
          const skipped = !live && st.status === "pending"
          return (
            <li key={s.name} className="flex items-center gap-1">
              {i > 0 && (
                <span aria-hidden className={cn("h-px w-3", st.status === "pending" ? "bg-border" : "bg-primary/40")} />
              )}
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs",
                  st.status === "done" && "bg-accent-wash text-foreground border-transparent",
                  st.status === "active" && "border-primary text-foreground",
                  st.status === "pending" && "text-muted-foreground border-dashed",
                )}
              >
                {st.status === "done" && <Check aria-hidden className="text-primary size-3" />}
                {st.status === "active" && (
                  <LoaderCircle aria-hidden className="text-primary size-3 motion-safe:animate-spin" />
                )}
                <span>{s.label}</span>
                {st.status !== "pending" && (
                  <span className="text-muted-foreground tabular">
                    {formatMs(elapsed(st, now))}
                    {st.rounds > 1 && ` ×${st.rounds}`}
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
      </ol>
    </div>
  )
}
