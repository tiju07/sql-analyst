import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models import DescriptionSource
from app.semantic.models import SemanticLayer, SemanticType


class ConnectionOut(BaseModel):
    id: uuid.UUID
    name: str
    dialect: str
    table_count: int


class JobOut(BaseModel):
    job_id: str
    status: Literal["deferred", "queued", "in_progress", "complete", "failed", "not_found"]
    result: dict[str, Any] | None = None
    error: str | None = None


class TableSummary(BaseModel):
    id: uuid.UUID
    schema_name: str
    name: str
    row_count: int | None
    description: str | None
    description_source: DescriptionSource | None
    column_count: int


class ColumnOut(BaseModel):
    id: uuid.UUID
    name: str
    data_type: str
    semantic_type: str | None
    is_pk: bool
    fk_ref: str | None
    sample_values: list[Any]
    description: str | None
    description_source: DescriptionSource | None


class TableDetail(TableSummary):
    columns: list[ColumnOut]


class DescriptionPatch(BaseModel):
    description: str | None = Field(default=None, max_length=1000)


class ColumnPatch(DescriptionPatch):
    semantic_type: SemanticType | None = None


class SemanticLayerOut(BaseModel):
    yaml: str
    layer: SemanticLayer
    updated_at: datetime | None


class SemanticLayerIn(BaseModel):
    yaml: str = Field(min_length=1, max_length=100_000)
