# Architecture

## Components

| Service | Code | Role |
|---|---|---|
| `caddy` | `infra/caddy/Caddyfile` | TLS and one origin for everything. `/api/*` to the API, `/mcp*` to the MCP server, the rest to Next.js. SSE routes (`/api/chat`, `/api/runs/*/clarify`) are unbuffered (`flush_interval -1`, 10 min read timeout); `/api/metrics` is never exposed. |
| `web` | `frontend/` | Next.js 16 App Router. Two root layouts: `(site)` for the static `/` and `/evals`, `(product)` for `/login`, `/app/*`, `/runs/*`, which get a per-request CSP nonce from `proxy.ts`. |
| `api` | `backend/app/main.py` | FastAPI: auth, catalog, conversations, the SSE chat endpoints, runs, feedback, verified queries, health and Prometheus metrics. Runs Alembic migrations on start. |
| `worker` | `backend/app/workers/` | arq jobs on Redis: catalog sync (introspection, sample values, value index, LLM-drafted descriptions, embeddings). |
| `mcp` | `backend/app/mcp_server.py` | MCP server (SDK 2.x, streamable HTTP, stateless): `list_tables`, `describe_table`, `ask`. |
| `app-db` | Postgres 16 + pgvector + pg_trgm | Users, catalog and embeddings, semantic layer, conversations, runs, feedback, verified queries, audit log, LangGraph checkpoints. |
| `target-db` | Postgres 16 | The Olist data in schema `olist`, owned by a separate role; the app reads it only as `analyst_ro`. |
| `redis` | Redis 8 | Result rows (1 h TTL), rate-limit buckets (Lua token bucket), daily spend counter, cancel flags, job queue. |
| `otel-collector`, `jaeger` | `infra/otel/` | Traces: one span per run, per node and per LLM call (GenAI attributes: model, tokens, cost). Langfuse can be added via OTLP. |

## A question, end to end

1. The browser `POST`s `/api/chat` with `fetch` (not `EventSource`, which can't POST) and reads
   the SSE stream with a small parser (`frontend/lib/sse.ts`).
2. The API checks the session cookie, the per-user rate limit and the daily budget, creates the
   conversation and the `query_runs` row, and starts the run as a background task
   (`app/graph/manager.py`). The SSE response only drains that task's event queue, so a dropped
   connection doesn't stop the run; the client recovers by polling `GET /api/runs/{id}`.
3. The LangGraph agent runs (below). Nodes stream events through LangGraph's custom stream
   writer; a clarification surfaces as an `interrupt`, persisted by the Postgres checkpointer
   until `POST /api/runs/{id}/clarify` resumes it.
4. The final state is written to `query_runs` (SQL, candidates and attempts, chart spec, summary,
   timings, tokens, cost, trace id, the context used). Result rows stay in Redis only.

SSE events (`app/graph/events.py`, types generated into the frontend from OpenAPI):
`run`, `stage` (start and end with milliseconds), `clarify`, `sql` (each candidate and repair
attempt), `rows` (first 200 plus count), `chart`, `summary`, `done`, `error`. A comment heartbeat
goes out every 15 s.

## The agent (`backend/app/graph/`)

State is a checkpointed `TypedDict` of plain JSON. Live dependencies (database pools, the metered
LLM client, the executor) travel as LangGraph runtime context and are never checkpointed.

| Node | What it does |
|---|---|
| `retrieve` | Hybrid schema linking (`retrieval/schema_linker.py`): pgvector similarity over table and column embeddings, Postgres full-text search, and tables hit by literal-value matches, fused with reciprocal rank fusion (k = 60). Shortest foreign-key paths between the chosen tables are added. Produces one cacheable context block: compact DDL with descriptions and sample values, metric definitions, dimension synonyms, data notes, matched values and up to three verified examples. |
| `clarify` | Fast model with structured output: is the question genuinely ambiguous given the definitions and history? |
| `ask` | `interrupt()`. Separate from `clarify` because LangGraph re-runs a node on resume, and re-running an LLM call would cost money and could change the question. |
| `generate` | Three candidates in parallel. The SQL model's system prompt and the context block form a cached prefix; the per-candidate instruction comes after it, so all three share one cache entry. |
| `guard` | Deterministic policy (`sql/guard.py`) plus an optional `EXPLAIN` cost ceiling. |
| `execute` | Read-only transaction, `SET LOCAL statement_timeout`, signed RLS scope, row cap. Results go to Redis and are hashed for voting. |
| `repair` | Sends the failing SQL with the exact error (or "returned no rows") back to the SQL model; at most two rounds per candidate. |
| `select` | Majority vote on result hashes (row order ignored unless the query orders); ties go to fewer repairs, then shorter SQL. |
| `compose` | Chart chosen by rules (`graph/compose_rules.py`: one number is a KPI, a time column a line, at most 20 categories a bar, otherwise a table), then a short summary and caveats from the fast model. If that call fails, the answer still ships with a plain summary. |

Cross-cutting, in `nodes/common.py` and `llm/metered.py`: every node checks the cancel flag,
emits start and end stage events and an OTel span; every LLM call goes through `MeteredLLM`,
which enforces the per-run token cap and the global daily budget, prices the call
(`llm/pricing.py`) and records spend.

The agent is dialect-agnostic: the dialect, executor and default schema come from the context, so
the same graph runs on Postgres (the app) and SQLite (BIRD).

## Data model (app DB)

`users`, `connections`, `catalog_tables` and `catalog_columns` (descriptions with their source,
`human` or `llm`; embeddings; generated `tsvector`s), `catalog_values` (trigram-indexed literal
values), `semantic_layers` (the YAML; seeded from `semantic/metrics.yaml`, edited by admins) and
`semantic_metrics` derived from it, `conversations`, `query_runs`, `feedback`, `verified_queries`,
`audit_log`. Migrations are in `backend/alembic/versions/`; embedding dimension comes from
`EMBEDDING_DIM`.

## Frontend

- **Data:** TanStack Query over a typed `openapi-fetch` client generated from the API's OpenAPI
  schema, including the SSE event models (`make types`; CI fails on drift). A middleware sends a
  401 to `/login?next=…` and turns `RATE_LIMITED` and `BUDGET_EXCEEDED` into global banners.
- **Streaming:** `useChatStream` folds events through a pure reducer (`lib/answer.ts`) that also
  rebuilds answers from persisted runs, so live and historical answers render through the same
  `AnswerCard`.
- **Heavy parts load on demand:** Recharts, Shiki (core and the JavaScript regex engine, so no
  WASM) and CodeMirror.
- **Design:** tokens in `styles/tokens.css` (one accent, light and dark, contrast checked); chart
  colours validated for colour-blind separation; Geist fonts are self-hosted.

## Observability

Structured JSON logs (structlog); OpenTelemetry traces to the collector and Jaeger, with a trace
id on every run, shown in the Inspector; Prometheus counters and histograms on `/api/metrics`
(runs by status, latency, LLM tokens and cost), served inside the network only.

## Evaluation harness (`backend/evals/`)

The BIRD runner registers each SQLite database as two fold connections (for leak-free few-shot),
loads BIRD's column descriptions as catalog documentation, runs the ablations from
`ablations.yaml` with and without evidence, and scores with BIRD's official scripts, vendored
unmodified. LLM calls can be recorded and replayed; an oracle stand-in verifies the pipeline and a
hostile stand-in tests the defences. `report.py` writes `EVALS.md` and the summary behind `/evals`.
