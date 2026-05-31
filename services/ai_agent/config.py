"""AI Agent Service configuration."""

from functools import lru_cache

from pydantic_settings import BaseSettings


class AIAgentSettings(BaseSettings):
    # Service
    service_name: str = "ai-agent"
    service_port: int = 8005
    environment: str = "development"
    debug: bool = False
    log_level: str = "INFO"

    # AI provider — "gemini" (free) or "claude" (paid)
    ai_provider: str = "gemini"
    max_tokens: int = 4096
    temperature: float = 0.1
    agent_timeout_seconds: int = 120

    # Gemini (free tier)
    gemini_api_key: str = ""
    gemini_model: str = "gemini-1.5-flash"

    # Claude / Anthropic (paid, switch when ready)
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-6"

    # Database
    database_url: str = "postgresql+asyncpg://trader:trader_pass@localhost:5432/trading_db"
    database_pool_size: int = 5
    database_max_overflow: int = 10
    database_ssl: bool = False

    # Redis
    redis_url: str = "redis://localhost:6379/0"
    redis_max_connections: int = 20

    # Internal service URLs
    market_data_service_url: str = "http://market-data:8001"
    strategy_engine_url: str = "http://strategy-engine:8002"
    risk_management_url: str = "http://risk-management:8003"
    execution_engine_url: str = "http://execution-engine:8004"
    monitoring_url: str = "http://monitoring:8006"

    # Broker
    alpaca_api_key: str = ""
    alpaca_secret_key: str = ""
    alpaca_base_url: str = "https://paper-api.alpaca.markets"

    # Security
    secret_key: str = "dev_secret_key_change_in_production"

    model_config = {"env_file": ".env", "case_sensitive": False, "extra": "ignore"}


@lru_cache
def get_settings() -> AIAgentSettings:
    return AIAgentSettings()
