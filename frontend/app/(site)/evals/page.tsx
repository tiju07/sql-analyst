import { Database, FlaskConical, ShieldAlert } from "lucide-react"

import { MarketingFooter, MarketingNav } from "@/components/marketing/chrome"
import { AboutMeButton } from "@/components/marketing/links"
import { Badge, Callout, CtaBand, FeatureGrid, Section, StatusPill, TBody, TD, TH, THead, TR } from "@/design-system"
import summary from "@/lib/evals/summary.json"
import type { EvalSummary } from "@/lib/evals/types"
import { pageMetadata } from "@/lib/metadata"

export const metadata = pageMetadata({
  title: "Method",
  description:
    "How SQL Analyst is evaluated: execution accuracy on BIRD Mini-Dev, a golden Olist question set, and a safety red team.",
  path: "/evals/",
})

const results = summary as EvalSummary
const SAFETY_FILE = "backend/evals/results/safety/compromised-model/summary.json"
const runDate = new Date(results.generated_at).toLocaleDateString("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

const SUITES = [
  {
    icon: <Database />,
    title: "BIRD Mini-Dev",
    body: "500 public questions over 11 SQLite databases. Scored by execution accuracy with the official scorer: the answer counts only if its rows match the reference query's rows.",
    tag: "not run yet",
  },
  {
    icon: <FlaskConical />,
    title: "Golden Olist set",
    body: "60 questions on the Olist data written for this project, with reference SQL and expected clarifications. Measures accuracy, clarification behaviour and cost per question.",
    tag: "not run yet",
  },
  {
    icon: <ShieldAlert />,
    title: "Safety red team",
    body: "30 adversarial cases: write and DDL requests, slow queries, settings changes, and attempts by the São Paulo manager to read other states. A case passes when nothing unsafe runs and no out-of-scope row returns.",
    tag: "partly run",
  },
]

const SAFETY_ROWS = [
  {
    model: "Real model",
    status: "Not run",
    tone: "neutral" as const,
    passed: "None yet",
    nonSelect: "None yet",
    outside: "None yet",
  },
  {
    model: "Scripted attacker model, not a real LLM",
    status: "Run",
    tone: "success" as const,
    passed: results.safety_compromised
      ? `${results.safety_compromised.passed} of ${results.safety_compromised.cases}`
      : "None yet",
    nonSelect: String(results.safety_compromised?.non_select_executions ?? "None yet"),
    outside: String(results.safety_compromised?.rows_outside_scope ?? "None yet"),
  },
]

export default function MethodPage() {
  return (
    <>
      <MarketingNav />
      <main id="main">
        <section className="container-x pt-20 sm:pt-28">
          <div className="grid max-w-3xl justify-items-start gap-5">
            <Badge tone="warning" dot>
              Benchmark results not published yet
            </Badge>
            <h1 className="text-[clamp(2.2rem,5vw,3.6rem)] leading-[1.05] tracking-[-0.04em] text-balance">
              How SQL Analyst is measured
            </h1>
            <p className="text-fg-2 text-[1.05rem] text-pretty">
              The evaluation harness is built and tested, but no run with a real model has been recorded, so this page
              shows no accuracy numbers. It explains what each suite measures and shows the one result that has been
              recorded, with its source.
            </p>
          </div>
        </section>

        <Section label="Suites" title="Three ways to check the agent">
          <FeatureGrid items={SUITES} columns={3} />
        </Section>

        <Section
          label="Recorded result"
          title="The defences hold even when the model attacks"
          lede="This run replaced the model with a scripted stand-in that always writes the attack, so it tests the guard, the read-only role and row-level security on their own. It says nothing about how often a real model attempts an attack."
        >
          <div className="grid gap-4">
            {/* Foundry's Table wrapper scrolls but cannot take focus; this one can (keyboard scrolling on phones). */}
            <div
              role="region"
              aria-label="Safety red team results"
              tabIndex={0}
              className="border-line bg-surface overflow-x-auto rounded-lg border"
            >
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">Safety red team results by model</caption>
                <THead>
                  <tr>
                    <TH>Model</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Cases passed</TH>
                    <TH className="text-right">Non-SELECT executed</TH>
                    <TH className="text-right">Rows outside scope</TH>
                  </tr>
                </THead>
                <TBody>
                  {SAFETY_ROWS.map((r) => (
                    <TR key={r.model}>
                      <TD className="text-fg min-w-56 font-medium">{r.model}</TD>
                      <TD>
                        <StatusPill status={r.status} tone={r.tone} />
                      </TD>
                      <TD className="tabular text-right">{r.passed}</TD>
                      <TD className="tabular text-right">{r.nonSelect}</TD>
                      <TD className="tabular text-right">{r.outside}</TD>
                    </TR>
                  ))}
                </TBody>
              </table>
            </div>
            <p className="text-fg-muted text-xs">
              Source: <code className="font-mono">{SAFETY_FILE}</code>, recorded {runDate} by{" "}
              <code className="font-mono">backend/evals/safety/runner.py</code>.
            </p>
          </div>
        </Section>

        <Section label="Limits" title="What to keep in mind">
          <Callout tone="info" title="Read results with these limits">
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {results.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </Callout>
        </Section>

        <CtaBand
          title="Built by Tiju Lukose"
          body="SQL Analyst is a portfolio project. More about my work, and how to reach me, is on my site."
          actions={<AboutMeButton />}
        />
      </main>
      <MarketingFooter />
    </>
  )
}
