import { Check } from "lucide-react"

import { formatValue } from "@/lib/format"

// Real query results from the loaded Olist dataset (product revenue = SUM(order_items.price)).
const ROWS: [string, string, number][] = [
  ["SP", "São Paulo", 5202955.05],
  ["RJ", "Rio de Janeiro", 1824092.67],
  ["MG", "Minas Gerais", 1585308.03],
  ["RS", "Rio Grande do Sul", 750304.02],
  ["PR", "Paraná", 683083.76],
]
const TOTAL_REVENUE = 13591643.7
const STAGES = ["Retrieve", "Clarify", "Generate", "Guard", "Execute", "Repair", "Select", "Compose"]
const SQL = `SELECT c.customer_state, SUM(i.price) AS revenue
FROM olist.order_items i
JOIN olist.orders o ON o.order_id = i.order_id
JOIN olist.customers c ON c.customer_id = o.customer_id
GROUP BY c.customer_state
ORDER BY revenue DESC
LIMIT 5`

export function HeroAnswer() {
  const max = ROWS[0][2]
  const topShare = ROWS.reduce((s, r) => s + r[2], 0) / TOTAL_REVENUE
  return (
    <figure className="bg-card min-w-0 rounded-2xl border p-4 shadow-[var(--shadow-overlay)] sm:p-6">
      <p className="bg-secondary ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md px-4 py-2 text-sm">
        Which 5 states had the highest revenue?
      </p>

      <ol aria-label="Steps the agent took" className="mt-5 flex flex-wrap gap-1.5 text-xs">
        {STAGES.map((s) => {
          const skipped = s === "Repair"
          return (
            <li
              key={s}
              className={
                skipped
                  ? "text-muted-foreground rounded-full border border-dashed px-2 py-0.5"
                  : "bg-accent-wash inline-flex items-center gap-1 rounded-full px-2 py-0.5"
              }
            >
              {!skipped && <Check aria-hidden className="text-primary size-3" />}
              {s}
              <span className="sr-only">{skipped ? " not needed" : " done"}</span>
            </li>
          )
        })}
      </ol>

      <pre className="bg-muted mt-4 rounded-md p-3 font-mono text-[12px] leading-relaxed break-words whitespace-pre-wrap">
        {SQL}
      </pre>

      <div className="mt-5">
        <p className="text-sm font-medium">Product revenue by customer state</p>
        <ul className="mt-3 space-y-2">
          {ROWS.map(([code, name, value]) => (
            <li key={code} className="grid grid-cols-[2.5rem_1fr_4.5rem] items-center gap-3 text-sm">
              <abbr title={name} className="font-medium no-underline">
                {code}
              </abbr>
              <span className="bg-muted h-5 overflow-hidden rounded-r-sm" aria-hidden>
                <span
                  className="block h-full rounded-r-[4px] bg-[var(--chart-1)]"
                  style={{ width: `${(value / max) * 100}%` }}
                />
              </span>
              <span className="tabular text-right">{formatValue(value, "currency_brl", { compact: true })}</span>
            </li>
          ))}
        </ul>
      </div>

      <figcaption className="mt-5 space-y-2 text-sm">
        <p>
          São Paulo leads with {formatValue(ROWS[0][2], "currency_brl", { compact: true })} in product revenue, about{" "}
          {(ROWS[0][2] / ROWS[1][2]).toFixed(1)} times Rio de Janeiro. These five states account for{" "}
          {formatValue(topShare, "percent")} of all revenue.
        </p>
        <p className="text-muted-foreground text-xs">
          Real figures from the Olist dataset, all years, item price excluding freight.
        </p>
      </figcaption>
    </figure>
  )
}
