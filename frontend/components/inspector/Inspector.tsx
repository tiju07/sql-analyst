"use client"

import { useQuery } from "@tanstack/react-query"
import { ChevronDown } from "lucide-react"

import { CopyButton, SqlCode } from "@/components/chat/SqlBlock"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Badge as FoundryBadge, Callout } from "@/design-system"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { STAGES, type RunOut } from "@/lib/answer"
import { mode } from "app-mode"

import { keys } from "@/lib/api/queries"
import { formatMs, formatUsd } from "@/lib/format"

const STATUS_LABEL: Record<string, string> = {
  ok: "Returned rows",
  empty: "No rows",
  failed: "Failed",
  blocked: "Blocked",
  needs_repair: "Needed repair",
  pending_guard: "Not checked",
  pending_exec: "Not run",
}

function Candidates({ run }: { run: RunOut }) {
  const chosen = run.chosen_sql
  if (!run.candidates.length) return <p className="text-fg-muted text-sm">No queries were written for this question.</p>
  return (
    <ol className="space-y-4">
      {run.candidates.map((c) => {
        const isChosen = Boolean(chosen) && (c.safe_sql ?? c.sql) === chosen
        return (
          <li key={c.index} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-medium">Candidate {c.index + 1}</h4>
              <Badge variant={isChosen ? "default" : "secondary"}>
                {isChosen ? "Chosen" : (STATUS_LABEL[c.status] ?? c.status)}
              </Badge>
              {c.repairs > 0 && (
                <Badge variant="outline">
                  {c.repairs} repair{c.repairs > 1 ? "s" : ""}
                </Badge>
              )}
              {c.row_count !== null && c.row_count !== undefined && (
                <span className="text-fg-muted tabular text-xs">{c.row_count.toLocaleString("en-US")} rows</span>
              )}
              <span className="ml-auto">
                <CopyButton text={c.safe_sql ?? c.sql} label="Copy" />
              </span>
            </div>
            <SqlCode sql={c.safe_sql ?? c.sql} />
            {c.assumptions.length > 0 && (
              <ul className="text-fg-muted list-disc pl-5 text-xs">
                {c.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
            {c.attempts.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger className="text-fg-muted hover:text-fg inline-flex items-center gap-1 text-xs">
                  <ChevronDown aria-hidden className="size-3" />
                  {c.attempts.length} earlier attempt{c.attempts.length > 1 ? "s" : ""}
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2">
                  {c.attempts.map((a, i) => (
                    <div key={i} className="rounded-md border p-2 text-xs">
                      <p className="text-danger font-mono break-words whitespace-pre-wrap">{a.error}</p>
                      <pre tabIndex={0} className="text-fg-muted mt-1 overflow-x-auto font-mono">
                        {a.sql}
                      </pre>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function Context({ run }: { run: RunOut }) {
  const ctx = run.context
  if (!ctx) return <p className="text-fg-muted text-sm">No context was recorded for this run.</p>
  return (
    <div className="space-y-5 text-sm">
      <section>
        <h4 className="font-medium">Tables shown to the model</h4>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {ctx.tables.map((t) => (
            <li key={t}>
              <Badge variant="secondary" className="font-mono">
                {t}
              </Badge>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h4 className="font-medium">Metric definitions</h4>
        <p className="text-fg-muted mt-1">
          {ctx.metrics.length ? ctx.metrics.join(", ") : "None for this connection."}
        </p>
      </section>
      <section>
        <h4 className="font-medium">Values matched in the question</h4>
        {ctx.values.length ? (
          <ul className="mt-1 space-y-1">
            {ctx.values.map((v, i) => (
              <li key={i} className="font-mono text-xs">
                {String(v.value)}{" "}
                <span className="text-fg-muted">
                  in {String(v.table)}.{String(v.column)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted mt-1">No literal values detected.</p>
        )}
      </section>
      <section>
        <h4 className="font-medium">Verified examples used</h4>
        {ctx.fewshot.length ? (
          <ul className="mt-1 space-y-2">
            {ctx.fewshot.map((f, i) => (
              <li key={i}>
                <p>{f.question}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted mt-1">None similar enough yet.</p>
        )}
      </section>
      {ctx.notes.length > 0 && (
        <section>
          <h4 className="font-medium">Notes about the data</h4>
          <ul className="text-fg-muted mt-1 list-disc space-y-1 pl-5">
            {ctx.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}
      {ctx.schema_block ? (
        <Collapsible>
          <CollapsibleTrigger className="text-fg-muted hover:text-fg inline-flex items-center gap-1">
            <ChevronDown aria-hidden className="size-4" />
            Full context the model saw
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre
              tabIndex={0}
              aria-label="Full model context"
              className="border-line bg-bg-subtle mt-2 max-h-96 overflow-auto rounded-md border p-3 font-mono text-xs whitespace-pre-wrap"
            >
              {ctx.schema_block}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  )
}

function Timeline({ run }: { run: RunOut }) {
  const total = Object.values(run.stage_timings).reduce((a, b) => a + b, 0) || 1
  return (
    <div className="space-y-5 text-sm">
      {mode.isDemo ? (
        <p className="text-fg-muted flex items-center gap-2 text-xs">
          <FoundryBadge mono>Simulated</FoundryBadge>
          Timings, tokens, cost and trace id are made up for the demo.
        </p>
      ) : null}
      <ul className="space-y-2">
        {STAGES.filter((s) => run.stage_timings[s.name] !== undefined).map((s) => {
          const ms = run.stage_timings[s.name] ?? 0
          return (
            <li key={s.name} className="grid grid-cols-[5.5rem_1fr_4rem] items-center gap-2">
              <span>{s.label}</span>
              <span className="bg-surface-2 h-2 overflow-hidden rounded-full" aria-hidden>
                <span
                  className="bg-accent block h-full rounded-full"
                  style={{ width: `${Math.max(2, (ms / total) * 100)}%` }}
                />
              </span>
              <span className="tabular text-right">{formatMs(ms)}</span>
            </li>
          )
        })}
      </ul>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <dt className="text-fg-muted">Total time</dt>
        <dd className="tabular">{run.latency_ms !== null ? formatMs(run.latency_ms) : "Not recorded"}</dd>
        <dt className="text-fg-muted">Input tokens</dt>
        <dd className="tabular">{run.input_tokens.toLocaleString("en-US")}</dd>
        <dt className="text-fg-muted">Output tokens</dt>
        <dd className="tabular">{run.output_tokens.toLocaleString("en-US")}</dd>
        <dt className="text-fg-muted">Cost</dt>
        <dd className="tabular">{formatUsd(run.cost_usd)}</dd>
        <dt className="text-fg-muted">Trace id</dt>
        <dd className="flex items-center gap-1 font-mono text-xs break-all">{run.trace_id ?? "Not recorded"}</dd>
      </dl>
    </div>
  )
}

export function Inspector({ runId }: { runId: string | null }) {
  const run = useQuery({
    queryKey: keys.run(runId ?? ""),
    queryFn: () => mode.data.run(runId as string),
    enabled: Boolean(runId),
  })
  if (!runId) {
    return (
      <p className="text-fg-muted p-4 text-sm">Choose Inspect on an answer to see its queries, context and timing.</p>
    )
  }
  if (run.isPending) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }
  if (run.isError) {
    return (
      <div className="p-4">
        <Callout tone="danger" title="This run did not load">
          <Button variant="outline" size="sm" className="mt-2" onClick={() => run.refetch()}>
            Try again
          </Button>
        </Callout>
      </div>
    )
  }
  return (
    <Tabs defaultValue="sql" className="p-4">
      <p className="mb-3 line-clamp-2 text-sm font-medium">{run.data.question}</p>
      <TabsList className="w-full">
        <TabsTrigger value="sql">SQL</TabsTrigger>
        <TabsTrigger value="context">Context</TabsTrigger>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
      </TabsList>
      <TabsContent value="sql" className="mt-4">
        <Candidates run={run.data} />
      </TabsContent>
      <TabsContent value="context" className="mt-4">
        <Context run={run.data} />
      </TabsContent>
      <TabsContent value="timeline" className="mt-4">
        <Timeline run={run.data} />
      </TabsContent>
    </Tabs>
  )
}
