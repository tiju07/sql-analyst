"""Long-lived resources shared by the API, the worker and the MCP server."""

from dataclasses import dataclass

import asyncpg
from arq import create_pool
from arq.connections import ArqRedis, RedisSettings
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.config import Settings
from app.db import make_engine, session_factory
from app.llm.anthropic_client import AnthropicClient
from app.llm.client import LLMClient
from app.llm.fake_client import FakeLLM
from app.llm.openai_compat_client import OpenAICompatClient
from app.retrieval.embeddings import Embedder, FakeEmbedder, FastEmbedder, OpenAICompatEmbedder
from app.sql.executor import PostgresExecutor


def build_llm(s: Settings) -> LLMClient:
    if s.fake_llm:
        return FakeLLM()
    if s.llm_provider == "openai_compat":
        return OpenAICompatClient(
            s.openai_compat_base_url,
            s.openai_compat_api_key.get_secret_value() if s.openai_compat_api_key else None,
            s.openai_compat_model,
        )
    return AnthropicClient(s.anthropic_api_key.get_secret_value() if s.anthropic_api_key else None)


def build_embedder(s: Settings) -> Embedder:
    match s.embedding_provider:
        case "fake":
            return FakeEmbedder(s.embedding_dim)
        case "openai_compat":
            key = s.openai_compat_api_key.get_secret_value() if s.openai_compat_api_key else None
            return OpenAICompatEmbedder(
                s.embedding_model, s.embedding_dim, s.openai_compat_base_url, key
            )
        case "fastembed":
            return FastEmbedder(s.embedding_model, s.embedding_dim, s.fastembed_cache_dir)


@dataclass
class Runtime:
    settings: Settings
    app_engine: AsyncEngine
    sessions: async_sessionmaker[AsyncSession]
    target_pool: asyncpg.Pool
    executor: PostgresExecutor
    redis: Redis
    arq: ArqRedis  # job queue (catalog sync)
    llm: LLMClient
    embedder: Embedder

    @classmethod
    async def create(cls, s: Settings) -> Runtime:
        engine = make_engine(str(s.app_database_url))
        pool = await asyncpg.create_pool(str(s.target_database_url), min_size=1, max_size=10)
        return cls(
            settings=s,
            app_engine=engine,
            sessions=session_factory(engine),
            target_pool=pool,
            executor=PostgresExecutor(pool, s.rls_signing_secret.get_secret_value()),
            redis=Redis.from_url(str(s.redis_url)),
            arq=await create_pool(RedisSettings.from_dsn(str(s.redis_url))),
            llm=build_llm(s),
            embedder=build_embedder(s),
        )

    async def close(self) -> None:
        await self.redis.aclose()
        await self.arq.aclose()
        await self.target_pool.close()
        await self.app_engine.dispose()
