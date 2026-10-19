"""Deterministic parts of composing an answer: column formats, chart choice, result identity."""

import hashlib
import json
import re
from typing import Any, cast

from app.graph.events import ChartMark, ChartSpec, ColumnOut, ValueFormat
from app.sql.introspect import infer_semantic_type

_NUMERIC_DB = re.compile(r"^(int|numeric|decimal|float|double|real|money|bigint|smallint)", re.I)
_TEMPORAL_DB = re.compile(r"^(timestamp|date|time)", re.I)
_ISO_DATE = re.compile(r"^\d{4}-\d{2}(-\d{2})?([T ][\d:.]+)?$")
MAX_BAR_CATEGORIES = 20
MAX_SERIES = 8


def column_format(
    name: str, db_type: str, metric_types: dict[str, str], catalog_types: dict[str, str]
) -> ValueFormat | None:
    """Metric definitions win, then catalog column types, then name/type heuristics."""
    n = name.lower()
    for metric, sem in metric_types.items():
        if n == metric or n.startswith(f"{metric}_") or n.endswith(f"_{metric}"):
            return cast(ValueFormat, sem)
    found = catalog_types.get(n) or infer_semantic_type(n, db_type)
    if found:
        return cast(ValueFormat, found)
    if _NUMERIC_DB.match(db_type):
        return "number"
    if _TEMPORAL_DB.match(db_type):
        return "date"
    return None


def _is_numeric(col: ColumnOut) -> bool:
    return col.semantic_type in ("currency_brl", "percent", "count", "number")


def _is_temporal(col: ColumnOut, rows: list[list[Any]], i: int) -> bool:
    if col.semantic_type == "date":
        return True
    values = [r[i] for r in rows[:20] if r[i] is not None]
    return bool(values) and all(isinstance(v, str) and _ISO_DATE.match(v) for v in values)


def choose_chart(columns: list[ColumnOut], rows: list[list[Any]], title: str) -> ChartSpec:
    """single number -> kpi; time column -> line; <= 20 categories -> bar; otherwise table."""
    numeric = [c for c in columns if _is_numeric(c)]
    if not rows or not numeric:
        return ChartSpec(mark="table", title=title)
    y = numeric[0]
    if len(rows) == 1 and len(numeric) == 1 and len(columns) <= 2:
        return ChartSpec(mark="kpi", y=y.name, y_format=y.semantic_type, title=title)

    idx = {c.name: i for i, c in enumerate(columns)}
    temporal = [c for c in columns if c not in numeric and _is_temporal(c, rows, idx[c.name])]
    categorical = [c for c in columns if c not in numeric and c not in temporal]

    def distinct(col: ColumnOut) -> int:
        return len({json.dumps(r[idx[col.name]], default=str) for r in rows})

    series = next((c for c in categorical if 1 < distinct(c) <= MAX_SERIES), None)
    mark: ChartMark
    if temporal and len(rows) >= 2:
        x, mark = temporal[0], "line"
    elif categorical and distinct(categorical[0]) <= MAX_BAR_CATEGORIES:
        x = categorical[0]
        series = next((c for c in categorical[1:] if 1 < distinct(c) <= MAX_SERIES), None)
        n = distinct(x)
        mark = "pie" if y.semantic_type == "percent" and n <= 5 and series is None else "bar"
    elif len(numeric) >= 2 and not categorical and len(rows) >= 5:
        return ChartSpec(
            mark="scatter",
            x=numeric[0].name,
            y=numeric[1].name,
            x_format=numeric[0].semantic_type,
            y_format=numeric[1].semantic_type,
            title=title,
        )
    else:
        return ChartSpec(mark="table", title=title)
    if mark == "line" and series is not None and series.name == x.name:
        series = None
    return ChartSpec(
        mark=mark,
        x=x.name,
        y=y.name,
        series=series.name if series is not None and mark != "pie" else None,
        y_format=y.semantic_type,
        x_format="date" if mark == "line" else None,
        title=title,
    )


def result_hash(rows: list[list[Any]], ordered: bool) -> str:
    """Identity of a result set for majority voting. Floats rounded; row order ignored unless
    the query orders. ponytail: column order still matters; candidates rarely differ there."""

    def norm(v: Any) -> Any:
        return round(v, 4) if isinstance(v, float) else v

    canon = [json.dumps([norm(v) for v in r], default=str) for r in rows]
    if not ordered:
        canon.sort()
    return hashlib.sha256("\n".join(canon).encode()).hexdigest()[:16]
