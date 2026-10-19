/** Display formatting driven by the backend's column semantic types. */

export type ValueFormat = "currency_brl" | "percent" | "count" | "number" | "date"

const LOCALE = "en-US"
const brl = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "BRL" })
const brlCompact = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
})
const pct = new Intl.NumberFormat(LOCALE, { style: "percent", maximumFractionDigits: 1 })
const int = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 })
const num = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 })
const compact = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 })
const month = new Intl.DateTimeFormat(LOCALE, { month: "short", year: "numeric", timeZone: "UTC" })
const day = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
const dateTime = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
})

const ISO = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?/

/** Dates from the DB are naive timestamps; treat them as UTC so the calendar day never shifts. */
export function formatDate(value: string): string {
  const m = ISO.exec(value)
  if (!m) return value
  const [, y, mo, d = "01", h = "00", mi = "00", s = "00"] = m
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
  const midnight = h === "00" && mi === "00" && s === "00"
  // A bare YYYY-MM, or a midnight timestamp on the 1st (date_trunc('month', ...)): a month.
  if (m[3] === undefined || (m[4] !== undefined && midnight && d === "01")) return month.format(date)
  return midnight ? day.format(date) : dateTime.format(date)
}

export function formatValue(value: unknown, format?: ValueFormat | null, opts?: { compact?: boolean }): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "number") {
    switch (format) {
      case "currency_brl":
        return (opts?.compact ? brlCompact : brl).format(value)
      case "percent":
        return pct.format(value)
      case "count":
        return opts?.compact ? compact.format(value) : int.format(value)
      default:
        return opts?.compact ? compact.format(value) : num.format(value)
    }
  }
  if (typeof value === "string") return format === "date" || ISO.test(value) ? formatDate(value) : value
  return JSON.stringify(value)
}

export function isNumericFormat(format?: ValueFormat | null): boolean {
  return format === "currency_brl" || format === "percent" || format === "count" || format === "number"
}

export function formatMs(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
}

export function formatUsd(usd: number): string {
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`
}
