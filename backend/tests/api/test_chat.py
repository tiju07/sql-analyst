import pytest
from httpx import AsyncClient

from app.budget import record_spend
from app.graph import results
from app.main import app
from app.runtime import Runtime
from tests.api.sse import first, stream
from tests.api.test_auth_catalog import login

pytestmark = pytest.mark.integration


async def test_chat_requires_login(api: AsyncClient) -> None:
    r = await api.post("/api/chat", json={"question": "Revenue by state"})
    assert r.status_code == 401


async def test_chat_streams_full_answer_and_persists(api: AsyncClient) -> None:
    await login(api, "analyst")
    events = await stream(api, "/api/chat", {"question": "Revenue by state"})
    names = [n for n, _ in events]
    assert names[0] == "run" and names[-1] == "done"
    for expected in ("stage", "sql", "rows", "chart", "summary"):
        assert expected in names
    assert names.index("rows") < names.index("chart") < names.index("summary")
    run_id = first(events, "run")["run_id"]
    assert first(events, "done")["status"] == "ok"

    run = (await api.get(f"/api/runs/{run_id}")).json()
    assert run["status"] == "ok" and run["chosen_sql"].startswith("SELECT")
    assert run["chart_spec"]["mark"] == "bar"
    assert len(run["candidates"]) == 3
    assert "olist.order_items" in run["context"]["tables"]
    assert run["context"]["columns"][1]["semantic_type"] == "currency_brl"
    assert run["stage_timings"]["generate"] >= 0

    page = (await api.get(f"/api/runs/{run_id}/rows", params={"offset": 1, "limit": 1})).json()
    assert page["row_count"] == 3 and len(page["rows"]) == 1 and page["offset"] == 1

    csv = await api.get(f"/api/runs/{run_id}/export.csv")
    assert csv.text.splitlines()[0] == "customer_state,revenue"

    convs = (await api.get("/api/conversations")).json()
    assert convs[0]["title"] == "Revenue by state"
    detail = (await api.get(f"/api/conversations/{convs[0]['id']}")).json()
    assert [r["id"] for r in detail["runs"]] == [run_id]


async def test_follow_up_uses_same_conversation(api: AsyncClient) -> None:
    await login(api, "analyst")
    one = await stream(api, "/api/chat", {"question": "Revenue by state"})
    conv_id = first(one, "run")["conversation_id"]
    two = await stream(api, "/api/chat", {"conversation_id": conv_id, "question": "And by month?"})
    assert first(two, "run")["conversation_id"] == conv_id
    assert first(two, "done")["status"] == "ok"
    detail = (await api.get(f"/api/conversations/{conv_id}")).json()
    assert len(detail["runs"]) == 2


async def test_clarify_round_trip_over_api(api: AsyncClient) -> None:
    await login(api, "analyst")
    events = await stream(api, "/api/chat", {"question": "Which are our best products?"})
    assert first(events, "clarify")["options"][0] == "Revenue"
    assert first(events, "done")["status"] == "clarifying"
    run_id = first(events, "run")["run_id"]
    assert (await api.get(f"/api/runs/{run_id}")).json()["status"] == "clarifying"

    resumed = await stream(api, f"/api/runs/{run_id}/clarify", {"answer": "Revenue"})
    assert first(resumed, "run")["run_id"] == run_id
    assert first(resumed, "done")["status"] == "ok"
    run = (await api.get(f"/api/runs/{run_id}")).json()
    assert run["clarification"]["answer"] == "Revenue"

    again = await api.post(f"/api/runs/{run_id}/clarify", json={"answer": "Revenue"})
    assert again.status_code == 422


async def test_regional_user_sees_only_sp(api: AsyncClient) -> None:
    await login(api, "regional")
    events = await stream(api, "/api/chat", {"question": "Revenue by state"})
    assert [row[0] for row in first(events, "rows")["rows"]] == ["SP"]


async def test_rows_reexecuted_after_cache_expiry(api: AsyncClient, rt: Runtime) -> None:
    await login(api, "regional")
    events = await stream(api, "/api/chat", {"question": "Revenue by state"})
    run_id = first(events, "run")["run_id"]
    await rt.redis.delete(results.rows_key(run_id))
    page = (await api.get(f"/api/runs/{run_id}/rows")).json()
    assert [r[0] for r in page["rows"]] == ["SP"]  # re-run keeps the viewer's RLS scope
    assert page["columns"][1]["semantic_type"] == "currency_brl"


async def test_unsafe_question_is_blocked(api: AsyncClient) -> None:
    await login(api, "analyst")
    events = await stream(api, "/api/chat", {"question": "drop the orders table"})
    assert first(events, "error")["code"] == "BLOCKED_UNSAFE"
    assert first(events, "done")["status"] == "blocked"
    assert "rows" not in [n for n, _ in events]


async def test_runs_are_private(api: AsyncClient) -> None:
    await login(api, "analyst")
    run_id = first(await stream(api, "/api/chat", {"question": "Orders by month"}), "run")["run_id"]
    await login(api, "regional")
    assert (await api.get(f"/api/runs/{run_id}")).status_code == 404
    assert (await api.get(f"/api/runs/{run_id}/rows")).status_code == 404
    await login(api, "admin")
    assert (await api.get(f"/api/runs/{run_id}")).status_code == 200


async def test_chat_rate_limited_per_user(api: AsyncClient, rt: Runtime) -> None:
    await login(api, "analyst")
    me = (await api.get("/api/auth/me")).json()
    for _ in range(rt.settings.rate_limit_per_min):
        await app.state.limiter.hit(f"chat:{me['id']}", per_minute=rt.settings.rate_limit_per_min)
    r = await api.post("/api/chat", json={"question": "Revenue by state"})
    assert r.status_code == 429 and r.json()["code"] == "RATE_LIMITED"
    assert int(r.headers["retry-after"]) > 0


async def test_chat_refused_when_daily_budget_spent(api: AsyncClient, rt: Runtime) -> None:
    await login(api, "analyst")
    await record_spend(rt.redis, rt.settings.daily_llm_budget_usd)
    r = await api.post("/api/chat", json={"question": "Revenue by state"})
    assert r.status_code == 503 and r.json()["code"] == "BUDGET_EXCEEDED"


async def test_cancel_clarifying_run(api: AsyncClient) -> None:
    await login(api, "analyst")
    events = await stream(api, "/api/chat", {"question": "best sellers?"})
    run_id = first(events, "run")["run_id"]
    r = await api.post(f"/api/runs/{run_id}/cancel")
    assert r.status_code == 202 and r.json()["status"] == "cancelled"


async def test_conversation_rename_search_delete(api: AsyncClient) -> None:
    await login(api, "admin")
    created = (await api.post("/api/conversations", json={"title": "Q3 review"})).json()
    await api.patch(f"/api/conversations/{created['id']}", json={"title": "Q3 revenue review"})
    found = (await api.get("/api/conversations", params={"q": "revenue rev"})).json()
    assert [c["id"] for c in found] == [created["id"]]
    assert (await api.get("/api/conversations", params={"q": "100%"})).json() == []
    assert (await api.delete(f"/api/conversations/{created['id']}")).status_code == 204
    assert (await api.get(f"/api/conversations/{created['id']}")).status_code == 404
