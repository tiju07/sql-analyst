import uuid

from arq.jobs import Job, JobStatus
from fastapi import APIRouter
from sqlalchemy import func, select

from app.deps import AdminDep, RuntimeDep, SessionDep, UserDep, audit
from app.errors import not_found
from app.models import CatalogTable, Connection
from app.schemas.catalog import ConnectionOut, JobOut

router = APIRouter(tags=["connections"])


@router.get("/connections")
async def list_connections(_: UserDep, session: SessionDep) -> list[ConnectionOut]:
    rows = await session.execute(
        select(Connection, func.count(CatalogTable.id))
        .outerjoin(CatalogTable, CatalogTable.connection_id == Connection.id)
        .group_by(Connection.id)
        .order_by(Connection.name)
    )
    return [
        ConnectionOut(id=c.id, name=c.name, dialect=c.dialect, table_count=n) for c, n in rows.all()
    ]


@router.post("/connections/{connection_id}/sync", status_code=202)
async def sync_connection(
    connection_id: uuid.UUID, admin: AdminDep, session: SessionDep, rt: RuntimeDep
) -> JobOut:
    if await session.get(Connection, connection_id) is None:
        raise not_found("Connection")
    # A second click while a sync is queued or running joins it instead of racing it.
    key = f"catalog-sync:{connection_id}"
    if current := await rt.redis.get(key):
        job_id = current.decode() if isinstance(current, bytes) else current
        status = await Job(job_id, rt.arq).status()
        if status in (JobStatus.queued, JobStatus.in_progress, JobStatus.deferred):
            return JobOut(job_id=job_id, status=status.value)
    job = await rt.arq.enqueue_job(
        "sync_catalog_job", str(connection_id), _job_id=f"sync:{connection_id}:{uuid.uuid4().hex}"
    )
    assert job is not None  # fresh job id, so arq can't treat it as a duplicate
    await rt.redis.set(key, job.job_id, ex=3600)
    audit(session, admin, "catalog.sync", connection_id=str(connection_id))
    await session.commit()
    return JobOut(job_id=job.job_id, status="queued")


@router.get("/jobs/{job_id}")
async def job_status(job_id: str, _: AdminDep, rt: RuntimeDep) -> JobOut:
    job = Job(job_id, rt.arq)
    status = await job.status()
    if status != JobStatus.complete:
        return JobOut(job_id=job_id, status=status.value)
    info = await job.result_info()
    if info is None:
        return JobOut(job_id=job_id, status="not_found")
    if not info.success:
        return JobOut(job_id=job_id, status="failed", error=str(info.result))
    return JobOut(job_id=job_id, status="complete", result=info.result)
