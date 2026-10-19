import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.integration


async def login(api: AsyncClient, persona: str) -> None:
    r = await api.post(f"/api/auth/demo/{persona}")
    assert r.status_code == 200, r.text


async def test_me_requires_session(api: AsyncClient) -> None:
    r = await api.get("/api/auth/me")
    assert r.status_code == 401
    assert r.json()["code"] == "UNAUTHENTICATED"


async def test_demo_login_sets_httponly_cookie(api: AsyncClient) -> None:
    r = await api.post("/api/auth/demo/regional")
    cookie = r.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie
    me = (await api.get("/api/auth/me")).json()
    assert me["role"] == "regional" and me["allowed_states"] == ["SP"]


async def test_logout_clears_session(api: AsyncClient) -> None:
    await login(api, "analyst")
    assert (await api.post("/api/auth/logout")).status_code == 204
    assert (await api.get("/api/auth/me")).status_code == 401


async def test_tampered_cookie_rejected(api: AsyncClient) -> None:
    api.cookies.set("sa_session", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.bad")
    assert (await api.get("/api/auth/me")).status_code == 401


async def test_password_login(api: AsyncClient) -> None:
    bad = await api.post("/api/auth/login", json={"email": "owner@example.com", "password": "nope"})
    assert bad.status_code == 401
    ok = await api.post(
        "/api/auth/login",
        json={"email": "OWNER@example.com", "password": "correct horse battery staple"},
    )
    assert ok.status_code == 200 and ok.json()["role"] == "admin"


async def test_demo_personas_cannot_password_login(api: AsyncClient) -> None:
    r = await api.post(
        "/api/auth/login", json={"email": "admin@demo.sql-analyst.dev", "password": "x"}
    )
    assert r.status_code == 401


async def test_demo_login_rate_limited_per_ip(api: AsyncClient) -> None:
    codes = [(await api.post("/api/auth/demo/analyst")).status_code for _ in range(7)]
    assert codes[:5] == [200] * 5
    assert codes[5] == 429
    r = await api.post("/api/auth/demo/analyst")
    assert r.json()["code"] == "RATE_LIMITED" and int(r.headers["retry-after"]) >= 1


async def test_cross_origin_write_blocked(api: AsyncClient) -> None:
    r = await api.post("/api/auth/demo/analyst", headers={"Origin": "https://evil.example"})
    assert r.status_code == 403
    same = await api.post("/api/auth/demo/analyst", headers={"Origin": "http://test"})
    assert same.status_code == 200


async def test_catalog_browse(api: AsyncClient) -> None:
    await login(api, "analyst")
    tables = (await api.get("/api/catalog/tables")).json()
    orders = next(t for t in tables if t["name"] == "orders")
    detail = (await api.get(f"/api/catalog/tables/{orders['id']}")).json()
    assert detail["columns"][0]["name"] == "order_id"  # primary key first
    assert detail["column_count"] == len(detail["columns"]) == 8


async def test_analyst_cannot_edit_catalog(api: AsyncClient) -> None:
    await login(api, "analyst")
    table = (await api.get("/api/catalog/tables")).json()[0]
    r = await api.patch(f"/api/catalog/tables/{table['id']}", json={"description": "x"})
    assert r.status_code == 403


async def test_admin_edits_column(api: AsyncClient) -> None:
    await login(api, "admin")
    table = next(
        t for t in (await api.get("/api/catalog/tables")).json() if t["name"] == "order_items"
    )
    detail = (await api.get(f"/api/catalog/tables/{table['id']}")).json()
    price = next(c for c in detail["columns"] if c["name"] == "price")
    r = await api.patch(
        f"/api/catalog/columns/{price['id']}",
        json={
            "description": "Item price in BRL, excluding freight.",
            "semantic_type": "currency_brl",
        },
    )
    assert r.status_code == 200
    assert r.json()["description_source"] == "human"


async def test_metrics_put_validates(api: AsyncClient) -> None:
    await login(api, "admin")
    current = (await api.get("/api/semantic/metrics")).json()
    bad = await api.put("/api/semantic/metrics", json={"yaml": "metrics: [{name: 1}]"})
    assert bad.status_code == 422 and bad.json()["code"] == "INVALID"
    broken = await api.put("/api/semantic/metrics", json={"yaml": "metrics: [unclosed"})
    assert broken.status_code == 422
    ok = await api.put("/api/semantic/metrics", json={"yaml": current["yaml"]})
    assert ok.status_code == 200
    assert len(ok.json()["layer"]["metrics"]) == len(current["layer"]["metrics"])


async def test_sync_requires_admin_and_enqueues(api: AsyncClient) -> None:
    await login(api, "analyst")
    conn = (await api.get("/api/connections")).json()[0]
    assert (await api.post(f"/api/connections/{conn['id']}/sync")).status_code == 403
    await login(api, "admin")
    first = (await api.post(f"/api/connections/{conn['id']}/sync")).json()
    second = (await api.post(f"/api/connections/{conn['id']}/sync")).json()
    assert first["status"] == "queued"
    assert second["job_id"] == first["job_id"]  # joined, not duplicated (no worker in tests)
