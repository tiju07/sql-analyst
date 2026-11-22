/**
 * How the full system is designed (ARCHITECTURE.md), drawn in Foundry style: hairline boxes, mono
 * labels, the accent only on the path a question takes. Two layouts so text stays readable:
 * wide from the md breakpoint, tall on phones.
 */

type BoxProps = {
  x: number
  y: number
  w: number
  h?: number
  title: string
  sub: string
  accent?: boolean
  dashed?: boolean
}

function Box({ x, y, w, h = 60, title, sub, accent, dashed }: BoxProps) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={8}
        fill="var(--surface)"
        stroke={accent ? "var(--accent)" : "var(--line-strong)"}
        strokeDasharray={dashed ? "4 4" : undefined}
      />
      <text x={x + 14} y={y + 25} fill="var(--fg)" fontSize={14} fontWeight={500}>
        {title}
      </text>
      <text x={x + 14} y={y + 44} fill="var(--fg-muted)" fontSize={11} fontFamily="var(--font-mono)">
        {sub}
      </text>
    </g>
  )
}

function Chip({ x, y, n, label, w = 108 }: { x: number; y: number; n: number; label: string; w?: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={30} rx={4} fill="var(--bg-subtle)" stroke="var(--line)" />
      <text x={x + 10} y={y + 19.5} fontSize={11} fontFamily="var(--font-mono)" fill="var(--fg-muted)">
        {n}
      </text>
      <text x={x + 24} y={y + 19.5} fontSize={12} fill="var(--fg)">
        {label}
      </text>
    </g>
  )
}

const NODES = ["retrieve", "clarify", "generate x3", "guard", "execute", "repair", "select", "compose"]

function Line({ d, accent, dashed }: { d: string; accent?: boolean; dashed?: boolean }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={accent ? "var(--accent)" : "var(--line-strong)"}
      strokeWidth={accent ? 1.5 : 1}
      strokeDasharray={dashed ? "4 4" : undefined}
      markerEnd={accent ? "url(#arch-arrow)" : undefined}
    />
  )
}

function Defs() {
  return (
    <defs>
      <marker
        id="arch-arrow"
        viewBox="0 0 8 8"
        refX="7"
        refY="4"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M0 0L8 4L0 8z" fill="var(--accent)" />
      </marker>
    </defs>
  )
}

const TITLE = "System architecture"
const DESC =
  "A question goes from the browser through Caddy to the FastAPI API, which runs a LangGraph agent: retrieve, clarify, generate three candidates, guard, execute, repair, select and compose. The agent reads the Olist data in Postgres as a read-only role with row-level security, and calls a metered LLM provider. Supporting services: an app Postgres with pgvector, Redis, an arq worker for catalog sync, OpenTelemetry traces in Jaeger, and an MCP server."

function Wide() {
  return (
    <svg
      viewBox="0 0 1000 470"
      className="hidden h-auto w-full md:block"
      role="img"
      aria-labelledby="arch-title-w arch-desc-w"
    >
      <title id="arch-title-w">{TITLE}</title>
      <desc id="arch-desc-w">{DESC}</desc>
      <Defs />
      <Box x={16} y={24} w={168} title="Browser" sub="Next.js 16, React 19" accent />
      <Box x={216} y={24} w={150} title="Caddy" sub="TLS, one origin" accent />
      <Box x={398} y={24} w={172} title="FastAPI" sub="auth, limits, SSE" accent />
      <Line d="M184 54H214" accent />
      <Line d="M366 54H396" accent />
      <Line d="M570 54H600" accent />

      <rect x={602} y={16} width={382} height={232} rx={12} fill="none" stroke="var(--accent)" />
      <text x={620} y={44} fontSize={14} fontWeight={500} fill="var(--fg)">
        LangGraph agent
      </text>
      <text x={966} y={44} fontSize={11} fontFamily="var(--font-mono)" fill="var(--fg-muted)" textAnchor="end">
        checkpointed state
      </text>
      {NODES.map((n, i) => (
        <Chip key={n} x={618 + (i % 3) * 120} y={64 + Math.floor(i / 3) * 54} n={i + 1} label={n} />
      ))}

      <Box x={602} y={300} w={180} title="Olist in Postgres" sub="analyst_ro, RLS" accent />
      <Box x={804} y={300} w={180} title="LLM provider" sub="metered, budget cap" />
      <Line d="M692 248V298" accent />
      <Line d="M894 248V300" />

      <Box x={398} y={300} w={172} title="App Postgres" sub="pgvector, runs" dashed />
      <Box x={216} y={300} w={150} title="Redis" sub="rows, limits, jobs" dashed />
      <Box x={16} y={300} w={168} title="arq worker" sub="catalog sync" dashed />
      <Line d="M484 84V300" dashed />
      <Line d="M440 84V160H291V300" dashed />
      <Line d="M184 330H216" dashed />

      <Box x={398} y={396} w={172} title="Traces" sub="OpenTelemetry, Jaeger" dashed />
      <Box x={16} y={396} w={168} title="MCP server" sub="list, describe, ask" dashed />
      <Line d="M530 84V140H586V420H570" dashed />
      <Line d="M100 396V170H216V84" dashed />
    </svg>
  )
}

function Tall() {
  const side: [string, string][] = [
    ["App Postgres", "pgvector, runs"],
    ["Redis", "rows, limits, jobs"],
    ["arq worker", "catalog sync"],
    ["Traces", "OTel, Jaeger"],
    ["LLM provider", "metered, capped"],
    ["MCP server", "list, describe, ask"],
  ]
  return (
    <svg
      viewBox="0 0 360 900"
      className="h-auto w-full md:hidden"
      role="img"
      aria-labelledby="arch-title-t arch-desc-t"
    >
      <title id="arch-title-t">{TITLE}</title>
      <desc id="arch-desc-t">{DESC}</desc>
      <Defs />
      <Box x={8} y={8} w={344} title="Browser" sub="Next.js 16, React 19" accent />
      <Box x={8} y={96} w={344} title="Caddy" sub="TLS, one origin" accent />
      <Box x={8} y={184} w={344} title="FastAPI" sub="auth, limits, SSE" accent />
      <Line d="M180 68V94" accent />
      <Line d="M180 156V182" accent />
      <Line d="M180 244V270" accent />
      <rect x={8} y={272} width={344} height={260} rx={12} fill="none" stroke="var(--accent)" />
      <text x={24} y={300} fontSize={14} fontWeight={500} fill="var(--fg)">
        LangGraph agent
      </text>
      {NODES.map((n, i) => (
        <Chip key={n} x={24 + (i % 2) * 160} y={318 + Math.floor(i / 2) * 50} n={i + 1} label={n} w={152} />
      ))}
      <Line d="M180 532V558" accent />
      <Box x={8} y={560} w={344} title="Olist in Postgres" sub="read-only role, row-level security" accent />
      {side.map(([t, s], i) => (
        <Box key={t} x={8 + (i % 2) * 176} y={648 + Math.floor(i / 2) * 82} w={168} title={t} sub={s} dashed />
      ))}
    </svg>
  )
}

export function ArchitectureDiagram() {
  return (
    <figure className="border-line bg-bg-subtle rounded-lg border p-4 sm:p-6">
      <Wide />
      <Tall />
      <figcaption className="text-fg-muted mt-4 text-xs">
        How the full system is designed. Solid blue: the path a question takes. Dashed: supporting services. The public
        demo runs none of these services: it plays scripted answers, built from real query results, in your browser.
      </figcaption>
    </figure>
  )
}
