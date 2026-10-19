"""Structured outputs the agent asks LLMs for."""

from pydantic import BaseModel, Field


class ClarificationOut(BaseModel):
    is_ambiguous: bool
    question: str = Field(description="Empty when not ambiguous")
    options: list[str] = Field(description="2-4 complete answers; empty when not ambiguous")


class SqlCandidateOut(BaseModel):
    sql: str
    tables_used: list[str]
    assumptions: list[str]


class CompositionOut(BaseModel):
    title: str
    summary: str
    caveats: list[str]
