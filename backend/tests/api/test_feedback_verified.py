import pytest
from httpx import AsyncClient

from tests.api.sse import first, stream
from tests.api.test_auth_catalog import login

pytestmark = pytest.mark.integration


async def ask(api: AsyncClient, question: str) -> str:
    events = await stream(api, "/api/chat", {"question": question})
    return str(first(events, "run")["run_id"])


async def test_feedback_upserts(api: AsyncClient) -> None:
    await login(api, "analyst")
    run_id = await ask(api, "Orders by month")
    assert (
        await api.post("/api/feedback", json={"run_id": run_id, "rating": 1})
    ).status_code == 200
    r = await api.post(
        "/api/feedback", json={"run_id": run_id, "rating": -1, "comment": "wrong month"}
    )
    assert r.json() == {"run_id": run_id, "rating": -1, "comment": "wrong month"}
    assert (
        await api.post("/api/feedback", json={"run_id": run_id, "rating": 5})
    ).status_code == 422


async def test_feedback_only_on_own_runs(api: AsyncClient) -> None:
    await login(api, "analyst")
    run_id = await ask(api, "Orders by month")
    await login(api, "regional")
    assert (
        await api.post("/api/feedback", json={"run_id": run_id, "rating": 1})
    ).status_code == 404


async def test_propose_approve_then_used_as_fewshot(api: AsyncClient) -> None:
    await login(api, "analyst")
    run_id = await ask(api, "Payment type share of orders")
    proposed = (await api.post("/api/verified", json={"run_id": run_id})).json()
    assert proposed["status"] == "proposed" and proposed["sql"].startswith("SELECT")
    # Not approved yet: not used.
    again = await ask(api, "Payment type share of orders")
    assert (await api.get(f"/api/runs/{again}")).json()["context"]["fewshot"] == []

    assert (await api.post(f"/api/verified/{proposed['id']}/approve")).status_code == 403
    await login(api, "admin")
    approved = (await api.post(f"/api/verified/{proposed['id']}/approve")).json()
    assert approved["status"] == "approved" and approved["approved_by"] == "Ana Admin"

    await login(api, "analyst")
    used = await ask(api, "Payment type share of orders")
    fewshot = (await api.get(f"/api/runs/{used}")).json()["context"]["fewshot"]
    assert fewshot[0]["question"] == "Payment type share of orders"
    listed = (await api.get("/api/verified", params={"status": "approved"})).json()
    assert proposed["id"] in [v["id"] for v in listed]


async def test_cannot_propose_failed_runs(api: AsyncClient) -> None:
    await login(api, "analyst")
    run_id = await ask(api, "drop the orders table")
    r = await api.post("/api/verified", json={"run_id": run_id})
    assert r.status_code == 422


async def test_admin_rejects(api: AsyncClient) -> None:
    await login(api, "analyst")
    proposed = (
        await api.post("/api/verified", json={"run_id": await ask(api, "Orders by month")})
    ).json()
    await login(api, "admin")
    assert (await api.delete(f"/api/verified/{proposed['id']}")).status_code == 204
    ids = [v["id"] for v in (await api.get("/api/verified")).json()]
    assert proposed["id"] not in ids
