"""Tests for WorkflowSession."""

from __future__ import annotations

import pytest

from context_router import ContextRouter


@pytest.mark.integration
async def test_get_many(temp_data_dir, skip_without_server) -> None:
    async with await ContextRouter.local(data_dir=str(temp_data_dir)) as router:
        flow = await router.start("multi-state-test")

        await flow.set("key1", {"a": 1})
        await flow.set("key2", {"b": 2})

        values = await flow.get_many(["key1", "key2"])
        assert values["key1"] == {"a": 1}
        assert values["key2"] == {"b": 2}

        await flow.complete()


@pytest.mark.integration
async def test_fail_workflow(temp_data_dir, skip_without_server) -> None:
    async with await ContextRouter.local(data_dir=str(temp_data_dir)) as router:
        flow = await router.start("fail-test")
        failed = await flow.fail("demo failure")
        assert failed.status.value == "FAILED"
