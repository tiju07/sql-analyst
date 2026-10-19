"use client"

import { Table2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useMe, useTables } from "@/lib/api/queries"
import { EXAMPLES, scopeLabel } from "@/lib/personas"

export function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  const me = useMe()
  const tables = useTables()
  const examples = me.data ? EXAMPLES[me.data.role] : []
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Ask the Olist marketplace anything</h1>
      <p className="text-muted-foreground mt-2 max-w-prose">
        Orders, payments, deliveries and reviews from a Brazilian e-commerce marketplace, 2016 to 2018. Every answer
        shows the SQL it ran, so you can check the work.
        {me.data && <> You are seeing: {scopeLabel(me.data.allowed_states).toLowerCase()}.</>}
      </p>

      <h2 className="mt-8 text-sm font-medium">Try one of these</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {me.isPending
          ? [0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-11 w-full" />)
          : examples.map((q) => (
              <li key={q}>
                <Button
                  variant="outline"
                  className="h-auto w-full justify-start py-2.5 text-left whitespace-normal"
                  onClick={() => onPick(q)}
                >
                  {q}
                </Button>
              </li>
            ))}
      </ul>

      <h2 className="mt-8 text-sm font-medium">What&apos;s in the data</h2>
      {tables.isError ? (
        <p className="text-muted-foreground mt-2 text-sm">
          The table list didn&apos;t load.{" "}
          <button className="text-primary underline" onClick={() => tables.refetch()}>
            Retry
          </button>
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {tables.isPending
            ? [0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-5 w-3/4" />)
            : tables.data.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <Table2 aria-hidden className="text-muted-foreground size-4 shrink-0" />
                  <span className="font-mono text-[13px]">{t.name}</span>
                  <span className="text-muted-foreground tabular ml-auto">
                    {t.row_count?.toLocaleString("en-US") ?? "—"} rows
                  </span>
                </li>
              ))}
        </ul>
      )}
    </div>
  )
}
