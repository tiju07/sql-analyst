from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)


def async_url(dsn: str) -> str:
    """Env holds plain postgresql:// DSNs; SQLAlchemy needs the asyncpg driver spelled out."""
    for prefix in ("postgresql://", "postgres://"):
        if dsn.startswith(prefix):
            return "postgresql+asyncpg://" + dsn.removeprefix(prefix)
    return dsn


def make_engine(dsn: str) -> AsyncEngine:
    return create_async_engine(async_url(dsn), pool_pre_ping=True)


def session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)
