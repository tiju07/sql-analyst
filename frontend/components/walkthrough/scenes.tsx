"use client"

import {
  ArrowUp,
  BadgeCheck,
  Check,
  Database,
  MessageSquareText,
  PanelRight,
  RotateCcw,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react"
import type { ReactNode } from "react"

import { ClarifyCard } from "@/components/chat/ClarifyCard"
import { SqlCode } from "@/components/chat/SqlBlock"
import { StageStepper } from "@/components/chat/StageStepper"
import {
  AppShell,
  Appear,
  Badge,
  Callout,
  count,
  Cursor,
  Dot,
  Ring,
  seg,
  Stream,
  StatusPill,
  Typing,
  type Waypoint,
  type WalkthroughScene,
} from "@/design-system"
import aggregates from "@/fixtures/olist-aggregates.json"
import { deleteCanceled, revenueByCategory, revenueQ2 } from "@/fixtures/scenarios"
import { newAnswer, STAGES, type Answer, type StageName } from "@/lib/answer"
import { formatValue } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * The landing-page walkthrough (docs/WALKTHROUGH.md). Every scene is a pure function of `t`:
 * no state, no timers. Desktop window content is 1120 x 640, compact (phone) is 420 x 660.
 * Interactive targets sit at fixed positions (constants below) so cursor paths land on them.
 * Result numbers come from the Olist fixtures; timings and cost are labelled simulated.
 */

/* ── Layout constants (design pixels inside the window content) ─────────── */

const DESK = { sideW: 216, topH: 48, colX: 308, colW: 720, composerY: 556, composerH: 64, sendX: 1004, sendY: 596 }
const PHONE = { topH: 48, padX: 16, composerY: 592, composerH: 56, sendX: 384, sendY: 620 }

const NAV = [
  { id: "ask", label: "Ask", icon: <MessageSquareText /> },
  { id: "catalog", label: "Data catalog", icon: <Database /> },
  { id: "verified", label: "Verified queries", icon: <ShieldCheck /> },
]

type Persona = "admin" | "regional"
const PERSONA: Record<Persona, { name: string; scope: string }> = {
  admin: { name: "Ana Admin", scope: "All states" },
  regional: { name: "Carla Regional (SP)", scope: "Customers in SP" },
}

/* ── Shared pieces ─────────────────────────────────────────────────────── */

function PersonaChip({ persona, highlight }: { persona: Persona; highlight?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-2 rounded-md border px-2 text-xs transition-colors",
        highlight ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-fg-2",
      )}
    >
      <Dot tone={persona === "regional" ? "warning" : "success"} />
      {PERSONA[persona].name}
    </span>
  )
}

function SidebarFooter({ persona, highlight }: { persona: Persona; highlight?: boolean }) {
  return (
    <div className="grid gap-1.5">
      <span className="label">View as</span>
      <span
        className={cn(
          "text-fg flex h-9 items-center justify-between rounded-md border px-2 text-[13px]",
          highlight ? "border-accent shadow-[0_0_0_3px_var(--accent-ring)]" : "border-line-strong",
        )}
      >
        {PERSONA[persona].name}
        <span className="text-fg-faint" aria-hidden>
          v
        </span>
      </span>
      <span className="text-fg-muted text-[11px]">{PERSONA[persona].scope}</span>
    </div>
  )
}

/** Composer at a fixed position, with typed text and a focus ring. */
function Composer({
  compact,
  text,
  t,
  start,
  focused,
  sent,
  opacity = 1,
}: {
  compact: boolean
  text?: string
  t: number
  start?: number
  focused?: boolean
  sent?: boolean
  opacity?: number
}) {
  const box = compact
    ? { left: 12, right: 12, top: PHONE.composerY, height: PHONE.composerH }
    : { left: DESK.colX, width: DESK.colW, top: DESK.composerY, height: DESK.composerH }
  const showText = text !== undefined && start !== undefined && t >= start && !sent
  return (
    <div
      className={cn(
        "bg-surface absolute flex items-start rounded-lg border px-3 py-2.5 text-sm transition-[border-color,box-shadow]",
        focused ? "border-accent shadow-[0_0_0_3px_var(--accent-ring)]" : "border-line-strong",
      )}
      style={{ ...box, opacity }}
    >
      <span className={cn("min-w-0 flex-1 truncate pr-10", showText ? "text-fg" : "text-fg-faint")}>
        {showText ? (
          <Typing text={text} t={t} start={start} cps={34} />
        ) : (
          "Ask about orders, revenue, deliveries, reviews"
        )}
      </span>
      <span
        className={cn(
          "text-accent-fg absolute right-2.5 bottom-2.5 grid size-7 place-items-center rounded-md",
          showText ? "bg-accent" : "bg-accent/40",
        )}
      >
        <ArrowUp className="size-4" aria-hidden />
      </span>
    </div>
  )
}

/** The Explore workspace frame: Foundry AppShell (desktop) or its compact phone layout. */
function Workspace({
  compact,
  active = "ask",
  persona = "admin",
  personaHighlight,
  children,
  composer,
  cursor,
}: {
  compact: boolean
  active?: string
  persona?: Persona
  personaHighlight?: boolean
  children: ReactNode
  composer?: ReactNode
  cursor?: ReactNode
}) {
  return (
    <div className="relative h-full">
      <AppShell
        brand="SQL Analyst"
        nav={NAV}
        activeId={active}
        compact={compact}
        footer={<SidebarFooter persona={persona} highlight={personaHighlight} />}
        topbar={
          <div className="flex w-full items-center justify-between">
            <span className="text-fg text-[13px] font-medium">{NAV.find((n) => n.id === active)?.label}</span>
            <PersonaChip persona={persona} />
          </div>
        }
      >
        <div className={cn("relative h-full", compact ? "px-4 pt-4" : "")}>
          {compact ? (
            <div className="mb-3 flex justify-end">
              <PersonaChip persona={persona} highlight={personaHighlight} />
            </div>
          ) : null}
          <div
            className={compact ? "" : "absolute top-6"}
            style={compact ? undefined : { left: DESK.colX - DESK.sideW, width: DESK.colW }}
          >
            {children}
          </div>
        </div>
      </AppShell>
      {composer}
      {cursor}
    </div>
  )
}

/** PageHeader look without an h1: the page around the walkthrough owns the only h1. */
function SceneHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <p className="text-fg text-xl font-medium tracking-tight">{title}</p>
      {description ? <p className="text-fg-muted mt-1 text-sm">{description}</p> : null}
    </div>
  )
}

function Question({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="border-line bg-surface-2 text-fg max-w-[85%] rounded-lg border px-3 py-1.5 text-[13px]">{text}</p>
    </div>
  )
}

/** Stage trail from the real StageStepper, driven by a schedule of [stage, start, end] in ms. */
function trail(
  question: string,
  schedule: [StageName, number, number][],
  t: number,
  timings: Partial<Record<StageName, number>>,
): Answer {
  const a = newAnswer("walkthrough", question)
  for (const [name, start, end] of schedule) {
    if (t >= end) a.stages[name] = { status: "done", ms: timings[name] ?? 0, rounds: 1 }
    else if (t >= start) a.stages[name] = { status: "active", ms: Math.round(t - start), rounds: 1 }
  }
  return a
}

function Trail({ answer }: { answer: Answer }) {
  const allDone = STAGES.every((s) => answer.stages[s.name].status !== "active")
  return (
    <StageStepper
      answer={answer}
      live={false}
      simulated={allDone && STAGES.some((s) => answer.stages[s.name].status === "done")}
    />
  )
}

function money(v: number) {
  return formatValue(v, "currency_brl", { compact: true })
}

/* ── Scene 1: start in the workspace ───────────────────────────────────── */

const counts = aggregates.row_counts
const STATS: [string, number][] = [
  ["Orders", counts.orders],
  ["Order items", counts.order_items],
  ["Customers", counts.customers],
  ["Sellers", counts.sellers],
]
const SUGGESTED = [
  revenueQ2.question,
  "What is the late delivery rate by state for delivered orders?",
  "Which are our best product categories?",
  "Monthly orders and revenue for 2017",
]

function sceneStart({ t, compact }: { t: number; compact: boolean }) {
  const path: Waypoint[] = compact
    ? [
        { t: 2400, x: 210, y: 330 },
        { t: 4600, x: 200, y: PHONE.composerY + 26, click: true },
      ]
    : [
        { t: 2400, x: 660, y: 330 },
        { t: 4600, x: 520, y: DESK.composerY + 30, click: true },
      ]
  return (
    <Workspace
      compact={compact}
      composer={<Composer compact={compact} t={t} focused={t >= 4600} opacity={seg(t, 2000, 2400)} />}
      cursor={<Cursor path={path} t={t} />}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        <SceneHeader
          title="Ask the Olist marketplace"
          description={
            compact
              ? "Brazilian e-commerce, 2016 to 2018."
              : "Orders, payments, deliveries and reviews from a Brazilian marketplace, 2016 to 2018."
          }
        />
        <div className={cn("hairline", compact ? "grid-cols-2" : "grid-cols-4")}>
          {STATS.map(([label, n], i) => (
            <div key={label} className="grid gap-1 p-3">
              <span className="label">{label}</span>
              <span className="text-fg tabular text-lg font-medium tracking-tight">
                {Math.round(count(t, 200 + i * 120, 1800, 0, n)).toLocaleString("en-US")}
              </span>
            </div>
          ))}
        </div>
        <Appear t={t} at={1200}>
          <div className="grid gap-2">
            <span className="label">Try one of these</span>
            <div className={cn("grid gap-2", compact ? "grid-cols-1" : "grid-cols-2")}>
              {SUGGESTED.slice(0, compact ? 3 : 4).map((q) => (
                <span key={q} className="border-line bg-surface text-fg-2 rounded-lg border px-3 py-2 text-[13px]">
                  {q}
                </span>
              ))}
            </div>
          </div>
        </Appear>
      </div>
    </Workspace>
  )
}

/* ── Scenes 2 to 4: one question, start to finish ─────────────────────── */

const Q2 = revenueQ2.question
const Q2_RESULT = revenueQ2.result!
const CANDIDATE_LABELS = revenueQ2.candidates.map((c) => c.label)

type CandidateState = {
  label: string
  at: number
  status?: { text: string; tone: "success" | "danger" | "warning" | "info" }
  note?: string
}

function Candidates({ t, items, compact }: { t: number; items: CandidateState[]; compact: boolean }) {
  return (
    <ol className="divide-line border-line bg-surface divide-y overflow-hidden rounded-lg border">
      {items.map((c, i) => (
        <li key={c.label} className="px-3 py-2" style={{ opacity: seg(t, c.at, c.at + 300) }}>
          <div className="flex items-center gap-2 text-[13px]">
            <span className="text-fg-muted font-mono text-[11px]">{i + 1}</span>
            <span className="text-fg">{c.label}</span>
            <span className="ml-auto">
              {c.status ? <StatusPill status={c.status.text} tone={c.status.tone} /> : <Badge>Writing</Badge>}
            </span>
          </div>
          {c.note ? (
            <p
              className={cn(
                "mt-1 font-mono text-[11px]",
                compact ? "truncate" : "",
                c.status?.tone === "danger" ? "text-danger" : "text-fg-muted",
              )}
            >
              {c.note}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

const ASK_SCHEDULE: [StageName, number, number][] = [
  ["retrieve", 2500, 3300],
  ["clarify", 3300, 3600],
  ["generate", 3800, 99_000],
]

function sceneAsk({ t, compact }: { t: number; compact: boolean }) {
  const sentAt = 2300
  const sent = t >= sentAt
  const path: Waypoint[] = compact
    ? [
        { t: 1700, x: 220, y: 610 },
        { t: sentAt, x: PHONE.sendX, y: PHONE.sendY, click: true },
      ]
    : [
        { t: 1700, x: 760, y: 600 },
        { t: sentAt, x: DESK.sendX, y: DESK.sendY, click: true },
      ]
  return (
    <Workspace
      compact={compact}
      composer={<Composer compact={compact} text={Q2} t={t} start={300} focused={!sent} sent={sent} />}
      cursor={<Cursor path={path} t={t} />}
    >
      {sent ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
          <Question text={Q2} />
          <Trail answer={trail(Q2, ASK_SCHEDULE, t, revenueQ2.timings)} />
          <Appear t={t} at={3300}>
            <div className="border-line bg-bg-subtle grid gap-2 rounded-lg border p-3 text-[13px]">
              <span className="label">Context found</span>
              <div className="flex flex-wrap gap-1.5">
                {revenueQ2.context.tables.map((tb) => (
                  <Badge key={tb} mono>
                    {tb}
                  </Badge>
                ))}
              </div>
              <p className="text-fg-2">
                Metric <span className="text-fg font-mono text-[12px]">revenue = SUM(order_items.price)</span>
              </p>
              <p className="text-fg-2">Note: the last full quarter is 2018 Q2.</p>
            </div>
          </Appear>
          <Appear t={t} at={4400}>
            <Candidates
              t={t}
              compact={compact}
              items={CANDIDATE_LABELS.map((label, i) => ({ label, at: 4500 + i * 500 }))}
            />
          </Appear>
        </div>
      ) : null}
    </Workspace>
  )
}

const CHECK_SCHEDULE: [StageName, number, number][] = [
  ["retrieve", -2, -1],
  ["clarify", -2, -1],
  ["generate", -1, 300],
  ["guard", 300, 900],
  ["execute", 1600, 2400],
  ["repair", 3200, 4400],
  ["select", 4400, 5000],
]

function sceneCheck({ t, compact }: { t: number; compact: boolean }) {
  const repairing = t >= 3200 && t < 4400
  const items: CandidateState[] = [0, 1, 2].map((i) => {
    const label = CANDIDATE_LABELS[i]
    if (t < 900) return { label, at: -1 }
    if (i < 2)
      return {
        label,
        at: -1,
        status: t >= 1600 ? { text: "5 rows", tone: "success" } : { text: "Passed guard", tone: "info" },
        note: t >= 900 && t < 1600 ? "LIMIT 5 kept" : undefined,
      }
    if (t < 2400) return { label, at: -1, status: { text: "Passed guard", tone: "info" } }
    if (t < 3200)
      return { label, at: -1, status: { text: "Failed", tone: "danger" }, note: revenueQ2.candidates[2].fails!.error }
    if (t < 4400)
      return {
        label,
        at: -1,
        status: { text: "Repair 1", tone: "warning" },
        note: "SUM(i.revenue)  becomes  SUM(i.price) AS revenue",
      }
    return { label, at: -1, status: { text: "5 rows", tone: "success" }, note: "Repaired once" }
  })
  return (
    <Workspace compact={compact} composer={<Composer compact={compact} t={t} />}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <Question text={Q2} />
        <Trail answer={trail(Q2, CHECK_SCHEDULE, t, revenueQ2.timings)} />
        <Candidates t={t} compact={compact} items={items} />
        {t >= 2400 && t < 4600 ? (
          <div className="relative">
            {repairing ? <Ring t={t} at={3200} until={4300} /> : null}
            <Appear t={t} at={2400}>
              <div className="max-h-[132px] overflow-hidden">
                <SqlCode sql={t < 3200 ? revenueQ2.candidates[2].fails!.sql : revenueQ2.candidates[2].sql} />
              </div>
            </Appear>
          </div>
        ) : null}
        <Appear t={t} at={5000}>
          <Callout tone="success" title="3 of 3 candidates agree">
            Same result from all three queries. One was repaired once after a database error.
          </Callout>
        </Appear>
      </div>
    </Workspace>
  )
}

const ALL_DONE: [StageName, number, number][] = STAGES.filter((s) => s.name !== "compose").map((s) => [s.name, -2, -1])

function Bars({ t, start, rows, compact }: { t: number; start: number; rows: [string, number][]; compact: boolean }) {
  const max = Math.max(...rows.map(([, v]) => v))
  return (
    <div className="grid gap-2">
      {rows.map(([label, v], i) => {
        const k = seg(t, start + i * 90, start + 900 + i * 90)
        return (
          <div
            key={label}
            className={cn(
              "grid items-center gap-2 text-[12px]",
              compact ? "grid-cols-[92px_1fr_64px]" : "grid-cols-[110px_1fr_70px]",
            )}
          >
            <span className="text-fg-2 truncate font-mono">{label}</span>
            <span className="bg-surface-2 h-4 overflow-hidden rounded-sm">
              <span className="bg-accent block h-full rounded-sm" style={{ width: `${(v / max) * 100 * k}%` }} />
            </span>
            <span className="text-fg tabular text-right">{money(v * k)}</span>
          </div>
        )
      })}
    </div>
  )
}

function sceneAnswer({ t, compact }: { t: number; compact: boolean }) {
  const rows = Q2_RESULT.rows as [string, number][]
  const schedule: [StageName, number, number][] = [...ALL_DONE, ["compose", -1, 200]]
  return (
    <Workspace compact={compact} composer={compact ? undefined : <Composer compact={compact} t={t} />}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <Question text={Q2} />
        <Trail answer={trail(Q2, schedule, t, revenueQ2.timings)} />
        <div className={cn("grid gap-4", compact ? "" : "grid-cols-[1fr_260px]")}>
          <div className="border-line bg-surface grid gap-2 rounded-lg border p-3">
            <span className="text-fg text-[13px] font-medium">{Q2_RESULT.chart.title}</span>
            <Bars t={t} start={400} rows={rows} compact={compact} />
          </div>
          {compact ? null : (
            <Appear t={t} at={1000}>
              <table className="border-line bg-surface w-full overflow-hidden rounded-lg border text-[12px]">
                <thead className="bg-bg-subtle">
                  <tr>
                    <th className="label px-3 py-1.5 text-left">customer_state</th>
                    <th className="label px-3 py-1.5 text-right">revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([s, v]) => (
                    <tr key={s} className="border-line border-t">
                      <td className="text-fg px-3 py-1.5 font-medium">{s}</td>
                      <td className="text-fg-2 tabular px-3 py-1.5 text-right">{formatValue(v, "currency_brl")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Appear>
          )}
        </div>
        <p className="text-fg min-h-[60px] text-[13px] leading-relaxed">
          <Stream text={Q2_RESULT.summary} t={t} start={2000} wps={9} />
        </p>
        <Appear t={t} at={5600}>
          <p className="text-fg-muted text-[12px]">{Q2_RESULT.caveats[0]}</p>
        </Appear>
        <Appear t={t} at={6000}>
          <div className="border-line text-fg-muted flex items-center justify-between border-t pt-2 text-[12px]">
            <span className="flex gap-3">
              <span className="inline-flex items-center gap-1">
                <ThumbsUp className="size-3.5" aria-hidden /> Good
              </span>
              <span className="inline-flex items-center gap-1">
                <PanelRight className="size-3.5" aria-hidden /> Inspect
              </span>
            </span>
            <span className="tabular flex items-center gap-2">
              4.2 s, $0.012 <Badge mono>Simulated</Badge>
            </span>
          </div>
        </Appear>
      </div>
    </Workspace>
  )
}

/* ── Scene 5: ask when it is ambiguous ─────────────────────────────────── */

const BEST = "Which are our best product categories?"
const CLARIFY = { question: "Best by which measure?", options: ["Revenue", "Number of orders", "Average review score"] }
const CATEGORY_ROWS = (revenueByCategory.result!.rows as [string, number][]).slice(0, 3)
// Where the "Revenue" option sits once the clarify card is on screen.
const REVENUE_OPTION = { desk: { x: 365, y: 256 }, phone: { x: 64, y: 252 } }

function sceneClarify({ t, compact }: { t: number; compact: boolean }) {
  const sentAt = 1400
  const pickAt = 3800
  const sent = t >= sentAt
  const picked = t >= pickAt
  const target = compact ? REVENUE_OPTION.phone : REVENUE_OPTION.desk
  const path: Waypoint[] = [
    { t: 1000, x: compact ? PHONE.sendX - 30 : DESK.sendX - 60, y: compact ? PHONE.sendY : DESK.sendY },
    { t: sentAt, x: compact ? PHONE.sendX : DESK.sendX, y: compact ? PHONE.sendY : DESK.sendY, click: true },
    { t: 2400, x: compact ? PHONE.sendX - 40 : DESK.sendX - 160, y: compact ? 420 : 420 },
    { t: pickAt, x: target.x, y: target.y, click: true },
  ]
  const schedule: [StageName, number, number][] = [
    ["retrieve", 1500, 1600],
    ["clarify", 1600, 2200],
    ["generate", 4000, 4400],
    ["guard", 4400, 4600],
    ["execute", 4600, 5000],
    ["select", 5000, 5200],
    ["compose", 5200, 5400],
  ]
  return (
    <Workspace
      compact={compact}
      composer={<Composer compact={compact} text={BEST} t={t} start={300} focused={!sent} sent={sent} />}
      cursor={<Cursor path={path} t={t} />}
    >
      {sent ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
          <Question text={BEST} />
          <Trail answer={trail(BEST, schedule, t, revenueByCategory.timings)} />
          <Appear t={t} at={2200}>
            <ClarifyCard
              question={CLARIFY.question}
              options={CLARIFY.options}
              answered={picked ? "Revenue" : null}
              disabled={false}
              onAnswer={() => undefined}
            />
          </Appear>
          <Appear t={t} at={5400}>
            <div className="border-line bg-surface grid gap-2 rounded-lg border p-3">
              <span className="text-fg text-[13px] font-medium">Top categories by revenue</span>
              <Bars t={t} start={5400} rows={CATEGORY_ROWS} compact={compact} />
            </div>
          </Appear>
        </div>
      ) : null}
    </Workspace>
  )
}

/* ── Scene 6: unsafe SQL never runs ────────────────────────────────────── */

const DELETE_Q = deleteCanceled.question

function sceneBlocked({ t, compact }: { t: number; compact: boolean }) {
  const sentAt = 1200
  const sent = t >= sentAt
  const path: Waypoint[] = [
    { t: 700, x: compact ? PHONE.sendX - 30 : DESK.sendX - 60, y: compact ? PHONE.sendY : DESK.sendY },
    { t: sentAt, x: compact ? PHONE.sendX : DESK.sendX, y: compact ? PHONE.sendY : DESK.sendY, click: true },
  ]
  const schedule: [StageName, number, number][] = [
    ["retrieve", 1250, 1350],
    ["clarify", 1350, 1450],
    ["generate", 1450, 1900],
    ["guard", 2000, 2600],
  ]
  const blocked = t >= 2600
  return (
    <Workspace
      compact={compact}
      composer={<Composer compact={compact} text={DELETE_Q} t={t} start={300} focused={!sent} sent={sent} />}
      cursor={<Cursor path={path} t={t} />}
    >
      {sent ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
          <Question text={DELETE_Q} />
          <Trail answer={trail(DELETE_Q, schedule, t, deleteCanceled.timings)} />
          <Appear t={t} at={2000}>
            <div className="border-line bg-surface grid gap-2 rounded-lg border p-3">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="text-fg-muted font-mono text-[11px]">1</span>
                <span className="text-fg">Candidate query</span>
                <span className="ml-auto">
                  {blocked ? <StatusPill status="Blocked" tone="danger" /> : <Badge>Checking</Badge>}
                </span>
              </div>
              <p
                className={cn(
                  "border-line bg-bg-subtle rounded-md border px-2 py-1.5 font-mono text-[12px]",
                  blocked ? "text-danger decoration-danger/60 line-through" : "text-fg-2",
                )}
              >
                {deleteCanceled.candidates[0].sql}
              </p>
              {blocked ? <p className="text-danger font-mono text-[11px]">{deleteCanceled.blocked}</p> : null}
            </div>
          </Appear>
          <Appear t={t} at={3200}>
            <Callout tone="danger" title="Blocked by the safety checks, so nothing ran">
              Rows executed: 0.
            </Callout>
          </Appear>
          <Appear t={t} at={3800}>
            <div className={cn("grid gap-2", compact ? "grid-cols-1" : "grid-cols-3")}>
              {["SQL guard: one read-only SELECT", "Read-only database role", "Row-level security"].map((l) => (
                <span
                  key={l}
                  className="border-line bg-surface text-fg-2 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px]"
                >
                  <Check className="text-success size-3.5" aria-hidden />
                  {l}
                </span>
              ))}
            </div>
          </Appear>
        </div>
      ) : null}
    </Workspace>
  )
}

/* ── Scene 7: each person sees only their rows ─────────────────────────── */

const SP = (Q2_RESULT.rows as [string, number][])[0]
const RLS_Q = "Revenue by state last quarter"
// The "View as" control: sidebar footer on desktop, persona chip in the content on phones.
const VIEW_AS = { desk: { x: 108, y: 590 }, phone: { x: 330, y: 77 } }

function sceneRls({ t, compact }: { t: number; compact: boolean }) {
  const switchAt = 1600
  const sentAt = 3300
  const persona: Persona = t >= 1800 ? "regional" : "admin"
  const sent = t >= sentAt
  const target = compact ? VIEW_AS.phone : VIEW_AS.desk
  const path: Waypoint[] = [
    { t: 400, x: compact ? 210 : 620, y: compact ? 300 : 360 },
    { t: switchAt, x: target.x, y: target.y, click: true },
    { t: 2600, x: compact ? PHONE.sendX - 40 : DESK.sendX - 80, y: compact ? PHONE.sendY : DESK.sendY },
    { t: sentAt, x: compact ? PHONE.sendX : DESK.sendX, y: compact ? PHONE.sendY : DESK.sendY, click: true },
  ]
  const schedule: [StageName, number, number][] = [
    ["retrieve", 3600, 3750],
    ["clarify", 3750, 3850],
    ["generate", 3850, 4150],
    ["guard", 4150, 4250],
    ["execute", 4250, 4500],
    ["select", 4500, 4600],
    ["compose", 4600, 4800],
  ]
  return (
    <Workspace
      compact={compact}
      persona={persona}
      personaHighlight={t >= switchAt - 200 && t < 2600}
      composer={<Composer compact={compact} text={RLS_Q} t={t} start={2200} focused={t >= 2200 && !sent} sent={sent} />}
      cursor={<Cursor path={path} t={t} />}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <Appear t={t} at={1800}>
          <div className="text-fg-2 flex items-center gap-2 text-[13px]">
            <Badge tone="warning" dot>
              Customers in SP
            </Badge>
            Signed in as {PERSONA.regional.name}
          </div>
        </Appear>
        {sent ? (
          <>
            <Question text={RLS_Q} />
            <Trail answer={trail(RLS_Q, schedule, t, revenueQ2.timings)} />
            <Appear t={t} at={4800}>
              <table className="border-line bg-surface w-full overflow-hidden rounded-lg border text-[13px]">
                <thead className="bg-bg-subtle">
                  <tr>
                    <th className="label px-3 py-1.5 text-left">customer_state</th>
                    <th className="label px-3 py-1.5 text-right">revenue</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-line border-t">
                    <td className="text-fg px-3 py-2 font-medium">{SP[0]}</td>
                    <td className="text-fg tabular px-3 py-2 text-right">{formatValue(SP[1], "currency_brl")}</td>
                  </tr>
                </tbody>
              </table>
            </Appear>
            <Appear t={t} at={5400}>
              <Callout tone="info" title="Row scope SP, signed and checked by the database">
                The same SQL ran. Postgres row-level security returned only São Paulo.
              </Callout>
            </Appear>
          </>
        ) : null}
      </div>
    </Workspace>
  )
}

/* ── Scene 8: good answers teach the agent ─────────────────────────────── */

const THUMB = { desk: { x: 325, y: 461 }, phone: { x: 33, y: 497 } }
const PROPOSE = { desk: { x: 452, y: 461 }, phone: { x: 162, y: 497 } }
const APPROVE = { desk: { x: 895, y: 216 }, phone: { x: 78, y: 285 } }

function sceneLearn({ t, compact }: { t: number; compact: boolean }) {
  const thumbAt = 1200
  const proposeAt = 2400
  const approveAt = 4400
  const onVerified = t >= 2800
  const approved = t >= 4600
  const k = compact ? "phone" : "desk"
  const path: Waypoint[] = [
    { t: 300, x: compact ? 210 : 640, y: compact ? 380 : 360 },
    { t: thumbAt, x: THUMB[k].x, y: THUMB[k].y, click: true },
    { t: proposeAt, x: PROPOSE[k].x, y: PROPOSE[k].y, click: true },
    { t: 3200, x: compact ? 210 : 700, y: compact ? 330 : 300 },
    { t: approveAt, x: APPROVE[k].x, y: APPROVE[k].y, click: true },
  ]
  const rows = Q2_RESULT.rows as [string, number][]
  return (
    <Workspace compact={compact} active={onVerified ? "verified" : "ask"} cursor={<Cursor path={path} t={t} />}>
      {onVerified ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
          <SceneHeader
            title="Verified queries"
            description={compact ? undefined : "Approved queries become worked examples for similar questions."}
          />
          <div className="border-line flex gap-4 border-b text-[13px]">
            <span className="border-accent text-fg -mb-px border-b-2 pb-2 font-medium">Waiting for review</span>
            <span className="text-fg-muted pb-2">Approved</span>
          </div>
          <div className="border-line bg-surface grid gap-3 rounded-lg border p-3">
            <div className={cn("flex gap-3", compact ? "flex-col" : "items-start justify-between")}>
              <div className="grid justify-items-start gap-1.5">
                <p className="text-fg text-[13px] font-medium">{Q2}</p>
                {approved ? (
                  <StatusPill status="Approved" tone="success" />
                ) : (
                  <StatusPill status="Waiting for review" tone="warning" />
                )}
              </div>
              {approved ? null : (
                <div className="flex gap-2">
                  <span className="bg-accent text-accent-fg inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium">
                    <Check className="size-4" aria-hidden /> Approve
                  </span>
                  <span className="border-line-strong text-fg inline-flex h-8 items-center rounded-md border px-3 text-[13px]">
                    Reject
                  </span>
                </div>
              )}
            </div>
            <div className="max-h-[120px] overflow-hidden">
              <SqlCode sql={revenueQ2.candidates[0].sql} />
            </div>
          </div>
          <Appear t={t} at={4600}>
            <p className="text-fg-2 flex items-center gap-2 text-[13px]">
              <BadgeCheck className="text-success size-4" aria-hidden />
              Used as an example for similar questions.
            </p>
          </Appear>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
          <Question text={Q2} />
          <Trail answer={trail(Q2, [...ALL_DONE, ["compose", -2, -1]], t, revenueQ2.timings)} />
          <div className="border-line bg-surface grid gap-2 rounded-lg border p-3">
            <span className="text-fg text-[13px] font-medium">{Q2_RESULT.chart.title}</span>
            <Bars t={t} start={-2000} rows={rows} compact={compact} />
          </div>
          <p className="text-fg text-[13px] leading-relaxed">{Q2_RESULT.summary}</p>
          <div className="border-line flex items-center gap-1 border-t pt-2 text-[12px]">
            <span
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-md px-2",
                t >= thumbAt ? "bg-accent-soft text-accent-ink" : "text-fg-2",
              )}
            >
              <ThumbsUp className="size-4" aria-hidden />
            </span>
            <span className="text-fg-2 inline-flex h-8 items-center px-2">
              <ThumbsDown className="size-4" aria-hidden />
            </span>
            <span
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md px-2",
                t >= proposeAt ? "bg-surface-2 text-fg" : "text-fg-2",
              )}
            >
              <BadgeCheck className="size-4" aria-hidden /> Propose as verified
            </span>
            {compact ? null : (
              <span className="text-fg-2 inline-flex h-8 items-center gap-1.5 px-2">
                <RotateCcw className="size-4" aria-hidden /> Ask again
              </span>
            )}
          </div>
        </div>
      )}
    </Workspace>
  )
}

/* ── Scene list ────────────────────────────────────────────────────────── */

export const SCENES: WalkthroughScene[] = [
  {
    id: "start",
    title: "Start in the workspace",
    caption: `The Explore workspace opens on the Olist marketplace data: ${counts.orders.toLocaleString("en-US")} orders from 2016 to 2018, with the tables the agent can read.`,
    duration: 5500,
    render: sceneStart,
  },
  {
    id: "ask",
    title: "Ask in plain English",
    caption:
      "Type a question. Retrieval finds the tables, the metric definition and a note that the data ends in August 2018, so last quarter means 2018 Q2.",
    duration: 8000,
    render: sceneAsk,
  },
  {
    id: "check",
    title: "Check, run, repair",
    caption:
      "A parser-based guard allows only one read-only SELECT over known tables. One candidate fails, so the exact database error goes back to the model and the repaired query runs.",
    duration: 8000,
    render: sceneCheck,
  },
  {
    id: "answer",
    title: "The answer",
    caption:
      "The answer arrives as a chart, a table and a short explanation with its caveats. Timing and cost in the demo are simulated.",
    duration: 8000,
    render: sceneAnswer,
  },
  {
    id: "clarify",
    title: "Ask when it is ambiguous",
    caption: "When a question could mean several things, the agent asks first instead of guessing.",
    duration: 7000,
    render: sceneClarify,
  },
  {
    id: "blocked",
    title: "Unsafe SQL never runs",
    caption:
      "Asked to delete data, the guard blocks the query before it reaches the database. Even if it got through, the database role can only read.",
    duration: 7000,
    render: sceneBlocked,
  },
  {
    id: "rls",
    title: "Each person sees only their rows",
    caption:
      "Switch to the São Paulo regional manager and ask again. Row-level security in Postgres returns only SP, whatever the SQL says.",
    duration: 7500,
    render: sceneRls,
  },
  {
    id: "learn",
    title: "Good answers teach the agent",
    caption:
      "A thumbs-up and Propose as verified send the query to an admin. Approved queries become worked examples for similar questions.",
    duration: 6500,
    render: sceneLearn,
  },
]
