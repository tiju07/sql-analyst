from collections import defaultdict
from typing import Any

from langgraph.runtime import Runtime as LGRuntime
from sqlalchemy import select as sql_select

from app.graph import results
from app.graph.compose_rules import column_format
from app.graph.events import ColumnOut, RowsEvent
from app.graph.nodes.common import stage
from app.graph.state import AgentContext, AgentError, AgentState, Candidate
from app.models import CatalogColumn, CatalogTable
from app.schemas import ErrorCode


def pick(candidates: list[Candidate]) -> Candidate | None:
    """Majority result wins; ties go to fewer repairs, then shorter SQL."""
    done = [c for c in candidates if c["status"] in ("ok", "empty") and "result_hash" in c]
    if not done:
        return None
    groups: dict[str, list[Candidate]] = defaultdict(list)
    for c in done:
        groups[c["result_hash"]].append(c)

    def best(group: list[Candidate]) -> Candidate:
        return min(group, key=lambda c: (c["repairs"], len(c["sql"])))

    winner = max(
        groups.values(),
        key=lambda g: (len(g), -best(g)["repairs"], -len(best(g)["sql"]), g[0]["status"] == "ok"),
    )
    return best(winner)


def failure(candidates: list[Candidate]) -> AgentError:
    if candidates and all(c["status"] == "blocked" for c in candidates):
        reason = candidates[0]["attempts"][-1]["error"] or "unsafe query"
        return AgentError(
            code=ErrorCode.BLOCKED_UNSAFE, message=f"Blocked: {reason}", retryable=False
        )
    if any(a["kind"] == "timeout" for c in candidates for a in c["attempts"]):
        return AgentError(
            code=ErrorCode.QUERY_TIMEOUT,
            message="The query took too long. Try a narrower question (a period or a segment).",
            retryable=True,
        )
    return AgentError(
        code=ErrorCode.NO_ANSWER,
        message="I couldn't write a query that answers this. Try rephrasing or adding detail.",
        retryable=True,
    )


@stage("select")
async def select(state: AgentState, *, runtime: LGRuntime[AgentContext]) -> dict[str, Any]:
    ctx = runtime.context
    chosen = pick(state["candidates"])
    if chosen is None:
        return {"chosen": None, "error": failure(state["candidates"])}

    payload = await results.load(ctx.redis, results.candidate_key(state["run_id"], chosen["index"]))
    assert payload is not None, "candidate result expired mid-run"
    async with ctx.sessions() as session:
        catalog_types: dict[str, str] = {
            name.lower(): sem
            for name, sem in await session.execute(
                sql_select(CatalogColumn.name, CatalogColumn.semantic_type)
                .join(CatalogTable)
                .where(CatalogTable.connection_id == ctx.connection_id)
                .where(CatalogColumn.semantic_type.is_not(None))
            )
            if sem is not None
        }
    metric_types = state["context"]["metric_types"]
    columns = [
        ColumnOut(name=n, type=t, semantic_type=column_format(n, t, metric_types, catalog_types))
        for n, t in payload["columns"]
    ]
    rows = payload["rows"]
    event = RowsEvent(
        columns=columns,
        rows=rows[: results.PREVIEW_ROWS],
        row_count=len(rows),
        truncated=bool(chosen.get("truncated")),
    )
    await results.save(
        ctx.redis,
        results.rows_key(state["run_id"]),
        {**event.model_dump(mode="json"), "rows": rows},
    )
    runtime.stream_writer(event)
    return {"chosen": chosen["index"], "result_columns": [c.model_dump() for c in columns]}
