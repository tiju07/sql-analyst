"""Prometheus metrics (served on /api/metrics inside the network; Caddy hides it publicly)."""

from prometheus_client import Counter, Histogram

RUNS = Counter("sql_analyst_runs_total", "Agent runs by final status", ["status"])
RUN_LATENCY = Histogram(
    "sql_analyst_run_latency_seconds",
    "Agent run wall time",
    buckets=(1, 2, 5, 10, 20, 30, 60, 120),
)
LLM_COST = Counter("sql_analyst_llm_cost_usd_total", "LLM spend in USD")
LLM_TOKENS = Counter("sql_analyst_llm_tokens_total", "LLM tokens", ["direction"])
