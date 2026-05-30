"""Base agent class — provider-agnostic (Gemini, Claude, etc.)."""

import json
from abc import ABC, abstractmethod
from typing import Any

import structlog

from services.ai_agent.services.ai_provider import AIProvider, get_ai_provider

logger = structlog.get_logger(__name__)


class BaseAgent(ABC):
    """
    Abstract base agent powered by a configurable AI provider.

    Switch provider by setting AI_PROVIDER in .env:
      AI_PROVIDER=gemini   (default, free)
      AI_PROVIDER=claude   (paid, production)
    """

    def __init__(self, name: str, agent_type: str) -> None:
        self.name = name
        self.agent_type = agent_type
        self._provider: AIProvider = get_ai_provider()

    @property
    @abstractmethod
    def system_prompt(self) -> str:
        """System prompt for this agent."""
        ...

    @property
    def tools(self) -> list[dict[str, Any]]:
        """Tool definitions available to this agent."""
        return []

    @abstractmethod
    async def run(self, context: dict[str, Any]) -> dict[str, Any]:
        """Execute agent logic and return decision dict."""
        ...

    async def execute_tool(self, tool_name: str, tool_input: dict[str, Any]) -> Any:
        """Execute a named tool. Override in subclasses."""
        logger.warning("Tool not implemented", agent=self.name, tool=tool_name)
        return {"error": f"Tool '{tool_name}' not implemented in {self.name}"}

    def _format_context(self, context: dict[str, Any]) -> str:
        return f"Current context:\n{json.dumps(context, indent=2, default=str)}"

    async def _decide(
        self,
        user_message: str,
        additional_context: dict[str, Any] | None = None,
    ) -> tuple[str, list[dict]]:
        """Make a decision using the configured AI provider."""
        if self.tools:
            return await self._provider.chat_with_tools(
                system_prompt=self.system_prompt,
                user_message=user_message,
                tools=self.tools,
                tool_executor=self.execute_tool,
            )
        else:
            response = await self._provider.chat(
                system_prompt=self.system_prompt,
                messages=[{"role": "user", "content": user_message}],
            )
            return self._provider.extract_text(response), []
