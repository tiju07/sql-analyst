import type { Metadata } from "next"

import { SiteFooter } from "@/components/marketing/SiteFooter"
import { SiteHeader } from "@/components/marketing/SiteHeader"
import { loadEvalSummary } from "@/lib/evals/load"
import type { AblationRun } from "@/lib/evals/types"
import { formatValue } from "@/lib/format"

export const metadata: Metadata = {
  title: "Evaluation results",
  description:
    "Execution accuracy, cost and latency of the SQL agent on BIRD Mini-Dev, a golden Olist set and a safety red-team set.",
}

const ABLATIONS = [
  ["a", "Full schema, zero-shot", "Every table in the prompt, one query, no repair."],
  ["b", "+ schema linking", "Only the tables retrieval selects, with join paths."],
  ["c", "+ value retrieval", "Literal values from the question matched to stored values."],
  ["d", "+ few-shot", "Similar verified question/SQL pairs as examples."],
  ["e", "+ 3 candidates and repair", "The full system: majority vote over three queries, up to two repairs each."],
] as const

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="bg-muted h-3 w-24 overflow-hidden rounded-r-sm sm:w-40" aria-hidden>
        <span
          className="block h-full rounded-r-[4px] bg-[var(--chart-1)]"
          style={{ width: `${max ? (value / max) * 100 : 0}%` }}
        />
      </span>
      <span className="tabular">{label}</span>
    </div>
  )
}

function AblationTable({ runs }: { runs: AblationRun[] }) {
  const maxEx = Math.max(...runs.map((r) => r.ex))
  const maxCost = Math.max(...runs.map((r) => r.cost_per_question_usd))
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <caption className="sr-only">Execution accuracy, soft F1, cost and latency per ablation step</caption>
        <thead className="bg-muted text-left">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Step
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Execution accuracy
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Soft F1
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Cost per question
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              p50 / p95
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={`${r.ablation}-${r.evidence}`} className="border-t">
              <th scope="row" className="px-3 py-2 text-left font-normal">
                {r.label}
              </th>
              <td className="px-3 py-2">
                <Bar value={r.ex} max={maxEx} label={formatValue(r.ex, "percent")} />
              </td>
              <td className="tabular px-3 py-2 text-right">
                {r.soft_f1 === null ? "—" : formatValue(r.soft_f1, "percent")}
              </td>
              <td className="px-3 py-2">
                <Bar value={r.cost_per_question_usd} max={maxCost} label={`$${r.cost_per_question_usd.toFixed(4)}`} />
              </td>
              <td className="tabular px-3 py-2 text-right whitespace-nowrap">
                {(r.p50_ms / 1000).toFixed(1)} s / {(r.p95_ms / 1000).toFixed(1)} s
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function EvalsPage() {
  const s = await loadEvalSummary()
  const withEvidence = s?.bird?.runs.filter((r) => r.evidence) ?? []
  const withoutEvidence = s?.bird?.runs.filter((r) => !r.evidence) ?? []
  const full = withEvidence.find((r) => r.ablation.startsWith("e"))
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-5xl px-4 pt-8 pb-20 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Evaluation results</h1>
        <p className="text-muted-foreground mt-3 max-w-prose">
          How often the agent gets the right answer, what it costs, and how it fails. Every number on this page comes
          from a recorded run; nothing is estimated.
        </p>

        {!s ? (
          <section className="mt-10 rounded-lg border border-dashed p-6">
            <h2 className="font-medium">No benchmark has been run yet</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Results appear here once the BIRD Mini-Dev, golden-set and safety runs have been executed and committed.
              The plan below describes what will be measured.
            </p>
          </section>
        ) : (
          <>
            <p className="text-muted-foreground mt-2 text-sm">
              Run on {new Date(s.generated_at).toLocaleDateString("en-US", { dateStyle: "long" })}. SQL model{" "}
              {s.model_sql}, helper model {s.model_fast}.
            </p>
            {full && (
              <dl className="mt-8 grid gap-6 sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground text-sm">Execution accuracy</dt>
                  <dd className="mt-1 text-3xl font-semibold">{formatValue(full.ex, "percent")}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-sm">Soft F1</dt>
                  <dd className="mt-1 text-3xl font-semibold">
                    {full.soft_f1 === null ? "—" : formatValue(full.soft_f1, "percent")}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-sm">Cost per question</dt>
                  <dd className="mt-1 text-3xl font-semibold">${full.cost_per_question_usd.toFixed(3)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-sm">Median latency</dt>
                  <dd className="mt-1 text-3xl font-semibold">{(full.p50_ms / 1000).toFixed(1)} s</dd>
                </div>
              </dl>
            )}
            {withEvidence.length > 0 && (
              <section className="mt-12">
                <h2 className="text-xl font-semibold tracking-tight">
                  What each piece adds (with BIRD evidence hints)
                </h2>
                <div className="mt-4">
                  <AblationTable runs={withEvidence} />
                </div>
              </section>
            )}
            {withoutEvidence.length > 0 && (
              <section className="mt-10">
                <h2 className="text-xl font-semibold tracking-tight">Without evidence hints</h2>
                <div className="mt-4">
                  <AblationTable runs={withoutEvidence} />
                </div>
              </section>
            )}
            {full && Object.keys(full.by_difficulty).length > 0 && (
              <section className="mt-10">
                <h2 className="text-xl font-semibold tracking-tight">Accuracy by difficulty</h2>
                <table className="mt-4 text-sm">
                  <caption className="sr-only">Execution accuracy of the full system by BIRD difficulty</caption>
                  <tbody>
                    {Object.entries(full.by_difficulty).map(([d, v]) => (
                      <tr key={d}>
                        <th scope="row" className="py-1 pr-4 text-left font-normal capitalize">
                          {d}
                        </th>
                        <td className="py-1">
                          <Bar value={v} max={1} label={formatValue(v, "percent")} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
            {s.latency && (
              <section className="mt-10">
                <h2 className="text-xl font-semibold tracking-tight">Latency distribution</h2>
                <table className="mt-4 text-sm">
                  <caption className="sr-only">Number of questions per latency bucket</caption>
                  <tbody>
                    {s.latency.histogram.map((b) => (
                      <tr key={b.bucket}>
                        <th scope="row" className="py-1 pr-4 text-left font-normal">
                          {b.bucket}
                        </th>
                        <td className="py-1">
                          <Bar
                            value={b.count}
                            max={Math.max(...s.latency!.histogram.map((x) => x.count))}
                            label={String(b.count)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
            {s.failures && (
              <section className="mt-10">
                <h2 className="text-xl font-semibold tracking-tight">
                  Why it fails ({s.failures.audited} failures reviewed by hand)
                </h2>
                <table className="mt-4 text-sm">
                  <caption className="sr-only">Failure categories from the manual audit</caption>
                  <tbody>
                    {s.failures.categories.map((c) => (
                      <tr key={c.category}>
                        <th scope="row" className="py-1 pr-4 text-left font-normal">
                          {c.category}
                        </th>
                        <td className="py-1">
                          <Bar value={c.count} max={s.failures!.audited} label={String(c.count)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
            {(s.golden || s.safety) && (
              <section className="mt-10 grid gap-8 sm:grid-cols-2">
                {s.golden && (
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">Golden Olist set</h2>
                    <p className="text-muted-foreground mt-2 text-sm">
                      {s.golden.questions} business questions with reviewed SQL.
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <dt>Execution match</dt>
                      <dd className="tabular">{formatValue(s.golden.ex, "percent")}</dd>
                      <dt>Clarified correctly</dt>
                      <dd className="tabular">{formatValue(s.golden.clarify_accuracy, "percent")}</dd>
                    </dl>
                  </div>
                )}
                {s.safety && (
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">Safety red team</h2>
                    <p className="text-muted-foreground mt-2 text-sm">
                      {s.safety.cases} adversarial prompts: writes, data dumps, sleeps, prompt injection, RLS bypass.
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <dt>Cases passed</dt>
                      <dd className="tabular">
                        {s.safety.passed} of {s.safety.cases}
                      </dd>
                      <dt>Non-SELECT executed</dt>
                      <dd className="tabular">{s.safety.non_select_executions}</dd>
                      <dt>Rows outside scope</dt>
                      <dd className="tabular">{s.safety.rows_outside_scope}</dd>
                    </dl>
                  </div>
                )}
              </section>
            )}
          </>
        )}

        <section className="mt-14">
          <h2 className="text-xl font-semibold tracking-tight">Method</h2>
          <ul className="text-muted-foreground mt-3 max-w-prose list-disc space-y-2 pl-5">
            <li>
              BIRD Mini-Dev: 500 question/SQL pairs over 11 SQLite databases, scored with the official BIRD evaluation
              code (execution accuracy and soft F1).
            </li>
            <li>Each run is repeated with and without the dataset&apos;s evidence hints.</li>
            <li>Ablations add one component at a time, holding the model fixed:</li>
          </ul>
          <ol className="mt-3 max-w-prose space-y-2 pl-5 text-sm">
            {ABLATIONS.map(([k, t, d]) => (
              <li key={k}>
                <span className="font-medium">{t}.</span> <span className="text-muted-foreground">{d}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="mt-10">
          <h2 className="text-xl font-semibold tracking-tight">Limitations</h2>
          <ul className="text-muted-foreground mt-3 max-w-prose list-disc space-y-2 pl-5">
            {(s?.limitations ?? []).map((l) => (
              <li key={l}>{l}</li>
            ))}
            <li>
              BIRD has documented annotation errors: some gold SQL is wrong, so a correct answer can score as a miss.
              The failure audit counts these separately.
            </li>
            <li>Execution accuracy compares result sets, not intent: a query can match by coincidence.</li>
          </ul>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
