# Static rework plan: SQL Analyst

Phase 0 audit for turning the SQL Analyst frontend into a static, demo-first site that runs on
Cloudflare Pages with zero running cost, while the full-stack mode (FastAPI, Postgres, Redis,
LangGraph, Caddy, Docker Compose) keeps working unchanged.

Accent: `blue`. Design system: Foundry, vendored into `frontend/design-system/`.

Sources read for this plan: `README.md`, `ARCHITECTURE.md`, `SECURITY.md`, `EVALS.md`,
`docs/DEVELOPER_NOTES.md`, every file under `frontend/app`, `frontend/components`,
`frontend/lib`, `frontend/tests`, `frontend/proxy.ts`, `frontend/next.config.ts`, the generated
API types (`frontend/lib/api/schema.d.ts`), `backend/app/graph/fake.py`,
`backend/semantic/metrics.yaml`, `backend/scripts/sql/olist_schema.sql`, and every committed
results file under `backend/evals/results/`.

---

## 1. Route inventory

| Route | Group | What it shows | API calls | Static export |
|---|---|---|---|---|
| `/` | `(site)` | Landing: hero with a static sample answer (`HeroAnswer`), how it works, safety, stack | none (reads `lib/evals/summary.json` at build time) | Yes. Replaced by the new landing page with the walkthrough. |
| `/evals` | `(site)` | Evaluation results page, fed by `lib/evals/summary.json` | none (build-time file read via `node:fs`) | Yes. Becomes a "Method" page (see section 4). |
| `/login` | `(product)` | Demo persona buttons plus email and password form (`LoginForm`) | `GET /api/auth/personas`, `POST /api/auth/demo/{persona}`, `POST /api/auth/login` | Static mode: renders `ClosedAuthCard`. No auth code in the static bundle. |
| `/signup` | new | Did not exist | none | New route, `ClosedAuthCard mode="signup"` in both modes (the product has no self sign-up; accounts are seeded). |
| `/app` | `(product)` | Chat workspace: conversation list, composer, streamed answers, inspector | conversations list, conversation detail, `POST /api/chat` (SSE), `POST /api/runs/{id}/clarify` (SSE), `POST /api/runs/{id}/cancel`, run, rows, feedback, verified propose, `GET /api/auth/me`, `GET /api/catalog/tables` | Yes once the data layer is behind an interface. `?c=` is read client side (`useSearchParams` inside `Suspense`). |
| `/app/catalog` | `(product)` | Tables, columns, descriptions (admin edit), metrics YAML (admin edit), re-sync | tables, table detail, patch table, patch column, metrics get/put, connections, sync, job status | Yes. `?t=` is client side. |
| `/app/verified` | `(product)` | Proposed and approved verified queries, approve and reject | verified list, approve, delete | Yes. |
| `/runs/[id]` | `(product)` | Read-only page for one run, with inspector | `GET /api/runs/{id}`, rows | Needs `generateStaticParams` over fixture run ids in static mode. |
| not found | root | `global-not-found.tsx` (experimental `globalNotFound`, two root layouts) | none | Export writes `404.html`; restyled. |
| `robots.txt`, `sitemap.xml` | root metadata routes | `app/robots.ts`, `app/sitemap.ts` | none | Static. Kept, with the static site's URLs. |
| `opengraph-image` | `(site)` | Generated with `next/og` | none | Replaced by a committed `public/og.png` made by a Playwright script. |

Server-only features that block a static export, and what happens to each:

| Feature | Where | Static mode |
|---|---|---|
| Proxy (middleware) | `proxy.ts`: auth redirect plus CSP nonce | Renamed `proxy.real.ts`; real mode adds `real.ts` to `pageExtensions`, static mode does not, so Next never sees it. |
| Mode-specific code | real client, login form, account menu; demo data | One import seam, `app-mode`, aliased by Turbopack to `lib/mode/real.tsx` or `lib/mode/static.tsx`, so each build contains only its own mode. |
| `next/headers` | `(product)/layout.tsx` reads `x-nonce` | Only called when not static. |
| `headers()` and `rewrites()` in `next.config.ts` | security headers, `/api` proxy | Returned only in real mode; static mode gets `public/_headers`. |
| `output: "standalone"` | `next.config.ts` | `output: "export"`, `trailingSlash: true`, `images.unoptimized` in static mode. |
| `node:fs` read in `lib/evals/load.ts` | `/`, `/evals` | Runs at build time only (server component), fine in export. |

## 2. API inventory

Every endpoint the frontend calls, with the generated types (`Schemas[...]` in
`lib/api/client.ts`). The `DataApi` interface (`lib/mode/types.ts`) has one method per row,
returning exactly these types, so the demo implementation is checked by the compiler against the
real contract.

| Method | Path | Request | Response | Used by |
|---|---|---|---|---|
| GET | `/api/auth/me` | none | `UserOut` | shell, empty state, catalog, verified |
| GET | `/api/auth/personas` | none | `PersonaOut[]` | login |
| POST | `/api/auth/demo/{persona}` | path | `UserOut` | login |
| POST | `/api/auth/login` | `LoginIn` | `UserOut` | login |
| POST | `/api/auth/logout` | none | 204 | user menu |
| GET | `/api/conversations` | `?q=` | `ConversationOut[]` | sidebar, command palette |
| GET | `/api/conversations/{id}` | path | `ConversationDetail` (with `RunOut[]`) | chat workspace |
| PATCH | `/api/conversations/{id}` | `{title}` | `ConversationOut` | rename |
| DELETE | `/api/conversations/{id}` | path | 204 | delete |
| POST | `/api/chat` | `ChatIn` | SSE stream | composer |
| POST | `/api/runs/{id}/clarify` | `ClarifyIn` | SSE stream | clarify card |
| POST | `/api/runs/{id}/cancel` | path | 204 | Stop |
| GET | `/api/runs/{id}` | path | `RunOut` | inspector, run page, recovery polling |
| GET | `/api/runs/{id}/rows` | `offset`, `limit` | `RowsPage` | answer card, load more |
| GET | `/api/runs/{id}/export.csv` | path | CSV file | Download CSV link |
| POST | `/api/feedback` | `FeedbackIn` | `FeedbackOut` | thumbs |
| GET | `/api/verified` | `?status=` | `VerifiedOut[]` | verified page |
| POST | `/api/verified` | `VerifiedIn` | `VerifiedOut` | propose as verified |
| POST | `/api/verified/{id}/approve` | path | `VerifiedOut` | approve |
| DELETE | `/api/verified/{id}` | path | 204 | reject |
| GET | `/api/catalog/tables` | none | `TableSummary[]` | catalog, empty state |
| GET | `/api/catalog/tables/{id}` | path | `TableDetail` | catalog detail |
| PATCH | `/api/catalog/tables/{id}` | `DescriptionPatch` | `TableDetail` | edit description |
| PATCH | `/api/catalog/columns/{id}` | `ColumnPatch` | column | edit description |
| GET | `/api/semantic/metrics` | none | `SemanticLayerOut` | metrics tab |
| PUT | `/api/semantic/metrics` | `SemanticLayerIn` | `SemanticLayerOut` | metrics editor |
| GET | `/api/connections` | none | `ConnectionOut[]` | re-sync |
| POST | `/api/connections/{id}/sync` | path | `JobOut` | re-sync |
| GET | `/api/jobs/{id}` | path | `JobOut` | re-sync polling |

## 3. Streams and mutations, and how each is simulated

All simulations live in `lib/demo/api.ts` (one in-memory store per page load) and
`lib/demo/runs.ts` (the scripted SSE schedule). Nothing persists; a reload resets. Every simulated action shows a
small "Simulated" note in its toast or inline.

| Action | Real behaviour | Static simulation |
|---|---|---|
| Ask (`POST /api/chat`, SSE) | `run`, `stage` start/end per node, `clarify`, `sql` per candidate and repair, `rows`, `chart`, `summary`, `error`, `done` | Async generator yielding the same `StreamEvent` shapes on a fixed schedule (about 2.5 to 4 s per answer). The question is matched to a scripted run by the same keyword rules as the backend's fake model (`backend/app/graph/fake.py`): revenue/state, month/trend, late, payment, category, `drop`/`delete` (guard blocks), `missing_column` (repair), `best` (clarification). Unmatched questions get an honest "not in the demo script" answer listing what to try. |
| Clarify (`POST /api/runs/{id}/clarify`, SSE) | Resumes the paused graph | Generator continues the scripted run with the chosen option. |
| Stop (`POST /api/runs/{id}/cancel`) | Aborts the stream and cancels server side | Aborts the generator through the same `AbortSignal`; the card shows "Stopped". |
| Reconnect (polling `GET /api/runs/{id}`) | Recovers dropped streams | Not reachable in static mode (no network); code path kept for real mode. |
| Feedback, propose verified | Writes rows | 600 to 900 ms delay, store update, toast "Saved (simulated)". A proposed query appears in Verified, Waiting for review. |
| Approve, reject | Admin writes | Delay, store update, list refresh. |
| Rename, delete conversation | Writes | Delay, store update. |
| Edit table or column description | Admin writes, re-embeds | Optimistic update kept, store updated. |
| Save metrics YAML | Validated write | YAML parsed client side (the existing `yaml` dependency); metric names validated; store updated. |
| Re-sync catalog | arq job, polled | Scripted job: queued, in progress, complete after about 2.5 s, with the fixture table and column counts. |
| Download CSV | Server CSV export | Built in the browser from the fixture rows as a `blob:` download (same-origin, no network). |
| Sign in, sign out, demo personas | Cookie session | Removed. The demo user is a fixed persona; a "View as" switch in the sidebar swaps between the analyst (all states) and the SP regional manager to show row-level security. No cookies, tokens or session code. |

## 4. Fixture plan

| Fixture | Source | Labelled |
|---|---|---|
| Result rows (revenue by state, revenue by state 2018 Q2, monthly orders, late delivery rate overall and by state, payment share, revenue by category, SP revenue by month 2018, review score by month 2018), table row counts, sample values | Computed offline from the public Olist CSVs by the committed script `frontend/scripts/olist_fixtures.py` into `frontend/fixtures/olist-aggregates.json`. Aggregates only, no rows or ids. The all-years revenue-by-state top 5 matches the "real query results" already shown on the old landing page. | "Olist data, computed offline" in the run's context note. These are real numbers for the real queries. |
| SQL text | The canned queries of the backend's deterministic test model (`backend/app/graph/fake.py`) and the golden set (`backend/evals/golden/golden_set.jsonl`), re-rendered the way the guard renders them | Real queries |
| Catalog tables and columns | `backend/scripts/sql/olist_schema.sql` (names, types, keys); descriptions written for the demo in the style of the catalog sync | Workspace bar says "simulated data" |
| Semantic layer | `backend/semantic/metrics.yaml`, copied as YAML | Real seed file |
| Personas | `backend/app/auth/personas.py` names (fictional demo people) | Fictional |
| Run metadata: stage timings, tokens, cost, trace ids, timestamps, conversation history, verified-query authors | Written for the demo | "Simulated" badge in the inspector and in the answer footer |

Fixtures are typed against the generated API types and validated by zod schemas in
`tests/unit/fixtures.test.ts` (fixtures live in `frontend/fixtures/`), so a malformed fixture fails CI. They load per route: the landing
page's walkthrough imports only the small scene data; the Explore workspace loads its fixtures on
first use.

### Results with provenance (what the site may show)

| Result | File | How it was produced | Shown? |
|---|---|---|---|
| Safety red team, compromised model, 30 / 30 passed, 0 non-SELECT, 0 rows out of scope | `backend/evals/results/safety/compromised-model/summary.json` | Real guard, read-only role and RLS on the real database, with a **scripted stand-in model** (`evals/hostile.py`) that always writes the attack | Yes, on the Method page only, labelled "Scripted attacker model, not a real LLM" with the file path |
| BIRD Mini-Dev | none | Not run (needs a paid key) | No. The Method page says it has not been run. |
| Golden Olist set | none | Not run | No |
| Safety, real model | none | Not run | No |
| "282 backend tests", "77 e2e", "Lighthouse 96/100/100/100" | README text, no committed results file | Test and audit runs, not product results | No (not product metrics, and no results file) |

## 5. Design audit against `docs/DESIGN.md`

| Area | Current problem | Fix |
|---|---|---|
| Colour | Petrol-teal accent (`#0e7c86`) through shadcn token names; `bg-accent` means a grey hover wash, colliding with Foundry's accent; separate warn and ok tokens | Foundry tokens only, `data-accent="blue"`; shadcn token classes rewritten to Foundry roles |
| Type | `font-semibold` headings, `text-3xl/4xl` page titles, Geist via `next/font` | Weight 500 headings, 20 px app page titles, display sizes from DESIGN 2.2, Geist self-hosted through `@fontsource-variable` |
| Radii | `rounded-2xl` chat bubbles and hero card, `rounded-xl` composer, pill stage chips | 6 to 8 px; chips become hairline badges; chat bubble becomes a quiet bordered question line |
| Shadows | `shadow-[var(--shadow-overlay)]` on hero card, raised composer | Borders first, `shadow-pop` only for menus and dialogs |
| Emoji and glyph marks | `Σ` glyph logo | Foundry `Logo` |
| Components | Default shadcn look (radix-nova preset) for buttons, badges, tabs, cards, inputs, dialogs, sheets, menus | Foundry `Button`, `Badge`, `Card`, `Tabs`, `Field`, `Table`, `EmptyState`, `Callout`, `Skeleton`, `PageHeader`, `StatusPill`; Radix overlays kept for behaviour but restyled to Foundry |
| Navigation | Marketing header with GitHub link to a repo URL that is a placeholder (`lib/site.ts`); no About me link anywhere | `SiteNav` and `SiteFooter` with About me; placeholder repo link removed until the real URL exists |
| States | Error states are a sentence with an underlined "Retry" link; empty states inconsistent | `EmptyState` and `Callout` with a real button; skeletons sized like the content |
| Mobile | Chat bubbles and stage trail OK; catalog detail dense; evals tables overflow | Phone layouts per route; tables scroll inside their own container |
| Copy | Mostly calm; "Try the live demo" points at a login that will not exist | Rewritten for the static demo |
| Charts | Teal palette | Chart 1 is the accent; the other series use a colour-blind-checked neutral-plus-hue palette |
| Theme | `next-themes` with a `.dark` class | Foundry `data-theme` with `themeInitScript` and `ThemeToggle`; system default |

## 6. Storyboard outline (detail in `docs/WALKTHROUGH.md`)

1. **Land in the workspace**: populated Explore workspace with history in the sidebar, the
   suggested questions and the catalog stats.
2. **Ask in plain English**: "Which 5 states had the highest revenue last quarter?" is typed.
   Retrieval picks `order_items`, `orders`, `customers`; the metric `revenue` and the note
   "last quarter means 2018 Q2" are shown.
3. **Clarify**: a second question, "Which are our best product categories?", pauses with
   "Best by which measure?" and the user picks Revenue.
4. **Three candidates and the guard**: three SQL candidates appear; the guard passes two and
   rewrites the LIMIT; one candidate fails with a real Postgres error and is repaired.
5. **Answer**: table, bar chart and a short explanation with caveats; latency and cost shown
   as simulated.
6. **Safeguard**: "Delete all canceled orders" is blocked by the guard before anything runs.
7. **Row-level security**: switched to the SP regional manager, the same revenue-by-state
   question returns only SP, with the signed scope shown in the inspector.
8. **Learn**: a thumbs-up and "Propose as verified" puts the query in the admin review queue,
   where it is approved.
