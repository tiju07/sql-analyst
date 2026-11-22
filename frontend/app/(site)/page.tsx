import {
  BadgeCheck,
  Braces,
  Database,
  FileSearch,
  GitBranch,
  LineChart,
  ListChecks,
  MessageCircleQuestion,
  ShieldCheck,
  Table2,
  Wrench,
} from "lucide-react"

import { ArchitectureDiagram } from "@/components/marketing/ArchitectureDiagram"
import { MarketingFooter, MarketingNav } from "@/components/marketing/chrome"
import { WalkthroughLoader } from "@/components/walkthrough/WalkthroughLoader"
import { AboutMeButton, ButtonLink } from "@/components/marketing/links"
import { Badge, CtaBand, FeatureGrid, Faq, Hero, Section, StackMarquee } from "@/design-system"

const STACK = [
  "Next.js 16",
  "React 19",
  "TypeScript",
  "FastAPI",
  "LangGraph",
  "PostgreSQL 16",
  "pgvector",
  "sqlglot",
  "Redis 8",
  "arq",
  "OpenTelemetry",
  "Caddy",
  "Docker Compose",
  "MCP",
]

const STEPS = [
  {
    icon: <FileSearch />,
    title: "Find the right tables",
    body: "Hybrid search over table and column descriptions, sample values and verified examples picks the context for the question.",
  },
  {
    icon: <MessageCircleQuestion />,
    title: "Ask when it is unclear",
    body: "If a question can mean several things, the agent asks one short question instead of guessing.",
  },
  {
    icon: <ShieldCheck />,
    title: "Write and check the SQL",
    body: "Three candidate queries are written in parallel, and a parser-based guard allows only one read-only SELECT.",
  },
  {
    icon: <LineChart />,
    title: "Run it and explain",
    body: "Queries run read-only with a timeout and row cap. The answer comes back as a table, a chart and a short summary.",
  },
]

const FEATURES = [
  {
    icon: <Braces />,
    title: "Every answer shows its SQL",
    body: "The exact query that produced the numbers is one click away, with every candidate and repair in the inspector.",
    tag: "transparent",
  },
  {
    icon: <ShieldCheck />,
    title: "Three layers of safety",
    body: "A SQL guard, a read-only database role and row-level security. A destructive query never reaches the database.",
    tag: "safety",
  },
  {
    icon: <Database />,
    title: "Row-level security per person",
    body: "A regional manager sees only their state. Postgres enforces it from a signed session value, whatever the SQL says.",
    tag: "access",
  },
  {
    icon: <Wrench />,
    title: "Repairs its own mistakes",
    body: "When a query fails, the exact database error goes back to the model for a bounded number of repair rounds.",
    tag: "reliability",
  },
  {
    icon: <BadgeCheck />,
    title: "Learns from approved answers",
    body: "A thumbs-up and a proposal send a query to an admin. Approved queries become examples for similar questions.",
    tag: "feedback",
  },
  {
    icon: <Table2 />,
    title: "A catalog people can edit",
    body: "Table and column descriptions, sample values and metric definitions in YAML, edited by admins and used in every prompt.",
    tag: "catalog",
  },
]

const DECISIONS = [
  {
    icon: <GitBranch />,
    title: "Three candidates, then a vote",
    body: "Candidates that return the same result agree; ties go to fewer repairs, then shorter SQL. One bad generation does not decide the answer.",
  },
  {
    icon: <ShieldCheck />,
    title: "The guard re-renders SQL",
    body: "Queries are parsed with sqlglot and re-rendered from the checked syntax tree, so what runs is exactly what was checked.",
  },
  {
    icon: <ListChecks />,
    title: "Streams survive a dropped connection",
    body: "The run continues on the server; the browser reconnects by polling the run, so a flaky network does not lose an answer.",
  },
  {
    icon: <Database />,
    title: "Definitions live in one place",
    body: "Revenue, late delivery and the other metrics are defined once in a semantic layer, so every query uses the same meaning.",
  },
]

const FAQ = [
  {
    q: "Is this real?",
    a: "The product is real: a FastAPI and LangGraph backend, Postgres with row-level security and a Next.js frontend, with tests and a Docker setup. This public page is a static demo. It plays scripted answers in your browser; the result numbers come from running the same queries on the public Olist dataset. Timings, tokens and cost shown in the demo are simulated.",
  },
  {
    q: "Can I use it?",
    a: "You can explore the demo workspace: ask any of the suggested questions, open the inspector, switch persona to see row-level security, and try feedback and approvals. Sign-ups are closed and nothing you do is saved.",
  },
  {
    q: "What does it cost to run?",
    a: "This demo costs nothing to run: it is static files with no backend, no database and no model calls. The full system runs on one server with Docker Compose and pays per model call, with a daily budget cap built in.",
  },
  {
    q: "Has it been benchmarked?",
    a: "Not yet. The evaluation harness (BIRD Mini-Dev, a golden question set and a safety red team) is built, but results with a real model have not been published. The Method page explains how it is measured.",
  },
  {
    q: "Where is the code?",
    a: "The code is in a private repository for now. Ask through the About me page if you would like to see it.",
  },
  {
    q: "Who built it?",
    a: "Tiju Lukose, as a portfolio project. The About me page has more about my work.",
  },
]

export default function LandingPage() {
  return (
    <>
      <MarketingNav />
      <main id="main">
        <Hero
          eyebrow={
            <Badge tone="accent" dot>
              Interactive demo, simulated data
            </Badge>
          }
          title="Ask your database in plain English. Get safe, checked SQL."
          lede="SQL Analyst turns business questions into read-only SQL over Postgres, shows the query it ran, and explains the result. Watch it work end to end, then try it yourself."
          actions={
            <>
              <ButtonLink href="#demo" size="lg">
                Watch the walkthrough
              </ButtonLink>
              <ButtonLink href="/app/" variant="outline" size="lg">
                Explore the app
              </ButtonLink>
            </>
          }
        >
          <div id="demo" className="scroll-mt-20">
            <WalkthroughLoader />
          </div>
        </Hero>

        <StackMarquee items={STACK} label="Designed around" />

        <Section
          id="how"
          label="How it works"
          title="From a question to an answer you can check"
          lede="Each answer passes through the same eight steps. The trail of steps is shown under every answer."
        >
          <FeatureGrid items={STEPS} columns={4} />
        </Section>

        <Section id="features" label="What it does" title="Built for people who need to trust the numbers">
          <FeatureGrid items={FEATURES} columns={3} />
        </Section>

        <Section
          id="architecture"
          label="Under the hood"
          title="How the full system is designed"
          lede="The full product runs as a set of services behind one origin. The public demo on this site runs on simulated data in your browser."
        >
          <ArchitectureDiagram />
          <div className="mt-8">
            <FeatureGrid items={DECISIONS} columns={4} />
          </div>
        </Section>

        <Section id="faq" label="FAQ" title="Questions people ask">
          <Faq items={FAQ} />
        </Section>

        <CtaBand
          title="Built by Tiju Lukose"
          body="SQL Analyst is a portfolio project. More about my work, and how to reach me, is on my site."
          actions={
            <>
              <AboutMeButton />
              <ButtonLink href="/app/" variant="outline" size="lg">
                Explore the app
              </ButtonLink>
            </>
          }
        />
      </main>
      <MarketingFooter />
    </>
  )
}
