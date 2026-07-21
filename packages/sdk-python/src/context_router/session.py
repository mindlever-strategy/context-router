"""Workflow session for Context Router Python SDK."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional

from .types import (
    HandoffResult,
    StateValue,
    Workflow,
    Workspace,
    state_value_from_dict,
)

if TYPE_CHECKING:
    from .client import ContextRouter


class WorkflowSession:
    """
    High-level workflow session API.

    Usage:
        flow = await router.start("My Workspace")
        await flow.set("key", {"data": "value"})
        result = await flow.get("key")
        await flow.checkpoint("before-merge")
        handoff = await flow.handoff(keys=["key"])
        await flow.complete()
    """

    def __init__(
        self,
        router: ContextRouter,
        workspace: Workspace,
        workflow: Workflow,
    ) -> None:
        self.router = router
        self.workspace = workspace
        self.workflow = workflow

    async def set(
        self,
        key: str,
        value: dict[str, Any],
        *,
        schema_name: Optional[str] = None,
        expected_version: Optional[int] = None,
        agent_role: Optional[str] = None,
        provenance: Optional[dict[str, Any]] = None,
        provenance_mode: Optional[str] = None,
    ) -> StateValue:
        result = await self.router.state.write(
            self.workspace.id,
            self.workflow.id,
            key,
            value,
            schema_name=schema_name,
            expected_version=expected_version,
            agent_role=agent_role,
            provenance=provenance,
            provenance_mode=provenance_mode,
        )
        return state_value_from_dict(result["state"])

    async def get(
        self,
        key: str,
        *,
        agent_role: Optional[str] = None,
        unwrap: Optional[bool] = None,
    ) -> StateValue:
        return await self.router.state.read(
            self.workspace.id,
            self.workflow.id,
            key,
            agent_role=agent_role,
            unwrap=unwrap,
        )

    async def get_many(
        self,
        keys: list[str],
        *,
        agent_role: Optional[str] = None,
        unwrap: Optional[bool] = None,
    ) -> dict[str, Any]:
        result = await self.router.state.read_many(
            self.workspace.id,
            self.workflow.id,
            keys,
            agent_role=agent_role,
            unwrap=unwrap,
        )
        return result["values"]

    async def checkpoint(self, label: Optional[str] = None) -> Any:
        return await self.router.checkpoint.create(
            self.workspace.id,
            self.workflow.id,
            label=label,
        )

    async def handoff(
        self,
        *,
        keys: Optional[list[str]] = None,
        max_tokens: Optional[int] = None,
        agent_role: Optional[str] = None,
        priority_keys: Optional[list[str]] = None,
        next_goals: Optional[list[str]] = None,
        format: Optional[str] = None,
    ) -> HandoffResult:
        return await self.router.handoff.generate(
            self.workspace.id,
            self.workflow.id,
            keys=keys,
            max_tokens=max_tokens,
            agent_role=agent_role,
            priority_keys=priority_keys,
            next_goals=next_goals,
            format=format,
        )

    async def complete(self) -> Workflow:
        return await self.router.workflow.complete(
            self.workspace.id,
            self.workflow.id,
        )

    async def fail(self, reason: str) -> Workflow:
        return await self.router.workflow.fail(
            self.workspace.id,
            self.workflow.id,
            reason,
        )
