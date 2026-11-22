"use client"

import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
  type SortingState,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ArrowDown, ArrowUp, ArrowUpDown, Download } from "lucide-react"
import { useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import type { RowsData } from "@/lib/answer"
import { mode } from "app-mode"

import { formatValue, isNumericFormat, type ValueFormat } from "@/lib/format"
import { cn } from "@/lib/utils"

type Row = unknown[]

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { basic: sortFn_basic, text: sortFn_text, datetime: sortFn_datetime, alphanumeric: sortFn_alphanumeric },
})
const helper = createColumnHelper<typeof features, Row>()
const ROW_HEIGHT = 36
const PAGE = 200

export function ResultTable({ data, runId, label }: { data: RowsData; runId?: string; label: string }) {
  const [rows, setRows] = useState<Row[]>(data.rows)
  const [loading, setLoading] = useState(false)
  const [sorting, setSorting] = useState<SortingState>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  const columns = useMemo(
    () =>
      helper.columns(
        data.columns.map((c, i) =>
          helper.accessor((row) => row[i] as string | number | null, {
            id: `${i}:${c.name}`,
            header: c.name,
            sortFn: isNumericFormat(c.semantic_type) ? "basic" : "alphanumeric",
            meta: { format: c.semantic_type as ValueFormat | null },
          }),
        ),
      ),
    [data.columns],
  )
  const table = useTable({
    features,
    columns,
    data: rows,
    state: { sorting },
    onSortingChange: setSorting,
  })
  const model = table.getRowModel().rows

  // TanStack Virtual returns fresh functions by design; React Compiler skips this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: model.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })
  const items = virtualizer.getVirtualItems()
  const padTop = items[0]?.start ?? 0
  const padBottom = items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0

  const canLoadMore = Boolean(runId) && rows.length < data.row_count

  async function loadMore() {
    if (!runId) return
    setLoading(true)
    try {
      const page = await mode.data.rows(runId, { offset: rows.length, limit: PAGE })
      setRows((r) => [...r, ...page.rows])
    } finally {
      setLoading(false)
    }
  }

  if (data.row_count === 0) {
    return (
      <p className="border-line-strong text-fg-muted rounded-lg border border-dashed p-4 text-sm">
        The query ran and returned no rows.
      </p>
    )
  }

  return (
    <div>
      <div
        ref={scrollRef}
        className="border-line bg-surface relative max-h-[420px] overflow-auto overscroll-contain rounded-lg border"
        tabIndex={0}
        role="region"
        aria-label={`${label}, results table`}
      >
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            {label}. {data.row_count} rows. Column headers sort the table.
          </caption>
          <thead className="bg-bg-subtle sticky top-0 z-10">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header, i) => {
                  const fmt = (header.column.columnDef.meta as { format: ValueFormat | null }).format
                  const sorted = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                      className={cn(
                        "label border-line border-b px-3 py-2 text-left whitespace-nowrap",
                        isNumericFormat(fmt) && "text-right",
                        i === 0 && "bg-bg-subtle sticky left-0 z-20",
                      )}
                    >
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-sm",
                          isNumericFormat(fmt) && "flex-row-reverse",
                        )}
                      >
                        {String(header.column.columnDef.header)}
                        {sorted === "asc" ? (
                          <ArrowUp aria-hidden className="size-3" />
                        ) : sorted === "desc" ? (
                          <ArrowDown aria-hidden className="size-3" />
                        ) : (
                          <ArrowUpDown aria-hidden className="text-fg-muted size-3" />
                        )}
                      </button>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {padTop > 0 && (
              <tr aria-hidden>
                <td style={{ height: padTop }} />
              </tr>
            )}
            {items.map((item) => {
              const row = model[item.index]
              return (
                <tr key={row.id} className="border-line border-b last:border-0" style={{ height: ROW_HEIGHT }}>
                  {row.getAllCells().map((cell, i) => {
                    const fmt = (cell.column.columnDef.meta as { format: ValueFormat | null }).format
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          "text-fg-2 px-3 whitespace-nowrap",
                          isNumericFormat(fmt) && "text-right",
                          i === 0 && "bg-surface text-fg sticky left-0 font-medium",
                        )}
                      >
                        {formatValue(cell.getValue(), fmt)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {padBottom > 0 && (
              <tr aria-hidden>
                <td style={{ height: padBottom }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="text-fg-muted mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="tabular">
          Showing {rows.length.toLocaleString("en-US")} of {data.row_count.toLocaleString("en-US")}
          {data.truncated && " (capped by the row limit)"}
        </span>
        <span className="flex gap-1">
          {canLoadMore && (
            <Button variant="ghost" size="sm" onClick={loadMore} disabled={loading}>
              {loading ? "Loading…" : "Load more"}
            </Button>
          )}
          {runId && (
            <Button variant="ghost" size="sm" onClick={() => void mode.data.downloadCsv(runId)}>
              <Download aria-hidden />
              Download CSV
            </Button>
          )}
        </span>
      </div>
    </div>
  )
}
