from typing import Any

import structlog
from langgraph.runtime import Runtime as LGRuntime

from app.graph.nodes.common import stage
from app.graph.state import AgentContext, AgentState, AttemptKind, Candidate
from app.sql.executor import QueryError
from app.sql.guard import guard

log = structlog.get_logger()


def finalize_exhausted(candidates: list[Candidate], max_repairs: int) -> None:
    """Out of repairs: a query that kept returning nothing is accepted as "no rows"."""
    for c in candidates:
        if c["status"] == "needs_repair" and c["repairs"] >= max_repairs:
            c["status"] = "empty" if c["attempts"][-1]["kind"] == "empty" else "failed"


@stage("guard")
async def guard_node(state: AgentState, *, runtime: LGRuntime[AgentContext]) -> dict[str, Any]:
    ctx = runtime.context
    cfg = ctx.config
    allowed = frozenset(t.lower() for t in state["context"]["allowed_tables"])
    candidates = [c.copy() for c in state["candidates"]]
    for c in candidates:
        if c["status"] != "pending_guard":
            continue
        r = guard(
            c["sql"],
            dialect=ctx.dialect,
            allowed_tables=allowed,
            default_schema=ctx.default_schema,
            row_limit=cfg.row_limit,
        )
        if not r.ok:
            kind: AttemptKind = "unsafe" if not r.repairable or r.code is None else r.code
            c["attempts"] = [*c["attempts"], {"sql": c["sql"], "error": r.message, "kind": kind}]
            c["status"] = "needs_repair" if r.repairable else "blocked"
            if not r.repairable:
                log.warning("guard.blocked", run_id=state["run_id"], reason=r.message)
            continue
        assert r.sql is not None
        if cfg.explain_cost_limit is not None:
            try:
                cost = await ctx.executor.explain_cost(
                    r.sql, allowed_states=state["allowed_states"]
                )
            except QueryError as e:
                c["attempts"] = [
                    *c["attempts"],
                    {"sql": c["sql"], "error": e.message, "kind": "db_error"},
                ]
                c["status"] = "needs_repair"
                continue
            if cost is not None and cost > cfg.explain_cost_limit:
                msg = "This query would scan too much data. Try narrowing the question."
                c["attempts"] = [*c["attempts"], {"sql": c["sql"], "error": msg, "kind": "unsafe"}]
                c["status"] = "blocked"
                continue
        c["safe_sql"], c["limited"], c["status"] = r.sql, r.limited, "pending_exec"
    finalize_exhausted(candidates, cfg.max_repairs)
    return {"candidates": candidates}
