"use client"

import dynamic from "next/dynamic"
import { useState } from "react"

import { ResultTable } from "@/components/chat/ResultTable"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { ChartSpec, RowsData } from "@/lib/answer"
import { describe, prepare } from "@/lib/chart-data"
import { formatValue, type ValueFormat } from "@/lib/format"

// Recharts is the heaviest dependency on the page; load it only when an answer has a chart.
const ChartCanvas = dynamic(() => import("@/components/chat/ChartCanvas"), {
  ssr: false,
  loading: () => <Skeleton className="h-[280px] w-full" />,
})

function Kpi({ spec, data }: { spec: ChartSpec; data: RowsData }) {
  const yi = data.columns.findIndex((c) => c.name === spec.y)
  const value = yi >= 0 ? data.rows[0]?.[yi] : undefined
  return (
    <figure className="py-2">
      <figcaption className="text-muted-foreground text-sm">{spec.title}</figcaption>
      <p className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">
        {formatValue(value, spec.y_format as ValueFormat | null)}
      </p>
    </figure>
  )
}

export function ChartView({ spec, data, runId }: { spec: ChartSpec; data: RowsData; runId?: string }) {
  const [view, setView] = useState<"chart" | "table">("chart")
  if (spec.mark === "table") return null
  if (spec.mark === "kpi") return <Kpi spec={spec} data={data} />
  const prepared = prepare(spec, data)
  if (!prepared) return null
  return (
    <figure className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <figcaption className="font-medium">{spec.title}</figcaption>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={view}
          onValueChange={(v) => v && setView(v as "chart" | "table")}
          aria-label="Show the result as"
        >
          <ToggleGroupItem value="chart">Chart</ToggleGroupItem>
          <ToggleGroupItem value="table">Table</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <p className="sr-only">{describe(spec, data)}</p>
      {view === "chart" ? (
        <div aria-hidden>
          <ChartCanvas spec={spec} prepared={prepared} />
        </div>
      ) : (
        <ResultTable data={data} runId={runId} label={spec.title} />
      )}
    </figure>
  )
}
