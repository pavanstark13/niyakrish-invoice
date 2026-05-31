"""Strategy Engine Service - FastAPI application entry point."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import make_asgi_app

from services.strategy_engine.api.v1.router import router
from services.strategy_engine.config import get_settings
from shared.logging_config import configure_logging
from shared.middleware import LoggingMiddleware, RequestIDMiddleware, TimingMiddleware

settings = get_settings()
configure_logging(settings.log_level, settings.service_name)
logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Starting Strategy Engine Service")

    try:
        from shared.database import engine  # noqa: PLC0415
        import sqlalchemy  # noqa: PLC0415
        async with engine.connect() as conn:
            await conn.execute(sqlalchemy.text("SELECT 1"))
        logger.info("Database connected")
    except Exception as e:
        logger.warning("Database connection failed — continuing", error=str(e))

    try:
        from shared.redis_client import get_redis_client  # noqa: PLC0415
        await get_redis_client().ping()
        logger.info("Redis connected")
    except Exception as e:
        logger.warning("Redis connection failed — continuing", error=str(e))

    logger.info("Strategy Engine Service ready")
    yield

    try:
        from shared.database import engine  # noqa: PLC0415
        await engine.dispose()
    except Exception:
        pass
    try:
        from shared.redis_client import close_redis_pool  # noqa: PLC0415
        await close_redis_pool()
    except Exception:
        pass


app = FastAPI(title="Strategy Engine", description="Trading strategy execution and signal generation", version="0.1.0", lifespan=lifespan)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.add_middleware(LoggingMiddleware)
app.add_middleware(TimingMiddleware)
app.add_middleware(RequestIDMiddleware)

app.include_router(router, prefix="/api/v1")
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)


@app.get("/")
async def root() -> dict:
    return {"service": "strategy-engine", "status": "running", "version": "0.1.0"}
