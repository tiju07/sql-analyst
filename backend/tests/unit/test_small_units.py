import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.auth.security import (
    create_session_token,
    decode_session_token,
    hash_password,
    verify_password,
)
from app.config import Settings
from app.llm.client import Usage
from app.llm.pricing import cost_usd
from app.retrieval.value_index import candidate_terms
from app.semantic.loader import METRICS_PATH, parse_layer
from app.sql.executor import jsonable
from app.sql.introspect import infer_semantic_type

KEY = "k" * 32


def test_session_token_roundtrip_and_expiry() -> None:
    uid = uuid.uuid4()
    assert decode_session_token(create_session_token(uid, KEY), KEY) == uid
    old = create_session_token(uid, KEY, now=datetime.now(UTC) - timedelta(days=8))
    assert decode_session_token(old, KEY) is None
    assert decode_session_token(create_session_token(uid, KEY), "x" * 32) is None
    assert decode_session_token("garbage", KEY) is None


def test_password_hashing() -> None:
    h = hash_password("s3cret")
    assert verify_password(h, "s3cret")
    assert not verify_password(h, "wrong")


def test_settings_reject_short_secrets() -> None:
    with pytest.raises(ValidationError, match="at least 32"):
        Settings(
            app_database_url="postgresql://a@b/c",
            target_database_url="postgresql://a@b/c",
            session_secret="short",
            rls_signing_secret=KEY,
        )


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (Decimal("12.50"), 12.5),
        (Decimal("NaN"), None),
        (float("inf"), None),
        (datetime(2018, 1, 2, 3, 4, 5), "2018-01-02T03:04:05"),
        (date(2018, 1, 2), "2018-01-02"),
        (timedelta(hours=1), 3600.0),
        (b"\x01\xff", "01ff"),
        ([Decimal(1), None], [1.0, None]),
        ({"a": Decimal(2)}, {"a": 2.0}),
    ],
)
def test_jsonable(value: object, expected: object) -> None:
    assert jsonable(value) == expected


@pytest.mark.parametrize(
    ("col", "dtype", "expected"),
    [
        ("price", "numeric(10,2)", "currency_brl"),
        ("freight_value", "numeric", "currency_brl"),
        ("order_purchase_timestamp", "timestamp without time zone", "date"),
        ("shipped_at", "", "date"),
        ("product_photos_qty", "integer", "count"),
        ("late_rate", "double precision", "percent"),
        ("customer_city", "text", None),
        ("price_label", "text", None),
    ],
)
def test_infer_semantic_type(col: str, dtype: str, expected: str | None) -> None:
    assert infer_semantic_type(col, dtype) == expected


def test_cost_and_usage() -> None:
    c = cost_usd(
        "claude-sonnet-5-5", input_tokens=1_000_000, output_tokens=100_000, cache_read=1_000_000
    )
    assert c == pytest.approx(2.0 + 1.0 + 0.2)
    assert cost_usd("some-local-model", input_tokens=10**9, output_tokens=0) == 0.0
    total = Usage()
    total += Usage.priced("claude-haiku-5-5", 1000, 1000, 0, 0)
    total += Usage.priced("claude-haiku-5-5", 1000, 1000, 0, 0)
    assert total.input_tokens == 2000 and total.cost_usd == pytest.approx(0.0012)


def test_bundled_semantic_layer_is_valid() -> None:
    layer = parse_layer(METRICS_PATH.read_text())
    assert {"revenue", "gmv", "late_delivery_rate", "aov"} <= {m.name for m in layer.metrics}


@pytest.mark.parametrize(
    "text",
    [
        "metrics: [{name: x, description: d, sql_expr: 'SUM(a); DROP TABLE t'}]",
        "metrics: [{name: x, description: d, sql_expr: 'SUM('}]",
        "metrics: [{name: x, description: d, sql_expr: a}, {name: x, description: d, sql_expr: b}]",
        "metrics: [{name: x, description: d, sql_expr: a, extra: 1}]",
    ],
)
def test_semantic_layer_rejects_bad_metrics(text: str) -> None:
    with pytest.raises(ValidationError):
        parse_layer(text)


def test_candidate_terms() -> None:
    terms = candidate_terms('Orders from "Rio de Janeiro" and Belo Horizonte paid by boleto')
    assert terms[0] == "rio de janeiro"  # quoted phrases first
    assert {"belo horizonte", "boleto"} <= set(terms)
    assert len(terms) == len(set(terms))
