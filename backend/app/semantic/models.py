from typing import Literal

import sqlglot
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlglot.errors import ParseError

SemanticType = Literal["currency_brl", "date", "count", "percent", "number"]


class Metric(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(pattern=r"^[a-z][a-z0-9_]*$", max_length=64)
    description: str = Field(min_length=1, max_length=500)
    sql_expr: str = Field(min_length=1, max_length=2000)
    semantic_type: SemanticType = "number"
    synonyms: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("sql_expr")
    @classmethod
    def _parses(cls, v: str) -> str:
        # Validated as an expression, not a statement: it is spliced into generated SELECTs.
        try:
            sqlglot.parse_one(f"SELECT {v}", read="postgres")
        except ParseError as e:
            raise ValueError(f"sql_expr does not parse: {e.errors[0]['description']}") from e
        if ";" in v:
            raise ValueError("sql_expr must be a single expression")
        return v


class Dimension(BaseModel):
    model_config = ConfigDict(extra="forbid")

    term: str = Field(min_length=1, max_length=64)
    column: str = Field(pattern=r"^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$")


class SemanticLayer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    notes: list[str] = Field(default_factory=list, max_length=20)
    metrics: list[Metric]
    dimensions: list[Dimension] = Field(default_factory=list)

    @field_validator("metrics")
    @classmethod
    def _unique(cls, v: list[Metric]) -> list[Metric]:
        names = [m.name for m in v]
        if dupes := {n for n in names if names.count(n) > 1}:
            raise ValueError(f"duplicate metric names: {', '.join(sorted(dupes))}")
        return v
