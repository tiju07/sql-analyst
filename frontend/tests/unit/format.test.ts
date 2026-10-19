import { describe, expect, it } from "vitest"

import { formatDate, formatMs, formatUsd, formatValue } from "@/lib/format"

describe("formatValue", () => {
  it.each([
    [5202955.05, "currency_brl", "R$5,202,955.05"],
    [0.0811, "percent", "8.1%"],
    [96478, "count", "96,478"],
    [4.0867, "number", "4.09"],
    [null, "count", "—"],
    [true, null, "Yes"],
    ["SP", null, "SP"],
  ] as const)("%s as %s -> %s", (value, fmt, expected) => {
    expect(formatValue(value, fmt)).toBe(expected)
  })

  it("compacts for chart axes", () => {
    expect(formatValue(5202955.05, "currency_brl", { compact: true })).toBe("R$5.2M")
    expect(formatValue(96478, "count", { compact: true })).toBe("96.5K")
  })
})

describe("formatDate", () => {
  it("shows month-truncated timestamps as months", () => {
    expect(formatDate("2018-05-01T00:00:00")).toBe("May 2018")
    expect(formatDate("2018-05")).toBe("May 2018")
  })
  it("shows days and times without shifting the calendar day", () => {
    expect(formatDate("2018-05-17T00:00:00")).toBe("May 17, 2018")
    expect(formatDate("2018-05-01")).toBe("May 1, 2018")
    expect(formatDate("2017-10-02T10:56:33")).toMatch(/^Oct 2, 2017, 10:56/)
  })
  it("leaves non-dates alone", () => {
    expect(formatDate("not a date")).toBe("not a date")
  })
})

describe("small formatters", () => {
  it("formats durations and cost", () => {
    expect(formatMs(120)).toBe("120 ms")
    expect(formatMs(2345)).toBe("2.3 s")
    expect(formatMs(12_345)).toBe("12 s")
    expect(formatUsd(0.0042)).toBe("$0.0042")
    expect(formatUsd(0.0421)).toBe("$0.042")
  })
})
