import type { ChartSpec, RowsData } from "@/lib/answer"
import { formatValue, type ValueFormat } from "@/lib/format"

export const MAX_SERIES = 5 // palette size; more series render as a table instead of cycling hues

export type ChartPoint = Record<string, string | number | null>
export type Prepared = {
  points: ChartPoint[]
  series: string[] // y keys in fixed order of first appearance
  xFormat: ValueFormat | null
  yFormat: ValueFormat | null
}

function col(data: RowsData, name: string | null | undefined): number {
  return name ? data.columns.findIndex((c) => c.name === name) : -1
}

/** Reshape rows for Recharts. Long format (x, series, y) is pivoted to one key per series. */
export function prepare(spec: ChartSpec, data: RowsData): Prepared | null {
  const xi = col(data, spec.x)
  const yi = col(data, spec.y)
  if (xi < 0 || yi < 0) return null
  const si = col(data, spec.series)
  const xFormat = (spec.x_format ?? data.columns[xi].semantic_type ?? null) as ValueFormat | null
  const yFormat = (spec.y_format ?? data.columns[yi].semantic_type ?? null) as ValueFormat | null
  if (si < 0) {
    return {
      points: data.rows.map((r) => ({ x: r[xi] as string | number, [spec.y as string]: r[yi] as number })),
      series: [spec.y as string],
      xFormat,
      yFormat,
    }
  }
  const series: string[] = []
  const byX = new Map<string, ChartPoint>()
  for (const r of data.rows) {
    const s = String(r[si])
    if (!series.includes(s)) series.push(s)
    const key = String(r[xi])
    const point = byX.get(key) ?? { x: r[xi] as string | number }
    point[s] = r[yi] as number
    byX.set(key, point)
  }
  if (series.length > MAX_SERIES) return null
  return { points: [...byX.values()], series, xFormat, yFormat }
}

/** One-sentence description for screen readers (the table view carries every value). */
export function describe(spec: ChartSpec, data: RowsData): string {
  const yi = col(data, spec.y)
  const xi = col(data, spec.x)
  if (yi < 0) return `${spec.title}. ${data.row_count} rows.`
  const fmt = data.columns[yi].semantic_type as ValueFormat | null
  const kind = {
    bar: "Bar chart",
    line: "Line chart",
    area: "Area chart",
    scatter: "Scatter plot",
    pie: "Pie chart",
    kpi: "Figure",
    table: "Table",
  }[spec.mark]
  const rows = data.rows.filter((r) => typeof r[yi] === "number")
  if (!rows.length || xi < 0) return `${kind}: ${spec.title}.`
  const hi = rows.reduce((a, b) => ((b[yi] as number) > (a[yi] as number) ? b : a))
  const lo = rows.reduce((a, b) => ((b[yi] as number) < (a[yi] as number) ? b : a))
  const xf = data.columns[xi].semantic_type as ValueFormat | null
  return `${kind}: ${spec.title}. ${data.row_count} points. Highest ${formatValue(hi[xi], xf)} at ${formatValue(hi[yi], fmt)}; lowest ${formatValue(lo[xi], xf)} at ${formatValue(lo[yi], fmt)}.`
}
