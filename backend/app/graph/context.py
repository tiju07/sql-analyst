import uuid

from app.graph.state import AgentConfig, AgentContext
from app.llm.metered import MeteredLLM
from app.runtime import Runtime
from app.sql.dialects import Dialect
from app.sql.executor import Executor


def agent_config(rt: Runtime) -> AgentConfig:
    s = rt.settings
    return AgentConfig(
        n_candidates=s.n_candidates,
        max_repairs=s.max_repairs,
        row_limit=s.row_limit,
        statement_timeout_ms=s.statement_timeout_ms,
        explain_cost_limit=s.explain_cost_limit,
        model_sql=s.llm_model_sql,
        model_fast=s.llm_model_fast,
        effort_sql=s.llm_effort_sql,
    )


def agent_context(
    rt: Runtime,
    connection_id: uuid.UUID,
    *,
    config: AgentConfig | None = None,
    executor: Executor | None = None,
    dialect: Dialect = Dialect.postgres,
    default_schema: str | None = None,
) -> AgentContext:
    """Fresh per run: MeteredLLM accumulates this run's usage."""
    s = rt.settings
    return AgentContext(
        connection_id=connection_id,
        dialect=dialect,
        default_schema=default_schema if executor else s.target_schema,
        executor=executor or rt.executor,
        sessions=rt.sessions,
        redis=rt.redis,
        llm=MeteredLLM(
            rt.llm,
            rt.redis,
            daily_budget_usd=s.daily_llm_budget_usd,
            run_token_cap=s.run_token_cap,
            provider="fake" if s.fake_llm else s.llm_provider,
        ),
        embedder=rt.embedder,
        config=config or agent_config(rt),
    )
