"use client"

import { useTheme } from "next-themes"
import { useMemo } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts"

import type { ChartSpec } from "@/lib/answer"
import type { Prepared } from "@/lib/chart-data"
import { formatValue, type ValueFormat } from "@/lib/format"

type Palette = { series: string[]; grid: string; axis: string; surface: string; ink: string }

/** SVG attributes can't resolve CSS variables, so read the tokens and re-read on theme change. */
// This component is client-only (dynamic, ssr: false), so reading styles during render is safe.
function usePalette(): Palette {
  const { resolvedTheme } = useTheme()
  return useMemo(() => {
    const css = getComputedStyle(document.documentElement)
    const v = (n: string) => css.getPropertyValue(n).trim()
    return {
      series: [1, 2, 3, 4, 5].map((i) => v(`--chart-${i}`)),
      grid: v("--chart-grid"),
      axis: v("--chart-axis"),
      surface: v("--raised"),
      ink: v("--ink"),
    }
    // resolvedTheme is the trigger: the CSS variables change with the theme class.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme])
}

function TooltipBox({
  active,
  payload,
  label,
  xFormat,
  yFormat,
}: TooltipContentProps<number, string> & { xFormat: ValueFormat | null; yFormat: ValueFormat | null }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover text-popover-foreground rounded-md border px-3 py-2 text-xs shadow-[var(--shadow-overlay)]">
      {label !== undefined && <p className="mb-1 font-medium">{formatValue(label, xFormat)}</p>}
      <ul className="space-y-0.5">
        {payload.map((p) => (
          <li key={String(p.dataKey)} className="flex items-center gap-2">
            <span aria-hidden className="size-2 rounded-full" style={{ background: p.color }} />
            <span className="text-muted-foreground">{String(p.name)}</span>
            <span className="tabular ml-auto pl-3 font-medium">{formatValue(p.value, yFormat)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const HEIGHT = 280

export default function ChartCanvas({ spec, prepared }: { spec: ChartSpec; prepared: Prepared }) {
  const palette = usePalette()
  const { points, series, xFormat, yFormat } = prepared
  const multi = series.length > 1
  const color = (i: number) => palette.series[i % palette.series.length]
  const axisProps = { stroke: palette.grid, tick: { fill: palette.axis, fontSize: 12 }, tickLine: false }
  const yTick = (v: number) => formatValue(v, yFormat, { compact: true })
  const xTick = (v: string | number) => formatValue(v, xFormat, { compact: true })
  const tooltip = (
    <Tooltip
      content={(p) => (
        <TooltipBox {...(p as TooltipContentProps<number, string>)} xFormat={xFormat} yFormat={yFormat} />
      )}
      cursor={{ fill: palette.grid, opacity: 0.4 }}
    />
  )
  const legend = multi ? (
    <Legend wrapperStyle={{ fontSize: 12, color: palette.ink }} iconType="circle" iconSize={8} />
  ) : null
  const grid = <CartesianGrid stroke={palette.grid} strokeDasharray="0" vertical={false} />

  if (spec.mark === "pie") {
    return (
      <ResponsiveContainer width="100%" height={HEIGHT}>
        <PieChart accessibilityLayer={false}>
          <Pie
            data={points}
            dataKey={series[0]}
            nameKey="x"
            innerRadius="55%"
            outerRadius="85%"
            paddingAngle={1}
            stroke={palette.surface}
            strokeWidth={2}
            isAnimationActive={false}
          >
            {points.map((_, i) => (
              <Cell key={i} fill={color(i)} />
            ))}
          </Pie>
          {tooltip}
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            iconType="circle"
            iconSize={8}
            formatter={(v) => formatValue(v, xFormat)}
          />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  if (spec.mark === "scatter") {
    return (
      <ResponsiveContainer width="100%" height={HEIGHT}>
        <ScatterChart accessibilityLayer={false} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {grid}
          <XAxis dataKey="x" type="number" name={spec.x ?? ""} {...axisProps} tickFormatter={xTick} />
          <YAxis
            dataKey={series[0]}
            type="number"
            name={spec.y ?? ""}
            {...axisProps}
            tickFormatter={yTick}
            width={64}
          />
          {tooltip}
          <Scatter
            data={points}
            fill={color(0)}
            stroke={palette.surface}
            strokeWidth={2}
            shape="circle"
            isAnimationActive={false}
          />
        </ScatterChart>
      </ResponsiveContainer>
    )
  }

  if (spec.mark === "line" || spec.mark === "area") {
    const Chart = spec.mark === "line" ? LineChart : AreaChart
    return (
      <ResponsiveContainer width="100%" height={HEIGHT}>
        <Chart accessibilityLayer={false} data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          {grid}
          <XAxis dataKey="x" {...axisProps} tickFormatter={xTick} minTickGap={24} />
          <YAxis {...axisProps} tickFormatter={yTick} width={64} axisLine={false} />
          {tooltip}
          {legend}
          {series.map((s, i) =>
            spec.mark === "line" ? (
              <Line
                key={s}
                type="monotone"
                dataKey={s}
                name={s}
                stroke={color(i)}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: palette.surface, strokeWidth: 2 }}
                isAnimationActive={false}
                connectNulls
              />
            ) : (
              <Area
                key={s}
                type="monotone"
                dataKey={s}
                name={s}
                stroke={color(i)}
                strokeWidth={2}
                fill={color(i)}
                fillOpacity={0.1}
                isAnimationActive={false}
              />
            ),
          )}
        </Chart>
      </ResponsiveContainer>
    )
  }

  // Bars: horizontal when labels are long or many (reads better on phones), columns otherwise.
  const horizontal = points.length > 6 || points.some((p) => String(p.x).length > 8)
  const height = horizontal ? Math.max(HEIGHT, points.length * 32 + 40) : HEIGHT
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        accessibilityLayer={false}
        data={points}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
        barGap={2}
        barCategoryGap="20%"
      >
        <CartesianGrid stroke={palette.grid} vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" {...axisProps} tickFormatter={yTick} />
            <YAxis type="category" dataKey="x" {...axisProps} tickFormatter={xTick} width={110} />
          </>
        ) : (
          <>
            <XAxis dataKey="x" {...axisProps} tickFormatter={xTick} />
            <YAxis {...axisProps} tickFormatter={yTick} width={64} axisLine={false} />
          </>
        )}
        {tooltip}
        {legend}
        {series.map((s, i) => (
          <Bar
            key={s}
            dataKey={s}
            name={s}
            fill={color(i)}
            maxBarSize={24}
            radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
