"""Literal lookup: map words in a question ("Campinas", "boleto") to real column values."""

import re
import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CatalogColumn, CatalogTable, CatalogValue

MIN_SIMILARITY = 0.45
# Straight and curly quotes (\u2018\u2019\u201c\u201d).
_QUOTED = re.compile("[\"'\u2018\u201c]([^\"'\u2019\u201d]{2,60})[\"'\u2019\u201d]")
_PROPER = re.compile(r"\b([A-ZÀ-Ý][\wÀ-ÿ]+(?:\s+(?:de|da|do|dos|das|[A-ZÀ-Ý][\wÀ-ÿ]+))*)")
_STOP = frozenset(
    {
        "Which",
        "What",
        "Who",
        "When",
        "Where",
        "How",
        "Show",
        "List",
        "Give",
        "Top",
        "The",
        "For",
        "And",
        "Compare",
        "Last",
        "This",
        "Brazil",
        "BRL",
    }
)


@dataclass(frozen=True)
class ValueMatch:
    term: str
    table: str
    column: str
    value: str
    score: float


def candidate_terms(question: str) -> list[str]:
    """Quoted strings, capitalised phrases, and lowercase words of 4+ letters, deduplicated."""
    terms = [m.group(1) for m in _QUOTED.finditer(question)]
    terms += [p for p in _PROPER.findall(question) if p not in _STOP]
    terms += [w for w in re.findall(r"\b[a-z_]{4,}\b", question)]
    seen: dict[str, None] = {}
    for t in terms:
        seen.setdefault(t.strip().lower(), None)
    return list(seen)[:20]


async def lookup_values(
    session: AsyncSession, connection_id: uuid.UUID, question: str, limit_per_term: int = 3
) -> list[ValueMatch]:
    matches: list[ValueMatch] = []
    for term in candidate_terms(question):
        sim = func.similarity(CatalogValue.value, term)
        rows = await session.execute(
            select(
                CatalogTable.schema, CatalogTable.name, CatalogColumn.name, CatalogValue.value, sim
            )
            .join(CatalogColumn, CatalogColumn.id == CatalogValue.column_id)
            .join(CatalogTable, CatalogTable.id == CatalogColumn.table_id)
            .where(CatalogTable.connection_id == connection_id)
            .where(CatalogValue.value.op("%")(term))  # uses the GIN trigram index
            .where(sim >= MIN_SIMILARITY)
            .order_by(sim.desc())
            .limit(limit_per_term)
        )
        matches += [
            ValueMatch(term, f"{schema}.{table}" if schema else table, col, value, float(score))
            for schema, table, col, value, score in rows.all()
        ]
    return matches
