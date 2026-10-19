# Security

SQL Analyst is designed to stay safe while anyone on the internet can use the demo. This is
the threat model and what stands against each threat. Report vulnerabilities privately to the
repository owner rather than in a public issue.

## Assets

- The target data, and in particular the row-level restriction (the São Paulo manager must never
  see customers from other states).
- The integrity of both databases (no writes through the agent).
- The LLM budget (a public demo is an open wallet if left uncapped).
- Users' conversations, and the session and signing secrets.

## Threats and controls

| Threat | Controls |
|---|---|
| **The model writes harmful SQL** (by mistake, or steered by a user) | (1) The guard: one statement, `SELECT` only, no data-modifying CTEs, locking clauses, `SELECT INTO`, or system and admin functions, catalogued tables only, row cap; the SQL that runs is re-rendered from the validated syntax tree. (2) The database role `analyst_ro` can only `SELECT` on schema `olist`, owns nothing, can't create temp tables, defaults to read-only transactions and has a 30 s statement-timeout backstop. (3) Every query runs in a read-only transaction. Measured: with a stand-in model that always writes the attack, 30 of 30 adversarial cases pass and 0 non-`SELECT` statements reach the database ([EVALS.md](EVALS.md)). |
| **Reading rows outside your scope** | Postgres row-level security on customers and on every table that reaches them (orders, items, payments, reviews), failing closed when no scope is set. The scope is an HMAC-signed value checked inside the database against a key `analyst_ro` can't read, so SQL that changes `app.allowed_states` gains nothing. `current_setting` and `set_config` are also blocked by the guard. The integration tests prove this as the raw role, independently of the guard. |
| **Prompt injection** via catalog descriptions, sample values or cell values | All such content is wrapped in delimiters (`<schema>`, `<data>`, `<values>`, ...) that are stripped from the content itself, and the system prompts say content inside them is never an instruction. The defences above don't depend on the model obeying: an injected `DELETE` is still blocked. The safety suite plants injections in a column description and in a stored value. |
| **Cross-site attacks** | Session in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie (no tokens in JavaScript); one origin, so no CORS; state-changing requests with a foreign `Origin` header are rejected. Strict CSP: per-request nonce with `'strict-dynamic'` on the app pages; static marketing pages, which render no user or model content, allow inline scripts because prerendered pages can't carry a nonce. Plus `frame-ancestors 'none'` and `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy, a locked-down `Permissions-Policy` and HSTS. Model output is never rendered as HTML (SQL highlighting renders tokens as text nodes). |
| **CSV formula injection** in exports | Cells starting with `= + - @` or a tab or carriage return are prefixed with `'`. |
| **Denial of service, cost abuse** | Per-user rate limit on questions, per-IP limit on demo and password login (Redis token bucket), per-run token cap, a global daily LLM spend cap that pauses the demo with a banner, statement timeouts, row caps, an optional `EXPLAIN` cost ceiling. |
| **Session theft or forgery** | Signed JWT (HS256, 32+ character secret enforced at startup), 7-day expiry. Demo personas have no password and can only be entered through the rate-limited demo endpoint. Passwords are hashed with argon2. |
| **Open redirects** | The post-login `next` parameter accepts only same-site paths. |
| **MCP abuse** | Bearer token compared in constant time; the server refuses to start without a 32+ character token; DNS-rebinding protection with an allowed-host list; read-only tools; the same guard, role and RLS scope as the app; every call audit-logged. |
| **Secret leakage** | Secrets come only from the environment (`make env` generates local ones); long-running services never receive the target owner's credentials; DSNs aren't stored in the database. No secrets in client bundles. |
| **Metrics and traces exposure** | `/api/metrics` returns 404 at the edge; in production only Caddy publishes ports, and Jaeger is reached over an SSH tunnel. |

## Known gaps

- Static pages allow inline scripts (see above); they contain no user or model content.
- Styles allow `'unsafe-inline'` because two libraries inject `<style>` elements at runtime.
- Sample values in the catalog are computed with the all-states scope, so a regional user can
  see example city names from other states in the catalog view (never in query results), and the
  approximate row counts are global.
- Rate limits are per user (questions) and per IP (login), shared across processes through Redis;
  an attacker with many IPs and accounts is bounded by the daily budget, not by the limits.
