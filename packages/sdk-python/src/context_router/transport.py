"""MCP transport helpers for Context Router Python SDK."""

from __future__ import annotations

import json
from typing import Any

from .exceptions import ContextRouterError


def parse_tool_result(result: Any) -> Any:
    """Parse an MCP tool result into Context Router envelope data."""
    content = getattr(result, "content", None)
    if not content:
        raise ContextRouterError("INVALID_RESPONSE", "MCP tool returned no content")

    text: str | None = None
    for item in content:
        item_type = getattr(item, "type", None)
        if item_type == "text":
            text = getattr(item, "text", None)
            break

    if not text:
        raise ContextRouterError("INVALID_RESPONSE", "MCP tool returned no text")

    try:
        envelope = json.loads(text)
    except json.JSONDecodeError as error:
        raise ContextRouterError(
            "INVALID_RESPONSE",
            "MCP tool returned invalid JSON",
            text,
        ) from error

    if not envelope.get("success", False):
        error = envelope.get("error", {})
        raise ContextRouterError(
            error.get("code", "UNKNOWN"),
            error.get("message", "Unknown error"),
            error.get("details"),
        )

    return envelope.get("data")
