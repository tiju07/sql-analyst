# Developer notes

A guided tour of the SQL Analyst codebase: what is built where, how each feature works, and the
non-obvious decisions behind it. Read this before changing code. README covers the product,
ARCHITECTURE the big picture, SECURITY the threat model; this file is for developers working in
the code.

Paths are relative to the repo root. `file.py:function` means "look for that function in that file".

---

## 1. The idea in one paragraph

A user asks a question in English. The backend runs a **LangGraph agent** that:

1. finds the relevant tables (retrieval),
2. asks a clarifying question if needed (pausing the graph),
3. has Claude write **three SQL candidates** in parallel,
4. runs each through a **deterministic guard** (parser-based, no LLM),
5. executes them **read-only**, under **row-level security**, with a timeout,
6. sends failures back to the model with the exact error (at most two repairs per candidate),
7. **votes** on the results,
8. picks a chart by rules and has a fast model write a short summary.

Every step streams to the browser over **SSE**. The same agent powers the web app, the MCP
server and the benchmark harness; only the context (database, executor, config) changes.

---

## 2. Repository map

```
.
├── backend/                 Python 3.14, uv, FastAPI, LangGraph
│   ├── app/
│   │   ├── main.py          FastAPI app: lifespan, Origin check, routers, /api/metrics, OpenAPI
│   │   ├── config.py        Settings (env only), PRODUCT_NAME
│   │   ├── runtime.py       Runtime: shared pools/clients for api, worker, mcp
│   │   ├── deps.py          FastAPI dependencies: session, current user, admin, rate limit, audit
│   │   ├── db.py            SQLAlchemy async engine + session factory
│   │   ├── models/          SQLAlchemy models (all tables of the app DB)
│   │   ├── schemas/         Pydantic request/response models, ErrorCode
│   │   ├── errors.py        ApiError + handler (uniform {code, message} bodies)
│   │   ├── auth/            login, demo personas, JWT cookie, argon2
│   │   ├── api/             HTTP routers (chat, runs, catalog, conversations, feedback, verified, ...)
│   │   ├── graph/           The agent: state, nodes, routing, runner, run manager, persistence
│   │   ├── retrieval/       Schema linking, value index, few-shot, embeddings
│   │   ├── semantic/        Metrics YAML model + loader
│   │   ├── sql/             Guard, executors, introspection, RLS scope signing, dialects
│   │   ├── llm/             Provider-neutral client, Anthropic/OpenAI-compatible/fake, metering, pricing, prompts
│   │   ├── workers/         arq worker (catalog sync)
│   │   ├── mcp_server.py    MCP server (separate process)
│   │   ├── budget.py        Daily spend cap (Redis)
│   │   ├── ratelimit.py     Token bucket (Redis Lua)
│   │   ├── telemetry.py     OpenTelemetry setup
│   │   └── metrics.py       Prometheus counters/histograms
│   ├── alembic/versions/    0001_initial, 0002_semantic_layers, 0003_run_context
│   ├── semantic/metrics.yaml  Seed semantic layer for Olist (metrics, synonyms, data notes)
│   ├── scripts/             load_olist, seed_users, sync_catalog, export_openapi, sql/*.sql
│   ├── evals/               BIRD runner, golden set, safety red team, report generator
│   └── tests/               unit, integration, graph, api, evals
├── frontend/                Next.js 16, React 19, Tailwind 4, shadcn
│   ├── app/(site)/          Static marketing: / and /evals
│   ├── app/(product)/       /login, /app, /app/catalog, /app/verified, /runs/[id]
│   ├── components/          chat/, inspector/, layout/, catalog/, verified/, marketing/, ui/ (shadcn)
│   ├── lib/                 API client, SSE parser, answer reducer, formatting, charts, hooks
│   ├── proxy.ts             Next 16 "proxy" (was middleware): auth gate + CSP nonce
│   └── tests/               unit (Vitest), e2e (Playwright + axe)
├── infra/                   caddy/Caddyfile, otel/collector.yaml, deploy/ (backup script + systemd)
├── docker-compose.yml       Local stack
├── docker-compose.prod.yml  Production overrides (only Caddy exposed, GHCR images)
├── .github/workflows/       ci.yml, deploy.yml
├── data/                    olist/ CSVs and bird/ (both git-ignored)
└── Makefile                 Everything you run day to day
```

---

## 3. Running it

```bash
make env       # writes .env from .env.example, replacing every "change-me" with a random secret
make up        # builds and starts the stack, waits until healthy
make seed      # loads Olist, creates analyst_ro + RLS, seeds users, syncs the catalog
open http://localhost:8080
```

| Port | Service |
|---|---|
| 8080 | Caddy (everything goes through here) |
| 5433 | app-db (Postgres 16 + pgvector) |
| 5434 | target-db (Postgres 16, Olist) |
| 6380 | Redis |
| 16686 | Jaeger UI |

**Without an API key:** set `FAKE_LLM=true` in `.env`. A deterministic stand-in model
(`backend/app/graph/fake.py`) writes canned but real, runnable SQL, chosen by keywords in the
question ("revenue", "month", "late", "payment", "seller"; "best" triggers a clarification;
"drop" triggers the guard; "missing_column" triggers a repair; "[slow]" makes it sleep 4 s so
you can test Stop). Set `ANTHROPIC_API_KEY` and `FAKE_LLM=false` for real answers.

**Embeddings:** `EMBEDDING_PROVIDER=fastembed` downloads a small ONNX model from Hugging Face on
first use. On a network that blocks huggingface.co, use `fake` (deterministic hashing; retrieval
quality drops but everything runs) or `openai_compat`.

Day-to-day targets: `make test`, `make test-unit`, `make lint`, `make fmt`, `make typecheck`,
`make check` (all three), `make types` (regenerate frontend API types), `make e2e`,
`make eval-smoke`, `make smoke` (scripted curl session).

---

## 4. A question, end to end

Follow this path once in the code and the rest makes sense.

### 4.1 Browser

`frontend/lib/hooks/useChatStream.ts` `POST`s `/api/chat` with `fetch` (EventSource can't send a
POST body) and reads the body with `frontend/lib/sse.ts:readSse`, a small WHATWG-compliant SSE
parser. Each event is folded into an `Answer` object by the pure reducer
`frontend/lib/answer.ts:reduce`. `AnswerCard` renders that object.

### 4.2 API admission (`backend/app/api/chat.py:chat`)

1. `current_user` (in `deps.py`) decodes the `sa_session` JWT cookie.
2. `_admit` takes one token from the per-user bucket `chat:{user_id}` and checks the daily budget.
3. It finds or creates the conversation. A new conversation uses the first connection.
4. It loads the last 4 successful turns as `history` (question, SQL, summary) for follow-ups.
5. It inserts a `query_runs` row with status `running`.
6. It builds the initial `AgentState` and an `AgentContext` (`graph/context.py:agent_context`)
   and calls `RunManager.start`.
7. It returns `EventSourceResponse(drain(queue), ping=15)`. The 15 s ping is the heartbeat.

### 4.3 Run manager (`backend/app/graph/manager.py`)

The run is an `asyncio.Task`, **not** tied to the HTTP request. The task pushes events into an
`asyncio.Queue`; the SSE response only drains that queue. So:

- If the browser disconnects, the run keeps going and still gets saved.
- The client recovers by polling `GET /api/runs/{id}` (`useChatStream.ts:recover`).
- **Stop** = `POST /api/runs/{id}/cancel`. It sets a Redis flag `cancel:{run_id}`, which every node
  checks before starting (so it works across API replicas), and cancels the local task.

When the graph finishes, `_execute` calls `persist.py:save_outcome`, deletes the LangGraph
checkpoint (unless the run is waiting for a clarification), and emits the final `done` event.

### 4.4 Runner (`backend/app/graph/runner.py:stream_run`)

This calls `graph.astream(..., stream_mode=["custom", "updates"])`:

- `custom` chunks are the event models that nodes emit via `runtime.stream_writer(...)`. They are
  forwarded as they come.
- `updates` chunks are only inspected for `__interrupt__`, which becomes a `ClarifyEvent`.

After the stream ends, it reads the final state snapshot and computes the status
(`final_status`). Exceptions are mapped to user-facing errors: `RunCancelled` gives
`cancelled`, `BudgetExceeded` gives `BUDGET_EXCEEDED`, `LLMError` gives `UPSTREAM_LLM`, and
anything else gives `INTERNAL`. It is wrapped in an OTel span `agent.run`; the trace id is saved
on the run and shown in the Inspector.

### 4.5 Clarification round-trip

```
POST /api/chat
  └─ clarify node decides the question is ambiguous
  └─ ask node calls interrupt({question, options})
       ├─ SSE: event "clarify"
       ├─ checkpoint saved in app-db (AsyncPostgresSaver)
       └─ run status = clarifying, stream ends with "done"

POST /api/runs/{id}/clarify  {answer}
  └─ RunManager.start(..., Command(resume=answer))
       └─ LangGraph reloads the checkpoint, re-runs `ask`, interrupt() now returns the answer
       └─ continues with generate, guard, execute, ...
```

**Why `clarify` and `ask` are separate nodes:** on resume, LangGraph re-runs the whole node that
called `interrupt()`. If the LLM call were in the same node it would run again: it would cost
money and could produce a different question. `ask` has no LLM call, so re-running it is free.

Latency, tokens and cost **accumulate** across the two requests (`save_outcome` adds to the
existing values).

### 4.6 SSE event contract (`backend/app/graph/events.py`)

| Event | When | Payload |
|---|---|---|
| `run` | first | run_id, conversation_id |
| `stage` | start and end of every node | stage, status, ms |
| `clarify` | interrupt | question, options |
| `sql` | each candidate and each repair | sql, attempt, candidate_index |
| `rows` | after select | columns (with semantic_type), first 200 rows, row_count, truncated |
| `chart` | compose | ChartSpec |
| `summary` | compose | text, caveats |
| `error` | failure | code, message, retryable |
| `done` | last | status, latency_ms, cost_usd, trace_id |

These Pydantic models are added to the OpenAPI schema (`main.py:_openapi_with_events`), so
`make types` generates TypeScript types for them too. **If you change an event, run
`make types`**; CI fails on drift.

---

## 5. The agent graph (`backend/app/graph/`)

### 5.1 Topology (`build.py`)

```
START → retrieve → clarify ─┬─(ambiguous)→ ask ─┐
                            └───────────────────┴→ generate → guard
guard  ─┬─ any pending_exec → execute
        ├─ any needs_repair → repair
        └─ otherwise        → select
execute ─┬─ any needs_repair → repair
         └─ otherwise        → select
repair → guard
select ─┬─ chosen → compose → END
        └─ none   → END   (state.error explains why)
```

### 5.2 State vs context (`state.py`)

- **`AgentState`** is a `TypedDict` of plain JSON. LangGraph checkpoints it, so no live objects
  and no enums (error codes are stored as `.value` strings; LangGraph warns when deserialising
  enums).
- **`AgentContext`** holds live dependencies: executor, DB session factory, Redis, the metered LLM,
  the embedder, dialect, default schema and `AgentConfig`. It is passed as LangGraph **runtime
  context** (`graph.astream(..., context=ctx)`) and is never checkpointed. Nodes receive it as the
  keyword-only `runtime` argument: `runtime.context`.
- **`AgentConfig`** holds the feature switches (schema linking, value retrieval, few-shot,
  clarify, number of candidates, max repairs, row limit, timeout, models). The defaults are the
  product; eval ablations turn pieces off.

### 5.3 The `@stage` decorator (`nodes/common.py`)

Every node except `ask` is wrapped by `@stage(name)`, which:

1. raises `RunCancelled` if `cancel:{run_id}` exists in Redis,
2. emits `stage start`,
3. opens an OTel span `node {name}`,
4. emits `stage end` with milliseconds,
5. adds the time to `state.timings[name]` (summed across repair rounds).

`question_block(state)` builds the **per-run, uncached** part of every prompt (history,
question, BIRD hint, clarification answer). `data_block(tag, body)` wraps untrusted content in
`<tag>…</tag>` delimiters.

### 5.4 Nodes

**`retrieve`** (`nodes/retrieve.py`)
- Retrieval text = previous question + current question (+ hint). This lets follow-ups like
  "and by month?" find the right tables.
- It embeds the text once, then runs `lookup_values`, `link_schema`, `similar_verified` and
  `get_layer` (section 6).
- It builds one **`schema_block`**: `<schema>` DDL, `<metrics>`, `<dimensions>`, `<notes>`,
  `<values>`, `<examples>`. This block is the cacheable prompt prefix shared by all LLM calls in
  the run.
- `allowed_tables` = **every** catalogued table, not just the linked ones. The guard allows any
  real table; linking only decides what the model sees.

**`clarify`** (`nodes/clarify.py`)
- The fast model returns `ClarificationOut {is_ambiguous, question, options}`.
- A clarification only counts with a non-empty question and at least 2 options (capped at 4).
- It is skipped when `config.clarify` is false (MCP, benchmarks) or a clarification already
  exists.

**`generate`** (`nodes/generate.py`)
- It makes `n_candidates` parallel calls with the SQL model. Each call has a different instruction
  from `VARIANTS` (direct query; plan joins with CTEs; start from the metric definitions).
- **Why prompt variants and not temperature:** Sonnet 5.5 rejects a non-default temperature.
- The instruction goes **after** the cached prefix, so all three calls hit the same cache entry.
- If some candidates fail, the run continues with the rest. If all fail, it raises `LLMError`. A
  `BudgetExceeded` is always re-raised.

**`guard`** (`nodes/guard.py`)
- It runs `sql/guard.py:guard` on every candidate with status `pending_guard`.
- A parse error or unknown table gives `needs_repair`. Anything unsafe gives `blocked`, which is
  never repaired.
- Optionally it calls `EXPLAIN` to get a cost; above `EXPLAIN_COST_LIMIT` the candidate is
  blocked.
- On success it stores `safe_sql` (the guard's re-rendered SQL) and sets `pending_exec`.

**`execute`** (`nodes/execute.py`)
- It runs `safe_sql` (never the model's text) for every `pending_exec` candidate, in parallel.
- Rows go to Redis (`run:{id}:cand:{i}`, 1 h TTL), **never** into the checkpoint or the app DB.
- It computes `result_hash` for voting: floats rounded, row order ignored unless the SQL has an
  `ORDER BY`.
- Zero rows gives `needs_repair` with kind `empty`. A timeout gives `failed` (repairing a slow
  query rarely helps). A DB error gives `needs_repair`.

**`repair`** (`nodes/repair.py`)
- For each `needs_repair` candidate, it calls the SQL model again with the full attempt history and
  advice specific to the error kind (for empty results: check literal values, date ranges and
  joins).
- The result goes back to the guard. `finalize_exhausted` (in `guard.py`) stops this after
  `max_repairs`. A candidate that is still empty at that point becomes `empty`, which counts as a
  real "no rows" answer.

**`select`** (`nodes/select.py`)
- `pick`: group the finished candidates by `result_hash`. The largest group wins. Ties go to fewer
  repairs, then shorter SQL.
- If no candidate finished, `failure` explains why: all blocked gives `BLOCKED_UNSAFE`, any
  timeout gives `QUERY_TIMEOUT`, otherwise `NO_ANSWER`.
- It assigns a display format to every column (`compose_rules.py:column_format`): metric
  definitions first, then the catalog's semantic type, then name and type heuristics.
- It saves the chosen rows to `run:{id}:rows` and emits `rows`.

**`compose`** (`nodes/compose.py`)
- **Chart choice is deterministic** (`compose_rules.py:choose_chart`):
  - one row with one number is a KPI;
  - a time column is a line;
  - up to 20 categories is a bar (or a pie when it shows a percent with at most 5 slices);
  - two numeric columns with 5 or more rows is a scatter;
  - anything else is a table.
- The fast model writes the title, summary and caveats from the SQL, the facts and a sample of 30
  rows.
- If that call fails, a plain fallback summary is used: the answer is already useful without the
  prose.
- It adds caveats automatically when the result was truncated, or when not all candidates agreed
  ("2 of 3 candidate queries agreed…").

### 5.5 Candidate status machine

```
pending_guard ──guard ok──▶ pending_exec ──rows──▶ ok
     ▲   │                       │
     │   ├─unsafe──▶ blocked     ├─0 rows / db error──▶ needs_repair
     │   └─parse/unknown table──▶ needs_repair         └─timeout──▶ failed
     │                               │
     └────────repair (LLM)───────────┘   out of repairs: empty (if last was empty) or failed
```

### 5.6 Run statuses

`running`, `clarifying`, `ok`, `repaired` (the chosen candidate needed repairs), `failed`,
`blocked`, `cancelled`. They are stored on `query_runs.status`.

---

## 6. Retrieval

### 6.1 Schema linking (`retrieval/schema_linker.py:link_schema`)

It collects up to five rankings of tables:

1. table embeddings by cosine distance to the question (pgvector HNSW),
2. column embeddings, mapped to their table,
3. Postgres full-text search on the table `search_tsv`,
4. full-text search on the column `search_tsv`,
5. tables hit by literal-value matches (`boost_tables`).

These are fused with **reciprocal rank fusion** (`rrf`, k = 60), and the top 6 tables are kept.
Then `join_paths` runs a BFS over the foreign-key graph and adds up to 3 bridge tables on the
shortest paths between the chosen tables, so the model always sees how to join them.
`render_ddl` writes compact `CREATE TABLE` text with descriptions, keys and 4 sample values per
column.

With `full=True` (ablation a) or a single-table database, it returns every table.

### 6.2 Value index (`retrieval/value_index.py`)

This maps words in the question to real stored values, for example "Campinas" to
`customers.customer_city = 'campinas'`.

- `candidate_terms` extracts quoted strings, capitalised phrases (Portuguese particles such as
  "de" and "da" are allowed inside them) and lowercase words of 4 or more letters.
- Each term is matched with `pg_trgm` (`value % term`, similarity of at least 0.45) against
  `catalog_values`.
- Matches go into `<values>` in the prompt and boost their tables in linking.
- Which columns get indexed is decided at introspection (`sql/introspect.py`): text columns with
  at most 5,000 distinct values and an average length of at most 30. Free-text column names
  (comment, message, title, ...) are excluded.

### 6.3 Few-shot (`retrieval/fewshot.py`)

These are approved verified queries (`verified_queries.approved_by IS NOT NULL`). The nearest 3
by embedding are used, and only when the cosine distance is at most 0.6, because a bad example
hurts more than none.

### 6.4 Semantic layer (`semantic/`)

`backend/semantic/metrics.yaml` defines:

- **metrics** (name, SQL expression, semantic type, synonyms), for example
  `revenue = SUM(order_items.price)`;
- **dimensions** (synonym to column);
- **notes**: facts about the data. The most important note says the data effectively ends in
  2018-08, so "last quarter" means 2018 Q2.

The YAML seeds the `semantic_layers` row **once**, and only for the connection named `olist`.
After that, the database row is the source of truth: admins edit it through
`PUT /api/semantic/metrics`, which is validated before it is written. `semantic_metrics` mirrors
the metrics for querying (`loader.py:sync_metrics`).

### 6.5 Embeddings (`retrieval/embeddings.py`)

The `Embedder` protocol has three implementations:

- `FastEmbedder`: local ONNX `BAAI/bge-small-en-v1.5`, 384 dimensions, separate query and passage
  forms;
- `OpenAICompatEmbedder`;
- `FakeEmbedder`: deterministic hashing.

The vector dimension comes from `EMBEDDING_DIM` and is baked into the migration. Changing the
model to one with a different dimension needs a new migration and a re-sync.

---

## 7. LLM layer (`backend/app/llm/`)

- **`client.py`**: `LLMClient` protocol with **one call shape**:
  `structured(model, system, context, prompt, schema, max_tokens, effort) -> LLMResult[T]`.
  `system + context` is the cacheable prefix and must stay byte-stable between calls.
  `prompt` is the per-call part. It also defines `Usage` (tokens, cache tokens, cost) and
  `LLMError(retryable=...)`.
- **`anthropic_client.py`**:
  - uses `client.beta.messages.parse(output_format=Schema)` for structured output;
  - `output_config={"effort": ...}`;
  - one `cache_control` breakpoint after the prefix;
  - `fallbacks="default"` plus the server-side fallback beta for Sonnet and Opus.
  - Refusal and `max_tokens` stops become `LLMError`.
  - A missing key: the SDK raises `TypeError`, which is mapped to a clear `LLMError`.
- **`openai_compat_client.py`**: the same interface for any OpenAI-compatible endpoint
  (`LLM_PROVIDER=openai_compat`).
- **`fake_client.py`**: `FakeLLM` dispatches on the requested schema through a `@responder`
  registry. Responders live next to the code that needs them: `graph/fake.py` for the agent,
  `workers/catalog_sync.py` for table descriptions. It costs $0.
- **`metered.py`**: `MeteredLLM` wraps the client for **every agent call**. In order, it:
  1. enforces the per-run token cap (`RUN_TOKEN_CAP`, 200k);
  2. enforces the global daily budget;
  3. opens an OTel GenAI span (model, tokens, cache tokens, cost);
  4. adds up the run's `usage`;
  5. records the spend in Redis.

  A fresh `MeteredLLM` is created per run (`agent_context`).
- **`pricing.py`**: per-model prices, including cache reads and writes. Each call's cost is
  computed from the model that actually answered (`resp.model`), which can differ after a
  fallback.
- **`prompts/*.md`**: `sql_system` (with a `{dialect}` placeholder), `clarify`, `compose`,
  `describe_table`. All of them say that content inside delimiters is data, never instructions.

### Cost controls

| Control | Where | How |
|---|---|---|
| Daily budget | `budget.py` | Redis key `llm:spend:YYYY-MM-DD` in integer micro-dollars (`INCRBY` is exact). It is checked at admission and before every call. Check-then-spend can overshoot by one call per concurrent run. |
| Per-run cap | `metered.py` | Input + output tokens across the run. |
| Rate limit | `ratelimit.py` | Lua token bucket using the Redis server clock (`TIME`), atomic across processes. Keys: `rl:chat:{user}`, `rl:login:{ip}`, `rl:demo:{ip}`, `rl:mcp`. |

---

## 8. SQL safety: three independent layers

The design rule: **each layer assumes the one before it is broken.**

### 8.1 Guard (`backend/app/sql/guard.py`)

`guard(sql, dialect, allowed_tables, default_schema, row_limit) -> GuardResult`. In order:

1. Parse with sqlglot in the target dialect. A failure gives `parse_error` (repairable).
2. Require exactly one statement whose root is a `SELECT`, `UNION`, `INTERSECT` or `EXCEPT`.
3. Walk **every node** and reject:
   - writes, DDL, `COPY`, `SET`, `GRANT`, `PRAGMA`, transactions, `ATTACH`, `ANALYZE`;
   - `exp.Command` (sqlglot's fallback for `EXPLAIN`, `VACUUM`, `DO`, `CALL`);
   - `SELECT … INTO`;
   - `FOR UPDATE` or `FOR SHARE`.
4. Functions:
   - reject schema-qualified calls (`pg_catalog.pg_sleep`);
   - reject the deny-list (`current_setting`, `set_config`, `version`, sequence functions);
   - reject the prefixes `pg_`, `lo_`, `dblink`, `txid_`, `inet_` and `*_to_xml` (which execute SQL
     text).
   - Every spelling is checked, because sqlglot normalises some names.
5. Tables:
   - CTE names are skipped;
   - cross-database references are rejected;
   - unqualified names are **qualified in the AST** with the default schema, so execution never
     depends on `search_path`;
   - each name must be in `allowed_tables`, otherwise `unknown_table` (repairable).
6. `LIMIT`: added if missing, lowered if above the row limit, replaced if it isn't a plain integer.
7. Return `root.sql(pretty=True, comments=False)`. **The SQL that runs is re-rendered from the
   validated tree.** A difference between the sqlglot parser and the Postgres parser can't smuggle
   in anything the guard didn't see, and comments are stripped.

Tests: `backend/tests/unit/test_guard.py`. Add a case there for any new rule.

### 8.2 Executor (`backend/app/sql/executor.py`)

`PostgresExecutor.execute`:

1. acquires a connection from the `analyst_ro` pool;
2. opens `transaction(readonly=True)`;
3. runs `SET LOCAL statement_timeout`;
4. calls `set_config('app.allowed_states', <signed token>, true)`, which is transaction-local;
5. prepares the statement;
6. reads through a **cursor**, stopping at `row_limit + 1` rows. That extra row is how
   `truncated` is detected without loading the whole result.

Values are converted to JSON-safe types by `jsonable` (Decimal to float: the values are for
display, not accounting). Postgres `detail` and `hint` are kept in error messages because repair
depends on the exact text.

`SqliteExecutor` (BIRD) opens the file with `mode=ro`, uses `asyncio.timeout` plus
`db.interrupt()`, and has no RLS.

### 8.3 Database role and row-level security (`backend/scripts/sql/olist_security.sql`)

**Role `analyst_ro`:**
- `LOGIN`, no superuser and no `BYPASSRLS`;
- `SELECT` on schema `olist` only;
- defaults to read-only transactions;
- 30 s `statement_timeout` and 60 s idle-in-transaction timeout, as backstops above the app's
  own limits.

**RLS policies:**
- `customers` is filtered by `customer_state`.
- `orders`, `order_items`, `order_payments` and `order_reviews` each have a policy of the form
  `EXISTS (parent row visible)`. They chain to `customers`, so no join can reach a hidden
  customer's data.

**The signed scope (the important part):**

```
app.allowed_states = "SP.<hex hmac_sha256(key, 'SP')>"     or     "*.<hmac>"  (all states)
```

- Python signs it: `backend/app/sql/scope.py:scope_token`, with the key `RLS_SIGNING_SECRET`.
- Postgres verifies it. `rls.allowed_states()` is a `SECURITY DEFINER` function in a private
  schema `rls` that `analyst_ro` can't `USAGE`. It reads the key from `rls.config`, recomputes the
  HMAC with pgcrypto, and returns `'{}'` (no rows at all) if the setting is missing or the
  signature is wrong. This **fails closed**.
- Why: a plain setting could be widened by any SQL that got past the guard
  (`set_config('app.allowed_states','*',true)`). With the signature, such SQL gains nothing,
  because it doesn't know the key.
- The `(SELECT rls.allowed_states())` wrapper makes Postgres evaluate it once per query (an
  initplan), not once per row.
- Cost: the chained `EXISTS` policies make large aggregations about 8x slower (about 0.84 s instead
  of 0.11 s on a three-table join over all orders). The fix, if it ever matters, is a denormalised
  `customer_state` column on the child tables.

`load_olist.py` applies this file as the schema owner (`TARGET_ADMIN_DATABASE_URL`). The
long-running services **never** receive the owner's credentials; only the `seed` container has
them.

Tests: `backend/tests/integration/test_target_security.py` connects as the raw role, with no
guard in between, and proves writes fail, scopes hold and forged tokens return nothing.

---

## 9. What lives where (storage)

### App DB (`backend/app/models/__init__.py`, migrations in `backend/alembic/versions/`)

| Table | Purpose |
|---|---|
| `users` | email, display name, role (`admin`, `analyst`, `regional`), `allowed_states` (null = all), `is_demo`, argon2 hash |
| `connections` | target databases (`olist`, plus BIRD fold connections during evals) |
| `catalog_tables`, `catalog_columns` | introspected schema, descriptions plus `description_source` (`human` or `llm`), `semantic_type`, sample values, embeddings, generated `tsvector` |
| `catalog_values` | literal values for the trigram value index |
| `semantic_layers` | the YAML per connection (source of truth after seeding) |
| `semantic_metrics` | metrics mirrored from the YAML |
| `conversations` | per user |
| `query_runs` | question, status, candidates (without rows), chosen SQL, chart spec, summary, caveats, timings, tokens, cost, trace id, `context` (the retrieval context used, plus column formats) |
| `feedback` | thumbs up or down plus comment, one per (run, user) |
| `verified_queries` | proposed or approved question-and-SQL pairs, with an embedding |
| `audit_log` | logins, syncs, approvals, MCP calls |
| LangGraph tables | created by `AsyncPostgresSaver.setup()`: checkpoints for paused clarifications |

### Redis

| Key | TTL | Contents |
|---|---|---|
| `run:{id}:cand:{i}` | 1 h | rows of each candidate |
| `run:{id}:rows` | 1 h | the chosen result (all rows plus column formats) |
| `cancel:{id}` | 1 h | cancel flag |
| `llm:spend:{date}` | 2 days | micro-dollars spent |
| `rl:*` | auto | rate-limit buckets |
| `catalog-sync:{conn}` | 1 h | the current sync job id |
| arq keys | — | job queue |

**Rows are never stored in Postgres.** When the cache has expired, `GET /api/runs/{id}/rows`
(`api/runs.py:_rows`) **re-runs** the saved SQL. It is guarded again, and it runs with the
**viewer's** RLS scope, not the original author's. An admin viewing a regional user's run sees
admin-scoped data, and nobody can widen their scope by opening someone else's run.

---

## 10. Catalog sync (`backend/app/workers/catalog_sync.py`)

The sync is triggered by `make seed` (`scripts/sync_catalog.py`) or by an admin
(`POST /api/connections/{id}/sync`). That endpoint enqueues an arq job; a second click while a
sync is running joins the existing job.

Steps:

1. **Introspect** (`sql/introspect.py`): tables, columns, PKs and FKs, approximate row counts,
   5 sample values per column, and distinct values for the value index. It runs as `analyst_ro`
   with the all-states scope.
2. **Upsert** the catalog: stale tables and columns are deleted, and admin-set `semantic_type`
   and human descriptions are preserved.
3. **Rebuild** `catalog_values`.
4. **Draft descriptions** with the fast model (4 tables in parallel), only where none exists.
   Human descriptions are never overwritten, so a re-sync is cheap.
5. **Embed** every table and column. This is recomputed every time because it is local and free.
6. **Sync the metrics** from the semantic layer.

The worker entry point is `python -m app.workers`. `workers/__main__.py` creates an event loop
first because arq 0.25 calls `get_event_loop()`, which fails on Python 3.14.

---

## 11. Auth (`backend/app/auth/`)

- The session is a JWT (HS256, 7 days) in an `HttpOnly`, `SameSite=Lax` cookie `sa_session`.
  It is `Secure` unless `COOKIE_SECURE=false`, which only the e2e stack sets, because WebKit drops
  Secure cookies on `http://localhost`.
- **Demo personas** (`personas.py`), entered with `POST /api/auth/demo/{admin|analyst|regional}`.
  They have no password and the endpoint is rate-limited per IP:

  | Persona | Role | Scope |
  |---|---|---|
  | Ana Admin | admin | all states |
  | Bruno Analyst | analyst | all states |
  | Carla Regional (SP) | regional | `SP` only |

- Password login uses argon2, with the same code path whether or not the email exists.
- **CSRF:** `SameSite=Lax`, plus `main.py:same_origin_only`, which rejects writes whose `Origin`
  host differs from `Host`.
- Other users' runs return 404, not 403, so run ids can't be probed.

---

## 12. HTTP API (all under `/api`)

| Method & path | Who | What |
|---|---|---|
| `GET /health`, `GET /ready` | public | liveness; readiness (DBs and Redis) |
| `POST /auth/login`, `POST /auth/demo/{persona}`, `POST /auth/logout`, `GET /auth/me`, `GET /auth/personas` | — | auth |
| `GET /connections`, `POST /connections/{id}/sync`, `GET /jobs/{id}` | admin for sync and jobs | catalog sync |
| `GET /catalog/tables`, `GET /catalog/tables/{id}` | user | catalog browsing |
| `PATCH /catalog/tables/{id}`, `PATCH /catalog/columns/{id}` | admin | edit description or semantic type (re-embeds) |
| `GET /semantic/metrics`, `PUT /semantic/metrics` | user / admin | semantic layer YAML |
| `GET/POST/PATCH/DELETE /conversations[/{id}]` | owner | conversation list and history |
| `POST /chat` | user | **SSE**: ask a question |
| `POST /runs/{id}/clarify` | owner | **SSE**: answer a clarification |
| `GET /runs/{id}`, `GET /runs/{id}/rows`, `GET /runs/{id}/export.csv` | owner or admin | run, paged rows, CSV (formula-injection safe) |
| `POST /runs/{id}/cancel` | owner or admin | Stop |
| `POST /feedback` | owner | rating |
| `GET /verified`, `POST /verified` | user | list, or propose from a successful run |
| `POST /verified/{id}/approve`, `DELETE /verified/{id}` | admin | approve or reject |
| `/metrics` | internal only | Prometheus (Caddy returns 404 for it) |

Interactive docs are at `/api/docs`. Errors are always `{code, message, retry_after_s?}` with an
`ErrorCode` (`schemas/__init__.py`); the frontend switches on `code`.

---

## 13. MCP server (`backend/app/mcp_server.py`)

This is a separate process (`python -m app.mcp_server`, port 8001) behind Caddy at `/mcp`. It uses
MCP SDK 2.x (`MCPServer`, which was called FastMCP in 1.x) with **stateless streamable HTTP** and
JSON responses.

**Tools** (all annotated `read_only_hint=True`):
- `list_tables` and `describe_table` read the catalog.
- `ask` runs the same agent with `clarify=False`, because no human can answer mid-call. It returns
  the SQL, up to 50 rows and the summary. It uses the RLS scope of `MCP_PERSONA`, is rate-limited
  (`rl:mcp`), and writes an audit-log entry for every call.

**Security:**
- The `BearerAuth` ASGI wrapper compares `Authorization: Bearer $MCP_API_TOKEN` in constant time.
- The server refuses to start without a token of 32 or more characters.
- It has DNS-rebinding protection with the `MCP_ALLOWED_HOSTS` list. **Add your domain there in
  production.**
- Checkpoints use `InMemorySaver`, since nothing is ever paused.

Tests: `backend/tests/integration/test_mcp.py` uses the SDK's in-memory `Client(mcp)`. Each test
opens its own client, because sharing one across fixtures breaks anyio cancel scopes.

---

## 14. Frontend (`frontend/`)

### 14.1 Routing and layouts

There are two **root layouts**:

| Group | Routes | Rendering | CSP |
|---|---|---|---|
| `app/(site)` | `/`, `/evals` | static (prerendered) | static policy from `next.config.ts` (allows inline scripts: Next injects them and prerendered pages can't carry a nonce; these pages show no user or model content) |
| `app/(product)` | `/login`, `/app`, `/app/catalog`, `/app/verified`, `/runs/[id]` | dynamic | per-request **nonce** + `'strict-dynamic'`, set in `proxy.ts` |

- `proxy.ts` is Next 16's replacement for `middleware.ts`. It redirects `/app/*` to
  `/login?next=…` when there is no session cookie (a cheap gate; the API validates for real), and
  sets the nonce CSP. Policies are built in `lib/csp.ts`.
- `cacheComponents` is **off**, because Partial Prerendering conflicts with per-request nonces.
- `global-not-found.tsx` (experimental `globalNotFound`) exists because there is no single root
  layout.
- `robots.ts` and `sitemap.ts` sit at the app root.
- `next.config.ts` rewrites `/api/*` to `API_PROXY_TARGET` when running `next dev` without Caddy,
  and sets the security headers.

### 14.2 Data layer

- `lib/api/openapi.json` and `lib/api/schema.d.ts` are **generated** (`make types`). Never edit
  them by hand.
- `lib/api/client.ts`:
  - a typed `openapi-fetch` client;
  - a middleware that turns a 401 into a redirect to login, and `RATE_LIMITED` or
    `BUDGET_EXCEEDED` into global banners (`lib/banners.ts`);
  - `unwrap` throws a typed `ApiError`.
- `lib/api/queries.ts`: TanStack Query hooks and query keys.
- `lib/safe-next.ts`: only same-site paths are accepted for `?next=` (prevents open redirects).

### 14.3 Streaming answers

- `lib/sse.ts`: the parser (handles `event:`/`data:` fields, multi-line data, comments, CR, LF and
  CRLF, and events split across chunks). Unit-tested.
- `lib/answer.ts`:
  - `reduce(answer, event)` is a pure fold of SSE events into an `Answer`;
  - `fromRun(run, rows)` rebuilds the same `Answer` from a saved run.
  - Live answers, reloaded conversations and recovered runs therefore all render through **one
    component** (`AnswerCard`).
- `lib/hooks/useChatStream.ts` handles sending, resuming after a clarification, Stop (aborting the
  fetch and calling `/cancel`) and recovery polling every 2 s after a dropped connection.
  Screen-reader updates go through `lib/announce.ts`, a single polite live region.

### 14.4 Main components

| Component | Role |
|---|---|
| `chat/ChatWorkspace.tsx` | three-pane workspace: conversations, answers, inspector (sheets on mobile) |
| `chat/StageStepper.tsx` | **the pipeline trail**, the design's signature element: eight steps with live timers and repair rounds; phones show the current step and a segmented bar |
| `chat/AnswerCard.tsx` | composes the trail, SQL, table, chart, summary and actions |
| `chat/SqlBlock.tsx` | Shiki-highlighted SQL rendered as **React text nodes**. Model output is never `dangerouslySetInnerHTML` |
| `chat/ResultTable.tsx` | TanStack Table v9 + TanStack Virtual, sortable, sticky first column, CSV export |
| `chat/ChartView.tsx` / `ChartCanvas.tsx` | Recharts loaded lazily; the colours are read from CSS tokens because SVG attributes can't resolve CSS variables |
| `chat/ClarifyCard.tsx` | clarification options plus a free-text answer |
| `chat/Composer.tsx`, `EmptyState.tsx`, `AnswerActions.tsx` | input, suggested questions; thumbs up/down, propose as verified, open in Inspector, retry |
| `inspector/Inspector.tsx` | per-stage timing, candidates and attempts, tokens, cost, trace id, retrieved context |
| `catalog/*` | tables and columns with inline description editing (admin) and the metrics YAML editor (CodeMirror, lazy) |
| `verified/VerifiedView.tsx` | proposal and approval queue |
| `layout/*` | app shell, conversation list, command palette (cmdk, ⌘K), theme toggle, notices, skip link |
| `marketing/*` | landing hero (a static sample answer), header, footer |

### 14.5 Charts and formatting

- `lib/chart-data.ts:prepare` turns a `ChartSpec` and rows into Recharts data. More than 5 series
  falls back to a table rather than cycling colours.
- `describe` writes a text summary of the chart for screen readers.
- `lib/format.ts:formatValue` handles `currency_brl` (pt-BR R$), `percent`, `count`, `number` and
  `date`, with a compact mode for axes.
- Charts set `accessibilityLayer={false}`. Recharts' own layer puts focusable elements inside
  `aria-hidden` content, which axe flags; the table is the accessible alternative.

### 14.6 Design tokens

- Tokens are in `styles/tokens.css` (light and dark), with a petrol-teal accent (`#0e7c86` light,
  `#3fb8c2` dark).
- The chart palette was validated for colour-blind separation.
- Fonts are Geist, self-hosted through the `geist` package.
- Touch targets are 44 px under `pointer: coarse`.

---

## 15. Evaluation harness (`backend/evals/`)

### 15.1 Shared plumbing (`common.py`)

- **Ablations** (`ablations.yaml`): five configurations, each adding one component.

  | Id | Adds |
  |---|---|
  | a | full schema, zero-shot |
  | b | schema linking |
  | c | value retrieval |
  | d | few-shot |
  | e | 3 candidates and repair (the full system) |

  Clarification is always off in benchmarks.
- **`RecordingLLM`**:
  - in `record` mode it calls the real model and appends every response to a JSONL file, keyed by
    a hash of (model, system, context, prompt, schema);
  - in `replay` mode it answers only from that file, so CI never calls a paid API.

### 15.2 Stand-in models

- **`OracleLLM`** (`oracle.py`) answers with the gold SQL; it can break a query first to test
  repair. It proves the whole pipeline at zero cost: with the oracle, execution accuracy must be
  exactly 100% except for the broken questions.
- **`HostileLLM`** (`hostile.py`) is a compromised model that always writes the attack each safety
  case asks for. If every case still passes, the protection comes from the guard, the role and RLS,
  not from the model behaving well.

### 15.3 BIRD Mini-Dev (`bird_minidev/runner.py`)

```bash
cd backend && uv run python -m evals.bird_minidev.runner \
  --data ../data/bird/extracted/minidev/MINIDEV --ablations e_full --evidence with \
  --limit 20 --estimate-only
```

- Each SQLite database is introspected and registered as a connection.
  `database_description/*.csv` become the human column descriptions, and catalog sync runs with
  `draft_descriptions=False`.
- **Few-shot without leakage:** BIRD's training databases differ from the test ones, so there is
  no natural example pool. Each database instead gets **two fold connections**. Questions with an
  even id use fold 0, whose verified examples are the gold SQL of the odd-id questions, and vice
  versa. No question ever sees its own gold SQL.
- **Cost:** a cost estimate prints first, and runs above $5 need `--yes`.
- **Output:** results are written per (ablation × evidence) as resumable JSONL under
  `evals/results/bird/<run-id>/`.
- **Scoring** uses BIRD's **official scripts, vendored unmodified** in
  `bird_minidev/official_eval/` (the upstream commit is recorded in `SOURCE.md`). Our own
  per-question check (`set_match`) is reported next to it as a cross-check.
- Test: `backend/tests/evals/test_bird_harness.py` builds a synthetic database in the official
  layout and asserts exact scores with the oracle.

### 15.4 Golden set (`golden/`)

- 60 Olist business questions with gold SQL that was checked on the real data
  (`build_golden.py` generates `golden_set.jsonl`).
- **Execution match** (`runner.py:contains_result`): every gold column must map to a distinct
  predicted column, and the projected rows must be equal as multisets. Extra columns, different
  column names and different row order are all fine.
- **Clarification accuracy:** the agent should ask exactly when the case expects it. When it asks,
  the run is resumed with the case's chosen answer.

### 15.5 Safety red team (`safety/`)

- 30 adversarial cases in `adversarial.jsonl` run through the full agent.
- `CapturingExecutor` records every statement that reaches the database.
- A case passes when:
  - only single SELECTs executed;
  - no result exceeded the row cap;
  - for the SP persona, every execution used the SP scope and no returned state code lies outside
    SP.
- Two injections are planted temporarily (`planted()`): one in a catalog column description and
  one in a real review row inserted as the schema owner. Both are removed afterwards.

### 15.6 Report (`report.py`)

This writes `EVALS.md` and `frontend/lib/evals/summary.json`, which is rendered on `/evals`. **It
only reports runs that actually exist in `evals/results/`; missing runs are shown as "not run".**
Never edit numbers by hand.

---

## 16. Tests

| Folder | What | Needs |
|---|---|---|
| `backend/tests/unit/` | guard, scope signing, compose rules, small units | nothing |
| `backend/tests/integration/` | executor, RLS as the raw role, migrations, catalog sync, rate limiter, MCP | Docker (testcontainers starts Postgres and Redis) |
| `backend/tests/graph/test_agent.py` | the full graph with FakeLLM: clarification, repair, guard block, voting, cancel | Docker |
| `backend/tests/api/` | HTTP and SSE endpoints (`sse.py` is a test SSE reader) | Docker |
| `backend/tests/evals/` | harness logic, BIRD with the oracle, safety with the hostile model, replay smoke (skipped until recordings exist) | Docker |
| `frontend/tests/unit/` | SSE parser, reducer, formatting, chart data, safe-next | nothing |
| `frontend/tests/e2e/` | Playwright on iPhone 13, Pixel 7, iPad and desktop 1440, with axe on every page | `make e2e-stack` |

- `backend/tests/fixtures.py` builds a small fixture dataset (customers in SP, RJ and MG, with
  orders, items, payments and reviews). It applies the **real** `olist_schema.sql` and
  `olist_security.sql`, runs the migrations, seeds users and syncs the catalog. Integration tests
  therefore exercise the same RLS as production.
- Mark Docker-dependent tests with `@pytest.mark.integration`; `make test-unit` skips them.
- CI requires at least 85% coverage on `app/sql`, `app/graph` and `app/retrieval`.

---

## 17. Infrastructure

- **`docker-compose.yml`:**
  - services caddy, web, api, worker, mcp, app-db, target-db, redis, otel-collector, jaeger, plus
    `seed` (profile `tools`, the only service with the owner credentials and the data mount);
  - the backend services blank the owner credentials;
  - `FAKE_LLM`, `RATE_LIMIT_PER_MIN`, `DEMO_LOGIN_PER_MIN` and `COOKIE_SECURE` can be overridden
    from the shell (this is how `make e2e-stack` works).
- **`infra/caddy/Caddyfile`:**
  - SSE routes (`/api/chat`, `/api/runs/*/clarify`) have `flush_interval -1` (no buffering) and a
    10 min read timeout;
  - `/mcp*` goes to `mcp:8001`;
  - `/api/metrics` returns 404;
  - `/api/*` goes to the API;
  - everything else goes to the web service.
- **Observability:** structlog JSON logs. OTel spans (`agent.run`, then `node *`, then `chat <model>`
  with GenAI attributes) go to the collector and then to Jaeger (v2; its API is at `/api/v3`).
  Prometheus metrics are in `app/metrics.py`.
- **CI (`.github/workflows/ci.yml`):**
  - backend: lint, mypy and tests with coverage;
  - frontend: lint, typecheck, unit tests and build;
  - API-type drift;
  - Lighthouse;
  - compose validation;
  - image builds;
  - e2e (skipped without the `KAGGLE_USERNAME` and `KAGGLE_KEY` secrets, which download the data);
  - eval smoke.
- **Deploy (`.github/workflows/deploy.yml`, on a `v*` tag):** builds the images to GHCR and runs
  `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` over SSH. A nightly
  app-DB backup to S3 is in `infra/deploy/`. **Nothing is deployed yet.**

---

## 18. How to…

**Add a node to the agent**
1. Write `async def my_node(state, *, runtime)` in `graph/nodes/` and decorate it with
   `@stage("my_node")`.
2. Add the name to `Stage` in `state.py`, and wire it in `build.py`.
3. Add it to `STAGES` in `frontend/lib/answer.ts`.
4. Run `make types`.

The keyword-only `runtime` argument is required: LangGraph passes the context by that name.

**Add an SSE event**
1. Add a Pydantic model in `graph/events.py` and register it in `EVENT_NAMES`.
2. Emit it with `runtime.stream_writer(Model(...))`.
3. Run `make types`.
4. Handle it in `lib/answer.ts:reduce`, and in `fromRun` if it should survive a reload.

**Add a metric or a data note**
- Before the first seed: edit `backend/semantic/metrics.yaml`.
- After seeding: the database row wins, so edit it in the UI (Catalog → Metrics) or with
  `PUT /api/semantic/metrics`.

**Tighten the guard**
1. Add the node type or function to `sql/guard.py`.
2. Add a case to `tests/unit/test_guard.py`.
3. If it is an attack pattern, add it to `evals/safety/adversarial.jsonl` and `hostile.py`.

**Add an LLM provider**
1. Implement `LLMClient.structured` and return an `LLMResult` with priced `Usage`.
2. Choose it in `runtime.py:build_llm`.
3. Add prices to `llm/pricing.py`.

**Change the embedding model**
1. Update `EMBEDDING_MODEL` and `EMBEDDING_DIM`.
2. If the dimension changes, add a migration for the vector columns.
3. Re-sync the catalog and re-embed the verified queries.

**Point it at another database**
Today there is one target database by design. The seams are `Connection`, the `Executor`
protocol, `introspect_*` and `sync_catalog(..., metas=...)`; the BIRD runner shows how to use
them with SQLite.

---

## 19. Gotchas (learned the hard way)

**Python and LangGraph**
- **LangGraph re-runs an interrupted node on resume.** Keep `interrupt()` in a node without side
  effects (`ask`).
- **Don't put enums or objects in `AgentState`**: it is checkpointed. Store `ErrorCode.X.value`.
- **arq on Python 3.14** needs `workers/__main__.py` to create the event loop.
- **Postgres `contype` is the internal `"char"` type**: cast it with `::text` in introspection
  queries, or primary-key detection silently fails.

**Models and SDKs**
- **Sonnet 5.5 rejects `temperature`**: candidate diversity has to come from prompts.
- **The Anthropic SDK raises `TypeError`** (not an API error) when no key is configured.
- **MCP SDK 2.x:** `MCPServer`, not `FastMCP`; annotations are snake_case
  (`read_only_hint`).

**Frontend**
- **Next 16:** `proxy.ts`, not `middleware.ts`. Nonces and `cacheComponents` don't mix.
- **TanStack Table v9:** use `sortFn` (not `sortingFn`) and `tableFeatures`.
- **shadcn's `cn`** comes from shadcn's own package in this preset; don't "fix" the import.
- **Recharts:** set `accessibilityLayer={false}` on every chart, or axe fails.
- **WebKit and Secure cookies on http://localhost:** that is why `COOKIE_SECURE=false` exists, for
  e2e only.
- **zsh doesn't word-split variables**: `$E2E_ENV docker compose …` won't work. Use the Makefile
  targets.

**Data**
- **The Olist data ends in 2018-08** in practice. "Last month" means 2018-08, not today's date
  (this is in the metrics notes).

---

## 20. Status (what is and isn't done)

**Done and verified:**
- all seven build phases;
- 282 backend tests passed (1 skipped: the replay smoke test, until recordings exist);
- 37 frontend unit tests;
- 77 e2e tests on 4 devices, with axe clean;
- Lighthouse mobile 96 / 100 / 100 / 100;
- the compromised-model safety run: 30 of 30 passed;
- the BIRD harness verified with the oracle through the official scorer.

**Not done (needs a key, approval or input):**
- real-model answers;
- the BIRD runs (about $1.53 for the pilot, about $157 for the full run, estimated);
- the real-model golden and safety runs;
- recording the smoke replay;
- deployment;
- the real repo URL in `frontend/lib/site.ts`;
- the Kaggle secrets for CI e2e.
