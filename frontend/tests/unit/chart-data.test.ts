import { describe as suite, expect, it } from "vitest"

import type { ChartSpec, RowsData } from "@/lib/answer"
import { describe, prepare } from "@/lib/chart-data"

const bar: RowsData = {
  columns: [
    { name: "customer_state", type: "bpchar", semantic_type: null },
    { name: "revenue", type: "numeric", semantic_type: "currency_brl" },
  ],
  rows: [
    ["SP", 5202955.05],
    ["RJ", 1824092.67],
    ["PR", 683083.76],
  ],
  row_count: 3,
  truncated: false,
}
const barSpec: ChartSpec = {
  mark: "bar",
  x: "customer_state",
  y: "revenue",
  series: null,
  title: "Revenue by state",
  y_format: "currency_brl",
  x_format: null,
}

suite("prepare", () => {
  it("maps single-series rows", () => {
    const p = prepare(barSpec, bar)
    expect(p?.series).toEqual(["revenue"])
    expect(p?.points[0]).toEqual({ x: "SP", revenue: 5202955.05 })
  })

  it("pivots long format with series in first-seen order", () => {
    const long: RowsData = {
      columns: [
        { name: "m", type: "text", semantic_type: "date" },
        { name: "s", type: "text", semantic_type: null },
        { name: "n", type: "int8", semantic_type: "count" },
      ],
      rows: [
        ["2018-01", "SP", 1],
        ["2018-01", "RJ", 2],
        ["2018-02", "SP", 3],
      ],
      row_count: 3,
      truncated: false,
    }
    const p = prepare(
      { mark: "line", x: "m", y: "n", series: "s", title: "t", y_format: "count", x_format: "date" },
      long,
    )
    expect(p?.series).toEqual(["SP", "RJ"])
    expect(p?.points).toEqual([
      { x: "2018-01", SP: 1, RJ: 2 },
      { x: "2018-02", SP: 3 },
    ])
  })

  it("refuses more series than the palette has", () => {
    const rows = ["A", "B", "C", "D", "E", "F"].map((s) => ["2018-01", s, 1])
    const data: RowsData = {
      columns: [
        { name: "m", type: "text", semantic_type: null },
        { name: "s", type: "text", semantic_type: null },
        { name: "n", type: "int8", semantic_type: "count" },
      ],
      rows,
      row_count: 6,
      truncated: false,
    }
    expect(
      prepare({ mark: "line", x: "m", y: "n", series: "s", title: "t", y_format: null, x_format: null }, data),
    ).toBeNull()
  })
})

suite("describe", () => {
  it("names the extremes with formatted values", () => {
    expect(describe(barSpec, bar)).toBe(
      "Bar chart: Revenue by state. 3 points. Highest SP at R$5,202,955.05; lowest PR at R$683,083.76.",
    )
  })
})
