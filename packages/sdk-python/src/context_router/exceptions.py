"""Exception types for Context Router Python SDK."""

from typing import Any


class ContextRouterError(Exception):
    """Base exception for Context Router errors."""

    def __init__(
        self,
        code: str,
        message: str,
        details: Any = None,
    ) -> None:
        self.code = code
        self.message = message
        self.details = details
        super().__init__(f"[{code}] {message}")


class ConnectionError(ContextRouterError):
    """Raised when connection to MCP server fails."""


class WorkflowNotFoundError(ContextRouterError):
    """Raised when a workflow is not found."""


class WorkspaceNotFoundError(ContextRouterError):
    """Raised when a workspace is not found."""
