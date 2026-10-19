from functools import lru_cache
from typing import Literal

from pydantic import PostgresDsn, RedisDsn, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Single source of truth for the product name (frontend reads it from /api/health).
PRODUCT_NAME = "SQL Analyst"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"), extra="ignore", env_ignore_empty=True
    )

    app_database_url: PostgresDsn
    # Read-only role (analyst_ro); the only credentials the agent ever uses on the target DB.
    target_database_url: PostgresDsn
    # Schema in the target DB that the agent may query (the guard's allow-list comes from it).
    target_schema: str = "olist"
    redis_url: RedisDsn = RedisDsn("redis://localhost:6379/0")

    session_secret: SecretStr
    # HMAC key that signs app.allowed_states; must match the value stored in the target DB.
    rls_signing_secret: SecretStr
    demo_login_enabled: bool = True
    # Browsers accept Secure cookies on http://localhost, so this stays on in dev too.
    cookie_secure: bool = True

    llm_provider: Literal["anthropic", "openai_compat"] = "anthropic"
    anthropic_api_key: SecretStr | None = None
    llm_model_sql: str = "claude-sonnet-5-5"
    llm_model_fast: str = "claude-haiku-5-5"
    llm_effort_sql: Literal["low", "medium", "high"] = "medium"
    openai_compat_base_url: str | None = None
    openai_compat_api_key: SecretStr | None = None
    openai_compat_model: str | None = None

    embedding_provider: Literal["fastembed", "openai_compat", "fake"] = "fastembed"
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_dim: int = 384
    fastembed_cache_dir: str | None = None

    n_candidates: int = 3
    max_repairs: int = 2
    statement_timeout_ms: int = 10_000
    row_limit: int = 1000
    explain_cost_limit: float | None = None

    rate_limit_per_min: int = 10
    daily_llm_budget_usd: float = 5.0
    fake_llm: bool = False

    otel_exporter_otlp_endpoint: str | None = None
    langfuse_public_key: str | None = None
    langfuse_secret_key: SecretStr | None = None

    mcp_api_token: SecretStr | None = None
    mcp_persona: Literal["admin", "analyst", "regional"] = "analyst"

    @field_validator("session_secret", "rls_signing_secret")
    @classmethod
    def _long_enough(cls, v: SecretStr) -> SecretStr:
        if len(v.get_secret_value()) < 32:
            raise ValueError("must be at least 32 characters (`make env` generates one)")
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
