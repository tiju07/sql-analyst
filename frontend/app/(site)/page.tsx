import Link from "next/link"

import { HeroAnswer } from "@/components/marketing/HeroAnswer"
import { SiteFooter } from "@/components/marketing/SiteFooter"
import { SiteHeader } from "@/components/marketing/SiteHeader"
import { loadEvalSummary } from "@/lib/evals/load"
import { formatValue } from "@/lib/format"
import { REPO_URL, TAGLINE } from "@/lib/site"

const STEPS = [
  [
    "Find the relevant schema",
    "Vector and keyword search over table and column descriptions picks the few tables a question needs, plus the joins between them and any values it names.",
  ],
  [
    "Ask when it's ambiguous",
    "If “best products” could mean revenue, units or rating, the agent asks before writing anything.",
  ],
  ["Write three candidates", "Three differently-instructed attempts at the SQL, written in parallel."],
  [
    "Check every query",
    "A parser-based guard allows a single read-only SELECT over known tables and caps the row count. Unsafe SQL never runs.",
  ],
  [
    "Run, and repair failures",
    "Queries run read-only with a timeout. Errors and empty results go back to the model with the exact database message, up to twice.",
  ],
  [
    "Pick the agreed answer",
    "The result most candidates agree on wins. A chart is chosen from the result's shape and a short explanation lists any caveats.",
  ],
] as const

const SAFETY = [
  [
    "Read-only by construction",
    "The agent connects as a role that can only SELECT. Writes fail at the database even if every other check failed.",
  ],
  [
    "Row-level security that can't be talked around",
    "A regional manager only ever sees São Paulo customers. The scope is signed, so SQL can't widen it.",
  ],
  ["Budgets and rate limits", "Per-user limits and a daily spend cap keep a public demo affordable."],
] as const

const STACK = [
  ["Agent", "LangGraph, Claude Sonnet 5.5 for SQL, Claude Haiku 5.5 for clarifying and summaries"],
  ["Backend", "FastAPI, PostgreSQL 16 with pgvector and pg_trgm, sqlglot, Redis"],
  ["Frontend", "Next.js 16, React 19, Tailwind CSS 4, TanStack Query, Table and Virtual, Recharts"],
  ["Operations", "Docker Compose, Caddy, OpenTelemetry and Jaeger, Prometheus, GitHub Actions"],
] as const

export default async function Home() {
  const evals = await loadEvalSummary()
  const best = evals?.bird?.runs.filter((r) => r.evidence).sort((a, b) => b.ex - a.ex)[0]
  const baseline = evals?.bird?.runs.find((r) => r.evidence && r.ablation.startsWith("a"))
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:pt-16 lg:pb-24">
          <div className="min-w-0">
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Plain-English questions. SQL you can check.
            </h1>
            <p className="text-muted-foreground mt-5 max-w-prose text-lg">{TAGLINE}</p>
            <p className="text-muted-foreground mt-3 max-w-prose">
              An analytics agent over 99,441 real marketplace orders, with every step it takes on show: the tables it
              chose, the queries it tried, and what each step cost.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/login" className="bg-primary text-primary-foreground rounded-lg px-5 py-3 font-medium">
                Try the live demo
              </Link>
              <a href="#how" className="hover:bg-accent rounded-lg px-4 py-3 font-medium">
                How it works
              </a>
            </div>
            <p className="text-muted-foreground mt-4 text-sm">
              No sign-up. Pick a persona: admin, analyst, or a regional manager who only sees São Paulo.
            </p>
          </div>
          <HeroAnswer />
        </section>

        <section id="how" className="border-t">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">How an answer is made</h2>
            <ol className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {STEPS.map(([title, body], i) => (
                <li key={title} className="relative pl-10">
                  <span
                    aria-hidden
                    className="border-primary text-primary absolute top-0 left-0 grid size-7 place-items-center rounded-full border text-sm font-medium"
                  >
                    {i + 1}
                  </span>
                  <h3 className="font-medium">{title}</h3>
                  <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {best && (
          <section className="border-t">
            <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
              <h2 className="text-2xl font-semibold tracking-tight">Measured, not claimed</h2>
              <p className="text-muted-foreground mt-2 max-w-prose">
                Execution accuracy on {evals?.bird?.dataset}, scored with the official BIRD evaluation code.
              </p>
              <dl className="mt-8 grid gap-6 sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground text-sm">Full system</dt>
                  <dd className="mt-1 text-4xl font-semibold tracking-tight">{formatValue(best.ex, "percent")}</dd>
                </div>
                {baseline && (
                  <div>
                    <dt className="text-muted-foreground text-sm">Zero-shot baseline, same model</dt>
                    <dd className="mt-1 text-4xl font-semibold tracking-tight">
                      {formatValue(baseline.ex, "percent")}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground text-sm">Cost per question</dt>
                  <dd className="mt-1 text-4xl font-semibold tracking-tight">
                    ${best.cost_per_question_usd.toFixed(3)}
                  </dd>
                </div>
              </dl>
              <Link
                href="/evals"
                className="text-primary mt-6 inline-block font-medium underline-offset-4 hover:underline"
              >
                Method, ablations and limitations
              </Link>
            </div>
          </section>
        )}

        <section className="border-t">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">Safe to leave on the public internet</h2>
            <ul className="mt-8 grid gap-8 sm:grid-cols-3">
              {SAFETY.map(([title, body]) => (
                <li key={title}>
                  <h3 className="font-medium">{title}</h3>
                  <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">Built with</h2>
            <dl className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-[10rem_1fr]">
              {STACK.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-medium">{k}</dt>
                  <dd className="text-muted-foreground">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-8 text-sm">
              Read the{" "}
              <a className="text-primary underline underline-offset-4" href={`${REPO_URL}/blob/main/ARCHITECTURE.md`}>
                architecture notes
              </a>{" "}
              or the{" "}
              <a className="text-primary underline underline-offset-4" href={REPO_URL}>
                source on GitHub
              </a>
              .
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
