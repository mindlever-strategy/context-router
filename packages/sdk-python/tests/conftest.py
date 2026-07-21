"""Shared pytest fixtures for Context Router Python SDK."""

from __future__ import annotations

import shutil
import uuid
from pathlib import Path

import pytest

from context_router.client import resolve_server_entry


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "integration: tests that require Node.js and a built MCP server",
    )


@pytest.fixture(scope="session")
def node_available() -> bool:
    return shutil.which("node") is not None


@pytest.fixture(scope="session")
def server_available(node_available: bool) -> bool:
    if not node_available:
        return False
    try:
        resolve_server_entry()
        return True
    except Exception:
        return False


@pytest.fixture
def temp_data_dir(tmp_path: Path) -> Path:
    return tmp_path / f"context-router-{uuid.uuid4().hex}"


@pytest.fixture
def skip_without_server(server_available: bool) -> None:
    if not server_available:
        pytest.skip(
            "Node.js and a built @context-router/mcp-server entry are required",
        )
