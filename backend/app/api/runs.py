import csv
import io
import uuid
from collections.abc import Iterator

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.api.chat import ManagerDep
from app.deps import RuntimeDep, SessionDep, UserDep
from app.errors import ApiError, not_found
from app.graph import results
from app.graph.events import ColumnOut, RowsEvent
from app.graph.persist import run_out
from app.models import QueryRun, Role, RunStatus, User
from app.schemas import ErrorCode
from app.schemas.runs import RowsPage, RunOut
from app.sql.executor import QueryError
from app.sql.guard import guard

router = APIRouter(tags=["runs"])


async def _visible_run(session: SessionDep, run_id: uuid.UUID, user: User) -> QueryRun:
    run = await session.get(QueryRun, run_id)
    if run is None or (run.user_id != user.id and user.role != Role.admin):
        raise not_found("Run")  # 404, not 403: don't confirm other users' run ids exist
    return run


@router.get("/runs/{run_id}")
async def get_run(run_id: uuid.UUID, user: UserDep, session: SessionDep) -> RunOut:
    return run_out(await _visible_run(session, run_id, user))


async def _rows(rt: RuntimeDep, run: QueryRun, user: User) -> RowsEvent:
    """Cached rows, or re-run the chosen SQL (re-guarded, with the *viewer's* RLS scope)."""
    if cached := await results.load(rt.redis, results.rows_key(str(run.id))):
        return RowsEvent.model_validate(cached)
    if not run.chosen_sql:
        raise ApiError(ErrorCode.NO_ANSWER, "This run has no result to show.")
    async with rt.target_pool.acquire() as conn:
        tables = await conn.fetch(
            "SELECT schemaname || '.' || tablename AS t FROM pg_tables WHERE schemaname = $1",
            rt.settings.target_schema,
        )
    checked = guard(
        run.chosen_sql,
        dialect=rt.executor.dialect,
        allowed_tables=frozenset(r["t"] for r in tables),
        default_schema=rt.settings.target_schema,
        row_limit=rt.settings.row_limit,
    )
    if not checked.ok or checked.sql is None:
        raise ApiError(ErrorCode.BLOCKED_UNSAFE, checked.message or "Blocked.")
    try:
        res = await rt.executor.execute(
            checked.sql,
            allowed_states=user.allowed_states,
            timeout_ms=rt.settings.statement_timeout_ms,
            row_limit=rt.settings.row_limit,
        )
    except QueryError as e:
        code = ErrorCode.QUERY_TIMEOUT if e.code == "timeout" else ErrorCode.INTERNAL
        raise ApiError(code, e.message) from e
    # Keep the formats the original run chose.
    formats = {c["name"]: c["semantic_type"] for c in (run.context or {}).get("columns", [])}
    event = RowsEvent(
        columns=[
            ColumnOut(name=c.name, type=c.type, semantic_type=formats.get(c.name))
            for c in res.columns
        ],
        rows=res.rows,
        row_count=res.row_count,
        truncated=checked.limited and res.row_count >= rt.settings.row_limit,
    )
    await results.save(rt.redis, results.rows_key(str(run.id)), event.model_dump(mode="json"))
    return event


@router.get("/runs/{run_id}/rows")
async def get_rows(
    run_id: uuid.UUID,
    user: UserDep,
    session: SessionDep,
    rt: RuntimeDep,
    offset: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
) -> RowsPage:
    data = await _rows(rt, await _visible_run(session, run_id, user), user)
    return RowsPage(
        columns=data.columns,
        rows=data.rows[offset : offset + limit],
        offset=offset,
        row_count=data.row_count,
        truncated=data.truncated,
    )


@router.get("/runs/{run_id}/export.csv", response_class=StreamingResponse)
async def export_csv(
    run_id: uuid.UUID, user: UserDep, session: SessionDep, rt: RuntimeDep
) -> StreamingResponse:
    data = await _rows(rt, await _visible_run(session, run_id, user), user)

    def lines() -> Iterator[str]:
        buf = io.StringIO()
        writer = csv.writer(buf)
        header: list[object] = [c.name for c in data.columns]
        for row in [header, *data.rows]:
            writer.writerow([_csv_safe(v) for v in row])
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate()

    return StreamingResponse(
        lines(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="run-{run_id}.csv"'},
    )


def _csv_safe(v: object) -> object:
    """Neutralise spreadsheet formulas (CSV injection) in exported text cells."""
    return f"'{v}" if isinstance(v, str) and v and v[0] in "=+-@\t\r" else v


@router.post("/runs/{run_id}/cancel", status_code=202)
async def cancel_run(
    run_id: uuid.UUID, user: UserDep, session: SessionDep, manager: ManagerDep
) -> RunOut:
    run = await _visible_run(session, run_id, user)
    if run.status == RunStatus.running:
        await manager.cancel(run.id)
    elif run.status == RunStatus.clarifying:
        run.status = RunStatus.cancelled
        await session.commit()
    return run_out(run)
