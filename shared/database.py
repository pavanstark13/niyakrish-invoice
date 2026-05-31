"""Async SQLAlchemy engine and session factory."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from shared.config import get_settings

settings = get_settings()

# Detect SSL requirement from URL scheme (neon = require, local = no ssl)
def _build_connect_args() -> dict[str, Any]:
    url = settings.database_url
    if "neon.tech" in url or "sslmode=require" in url or "ssl=require" in url:
        return {"ssl": "require"}
    return {}

# Lazy engine — created on first use, not at import time
_engine = None
_session_factory = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            settings.database_url,
            pool_size=settings.database_pool_size,
            max_overflow=settings.database_max_overflow,
            pool_pre_ping=True,
            echo=settings.debug,
            connect_args=_build_connect_args(),
        )
    return _engine


# Keep `engine` as a module-level alias for backward compat
class _LazyEngine:
    def __getattr__(self, name):
        return getattr(get_engine(), name)

    async def connect(self):
        return get_engine().connect()

    async def dispose(self):
        return await get_engine().dispose()

    def begin(self):
        return get_engine().begin()


engine = _LazyEngine()


def get_session_factory() -> async_sessionmaker:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )
    return _session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for database sessions."""
    async with get_session_factory()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    """Context manager for database sessions outside FastAPI."""
    async with get_session_factory()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def create_tables() -> None:
    from shared.models.base import Base  # noqa: PLC0415
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def drop_tables() -> None:
    from shared.models.base import Base  # noqa: PLC0415
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
