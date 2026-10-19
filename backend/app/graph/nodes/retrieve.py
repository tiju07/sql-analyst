from typing import Any

from langgraph.runtime import Runtime as LGRuntime

from app.graph.nodes.common import data_block, stage
from app.graph.state import AgentContext, AgentState, RetrievedContext
from app.retrieval.fewshot import similar_verified
from app.retrieval.schema_linker import clean, link_schema
from app.retrieval.value_index import lookup_values
from app.semantic.loader import get_layer
from app.semantic.models import SemanticLayer


def retrieval_text(state: AgentState) -> str:
    """Follow-ups ("and by month?") need the previous question to find the right tables."""
    parts = [state["question"]]
    if state["history"]:
        parts.insert(0, state["history"][-1]["question"])
    if hint := state.get("hint"):
        parts.append(hint)
    return " ".join(parts)


def semantic_block(layer: SemanticLayer) -> str:
    out = []
    if layer.metrics:
        out.append(
            data_block(
                "metrics",
                "\n".join(
                    f"- {m.name} = {m.sql_expr}  -- {m.description}"
                    + (f" (also called: {', '.join(m.synonyms)})" if m.synonyms else "")
                    for m in layer.metrics
                ),
            )
        )
    if layer.dimensions:
        out.append(
            data_block(
                "dimensions", "\n".join(f"- {d.term} -> {d.column}" for d in layer.dimensions)
            )
        )
    if layer.notes:
        out.append(data_block("notes", "\n".join(f"- {n}" for n in layer.notes)))
    return "\n".join(out)


@stage("retrieve")
async def retrieve(state: AgentState, *, runtime: LGRuntime[AgentContext]) -> dict[str, Any]:
    ctx = runtime.context
    cfg = ctx.config
    text = retrieval_text(state)
    use_vectors = cfg.schema_linking or cfg.few_shot
    q_vec = await ctx.embedder.embed_query(text) if use_vectors else None

    async with ctx.sessions() as session:
        values = (
            await lookup_values(session, ctx.connection_id, text) if cfg.value_retrieval else []
        )
        linked = await link_schema(
            session,
            ctx.connection_id,
            text,
            q_vec,
            boost_tables=[v.table for v in values],
            full=not cfg.schema_linking,
        )
        fewshot = (
            await similar_verified(session, ctx.connection_id, q_vec)
            if cfg.few_shot and q_vec is not None
            else []
        )
        layer = await get_layer(session, ctx.connection_id)
        await session.commit()  # first use seeds the semantic layer row

    parts = [data_block("schema", linked.ddl), semantic_block(layer)]
    if values:
        parts.append(
            data_block(
                "values",
                "\n".join(
                    f'- "{clean(v.value, 80)}" is a value of {v.table}.{v.column}' for v in values
                ),
            )
        )
    if fewshot:
        parts.append(
            data_block(
                "examples",
                "\n\n".join(
                    f"Question: {clean(e['question'], 300)}\nSQL:\n{e['sql']}" for e in fewshot
                ),
            )
        )
    context: RetrievedContext = {
        "schema_block": "\n\n".join(p for p in parts if p),
        "tables": linked.tables,
        "allowed_tables": linked.all_tables,
        "metrics": [m.name for m in layer.metrics],
        "metric_types": {m.name: m.semantic_type for m in layer.metrics},
        "values": [
            {"table": v.table, "column": v.column, "value": v.value, "score": round(v.score, 3)}
            for v in values
        ],
        "fewshot": fewshot,
        "notes": layer.notes,
    }
    return {"context": context}
