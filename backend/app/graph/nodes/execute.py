import asyncio
from typing import Any

import sqlglot
from langgraph.runtime import Runtime as LGRuntime

from app.graph import results
from app.graph.compose_rules import result_hash
from app.graph.nodes.common import stage
from app.graph.nodes.guard import finalize_exhausted
from app.graph.state import AgentContext, AgentState, AttemptKind, Candidate
from app.sql.executor import QueryError


@stage("execute")
async def execute(state: AgentState, *, runtime: LGRuntime[AgentContext]) -> dict[str, Any]:
    ctx = runtime.context
    cfg = ctx.config
    candidates = [c.copy() for c in state["candidates"]]

    async def run(c: Candidate) -> None:
        sql = c["safe_sql"]
        try:
            res = await ctx.executor.execute(
                sql,
                allowed_states=state["allowed_states"],
                timeout_ms=cfg.statement_timeout_ms,
                row_limit=cfg.row_limit,
            )
        except QueryError as e:
            kind: AttemptKind = "timeout" if e.code == "timeout" else "db_error"
            c["attempts"] = [*c["attempts"], {"sql": c["sql"], "error": e.message, "kind": kind}]
            c["status"] = "failed" if kind == "timeout" else "needs_repair"
            return
        truncated = res.truncated or (bool(c.get("limited")) and res.row_count >= cfg.row_limit)
        await results.save(
            ctx.redis,
            results.candidate_key(state["run_id"], c["index"]),
            {"columns": [[col.name, col.type] for col in res.columns], "rows": res.rows},
        )
        ordered = sqlglot.parse_one(sql, read=ctx.dialect.value).args.get("order") is not None
        c["result_hash"] = result_hash(res.rows, ordered)
        c["row_count"], c["truncated"] = res.row_count, truncated
        c["columns"] = [{"name": col.name, "type": col.type} for col in res.columns]
        if res.row_count == 0:
            c["attempts"] = [
                *c["attempts"],
                {"sql": c["sql"], "error": "Query returned no rows.", "kind": "empty"},
            ]
            c["status"] = "needs_repair"
        else:
            c["status"] = "ok"

    await asyncio.gather(*(run(c) for c in candidates if c["status"] == "pending_exec"))
    finalize_exhausted(candidates, cfg.max_repairs)
    return {"candidates": candidates}
