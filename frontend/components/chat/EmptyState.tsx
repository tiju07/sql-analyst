"use client"

import { mode } from "app-mode"
import { ArrowRight, Table2 } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { Button, Callout } from "@/design-system"
import { useMe, useTables } from "@/lib/api/queries"
import { scopeLabel } from "@/lib/personas"

const HEADLINE = ["orders", "order_items", "customers", "sellers"]

/** The heading block, also the server-rendered placeholder while the workspace hydrates. */
export function EmptyIntro({ scope }: { scope?: string }) {
  return (
    <div className="grid gap-2">
      <h1 className="text-fg text-xl font-medium tracking-tight sm:text-2xl">Ask the Olist marketplace</h1>
      <p className="text-fg-muted max-w-prose text-sm text-pretty">
        Orders, payments, deliveries and reviews from a Brazilian e-commerce marketplace, 2016 to 2018. Every answer
        shows the SQL it ran, so you can check the work.
        {scope ? <> You see: {scope.toLowerCase()}.</> : null}
      </p>
    </div>
  )
}

export function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  const me = useMe()
  const tables = useTables()
  const examples = me.data ? mode.examples[me.data.role] : []
  const headline = HEADLINE.map((n) => tables.data?.find((t) => t.name === n)).filter((t) => t !== undefined)
  return (
    <div className="mx-auto grid max-w-3xl gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <EmptyIntro scope={me.data ? scopeLabel(me.data.allowed_states) : undefined} />

      <div className="hairline grid-cols-2 sm:grid-cols-4" aria-busy={tables.isPending}>
        {tables.isPending
          ? HEADLINE.map((n) => (
              <div key={n} className="grid gap-2 p-4">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-20" />
              </div>
            ))
          : headline.map((t) => (
              <div key={t.id} className="grid gap-1 p-4">
                <span className="label">{t.name}</span>
                <span className="text-fg tabular text-xl font-medium tracking-tight">
                  {t.row_count?.toLocaleString("en-US") ?? "Unknown"}
                </span>
              </div>
            ))}
      </div>

      <section aria-labelledby="examples-title" className="grid gap-3">
        <h2 id="examples-title" className="label">
          Try one of these
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {me.isPending
            ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)
            : examples.map((q) => (
                <li key={q}>
                  <button
                    type="button"
                    onClick={() => onPick(q)}
                    className="group border-line bg-surface text-fg-2 hover:border-line-strong hover:bg-surface-2 hover:text-fg focus-visible:outline-accent flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {q}
                    <ArrowRight
                      aria-hidden
                      className="text-fg-faint group-hover:text-fg size-4 shrink-0 transition-colors"
                    />
                  </button>
                </li>
              ))}
        </ul>
      </section>

      <section aria-labelledby="tables-title" className="grid gap-3">
        <h2 id="tables-title" className="label">
          What is in the data
        </h2>
        {tables.isError ? (
          <Callout tone="danger" title="The table list did not load">
            <Button variant="outline" size="sm" className="mt-2" onClick={() => tables.refetch()}>
              Try again
            </Button>
          </Callout>
        ) : (
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {tables.isPending
              ? [0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-5 w-3/4" />)
              : tables.data.map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <Table2 aria-hidden className="text-fg-muted size-4 shrink-0" />
                    <span className="text-fg-2 truncate font-mono text-[13px]">{t.name}</span>
                    <span className="text-fg-muted tabular ml-auto">
                      {t.row_count?.toLocaleString("en-US") ?? "Unknown"} rows
                    </span>
                  </li>
                ))}
          </ul>
        )}
      </section>
    </div>
  )
}
