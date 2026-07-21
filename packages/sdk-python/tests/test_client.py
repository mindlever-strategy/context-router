"""Integration tests for Context Router Python SDK client."""

from __future__ import annotations

import pytest

from context_router import ContextRouter


@pytest.mark.integration
async def test_local_connection(temp_data_dir, skip_without_server) -> None:
    async with await ContextRouter.local(data_dir=str(temp_data_dir)) as router:
        workspace = await router.workspace.ensure("test-workspace")
        assert workspace.name == "test-workspace"


@pytest.mark.integration
async def test_workflow_lifecycle(temp_data_dir, skip_without_server) -> None:
    async with await ContextRouter.local(data_dir=str(temp_data_dir)) as router:
        flow = await router.start("test-workflow")
        await flow.set("key", {"value": 42})
        result = await flow.get("key")
        assert result.value == {"value": 42}
        assert result.version == 1
        await flow.complete()


@pytest.mark.integration
async def test_checkpoint_and_handoff(temp_data_dir, skip_without_server) -> None:
    async with await ContextRouter.local(data_dir=str(temp_data_dir)) as router:
        flow = await router.start("test-checkpoints")
        await flow.set("data", {"content": "test"})
        await flow.checkpoint("test-label")

        handoff = await flow.handoff(keys=["data"])
        assert "test" in handoff.summary

        await flow.complete()


@pytest.mark.integration
async def test_discover_tools(temp_data_dir, skip_without_server) -> None:
    async with await ContextRouter.local(data_dir=str(temp_data_dir)) as router:
        tools = await router.discover_tools()
        assert len(tools) == 29


@pytest.mark.integration
async def test_router_status(temp_data_dir, skip_without_server) -> None:
    async with await ContextRouter.local(data_dir=str(temp_data_dir)) as router:
        status = await router.status()
        assert status.version
        assert status.storage["engine"] == "sqlite"
