import json

import pytest

from app.graph.compose_rules import choose_chart, column_format, result_hash
from app.graph.events import ColumnOut, DoneEvent, ErrorEvent, StageEvent, encode
from app.schemas import ErrorCode

METRICS = {"revenue": "currency_brl", "orders": "count", "late_delivery_rate": "percent"}


def col(name: str, sem: str | None, typ: str = "text") -> ColumnOut:
    return ColumnOut(name=name, type=typ, semantic_type=sem)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("name", "db_type", "expected"),
    [
        ("revenue", "numeric", "currency_brl"),
        ("total_revenue", "numeric", "currency_brl"),
        ("revenue_growth_pct", "numeric", "currency_brl"),  # metric prefix wins; acceptable
        ("late_delivery_rate", "numeric", "percent"),
        ("price", "numeric", "currency_brl"),
        ("month", "timestamp without time zone", "date"),
        ("n_sellers", "int8", "number"),
        ("customer_state", "bpchar", None),
    ],
)
def test_column_format(name: str, db_type: str, expected: str | None) -> None:
    assert column_format(name, db_type, METRICS, {}) == expected


def test_kpi_for_single_number() -> None:
    spec = choose_chart([col("revenue", "currency_brl")], [[123.4]], "Revenue")
    assert spec.mark == "kpi" and spec.y == "revenue" and spec.y_format == "currency_brl"


def test_line_for_time_series() -> None:
    rows = [["2018-01-01T00:00:00", 10.0], ["2018-02-01T00:00:00", 12.0]]
    spec = choose_chart([col("month", "date"), col("revenue", "currency_brl")], rows, "t")
    assert (spec.mark, spec.x, spec.y, spec.x_format) == ("line", "month", "revenue", "date")


def test_line_detects_iso_strings_and_series() -> None:
    rows = [[m, s, 1] for m in ("2018-01", "2018-02") for s in ("SP", "RJ")]
    spec = choose_chart([col("month", None), col("state", None), col("orders", "count")], rows, "t")
    assert spec.mark == "line" and spec.series == "state"


def test_bar_for_few_categories() -> None:
    rows = [[s, i] for i, s in enumerate(["SP", "RJ", "MG"])]
    spec = choose_chart([col("customer_state", None), col("orders", "count")], rows, "t")
    assert (spec.mark, spec.x, spec.y) == ("bar", "customer_state", "orders")


def test_table_for_many_categories() -> None:
    rows = [[f"city{i}", i] for i in range(25)]
    assert choose_chart([col("city", None), col("orders", "count")], rows, "t").mark == "table"


def test_pie_only_for_small_share_breakdowns() -> None:
    rows = [["credit_card", 0.74], ["boleto", 0.19], ["voucher", 0.07]]
    assert (
        choose_chart([col("payment_type", None), col("share", "percent")], rows, "t").mark == "pie"
    )


def test_scatter_for_two_measures() -> None:
    rows = [[float(i), float(i * 2)] for i in range(6)]
    spec = choose_chart([col("weight", "number"), col("freight", "currency_brl")], rows, "t")
    assert (spec.mark, spec.x, spec.y) == ("scatter", "weight", "freight")


def test_table_without_numbers_or_rows() -> None:
    assert choose_chart([col("name", None)], [["a"]], "t").mark == "table"
    assert choose_chart([col("n", "count")], [], "t").mark == "table"


def test_result_hash_order_and_float_tolerance() -> None:
    a = [["SP", 1.00001], ["RJ", 2.0]]
    b = [["RJ", 2.0], ["SP", 1.000012]]
    assert result_hash(a, ordered=False) == result_hash(b, ordered=False)
    assert result_hash(a, ordered=True) != result_hash(b, ordered=True)
    assert result_hash(a, ordered=False) != result_hash([["SP", 1.0]], ordered=False)


def test_sse_encoding() -> None:
    e = encode(StageEvent(stage="retrieve", status="end", ms=12))
    assert e["event"] == "stage"
    assert json.loads(e["data"]) == {"stage": "retrieve", "status": "end", "ms": 12}
    err = encode(ErrorEvent(code=ErrorCode.RATE_LIMITED, message="slow down", retryable=True))
    assert json.loads(err["data"])["code"] == "RATE_LIMITED"
    done = encode(DoneEvent(run_id="r", status="ok", latency_ms=5, cost_usd=0.01, trace_id=None))
    assert done["event"] == "done"
