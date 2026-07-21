"""Context Router Python SDK client."""

from __future__ import annotations

import os
import shutil
import subprocess
from contextlib import AsyncExitStack
from pathlib import Path
from typing import Any, Optional

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from .exceptions import ConnectionError, ContextRouterError
from .transport import parse_tool_result
from .types import (
    HandoffResult,
    RouterStatus,
    StateValue,
    Workflow,
    Workspace,
    checkpoint_from_dict,
    handoff_result_from_dict,
    router_status_from_dict,
    state_value_from_dict,
    workflow_from_dict,
    workspace_from_dict,
)


def _find_node_executable() -> str:
    node = shutil.which("node")
    if not node:
        raise ConnectionError(
            "NODE_NOT_FOUND",
            "Node.js 20+ is required to run the Context Router MCP server",
        )
    return node


def resolve_server_entry() -> str:
    """Resolve the MCP server entry point."""
    override = os.environ.get("CONTEXT_ROUTER_MCP_ENTRY")
    if override:
        return override

    node = _find_node_executable()
    result = subprocess.run(
        [
            node,
            "-e",
            "console.log(require.resolve('@context-router/mcp-server/entry'))",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode == 0 and result.stdout.strip():
        return result.stdout.strip()

    repo_root = Path(__file__).resolve().parents[4]
    fallback = repo_root / "packages" / "server" / "dist" / "index.js"
    if fallback.exists():
        return str(fallback)

    raise ConnectionError(
        "SERVER_NOT_FOUND",
        "Unable to resolve @context-router/mcp-server. Install it with npm or "
        "set CONTEXT_ROUTER_MCP_ENTRY to the server entry file.",
    )


class _WorkspaceApi:
    def __init__(self, router: ContextRouter) -> None:
        self._router = router

    async def create(self, name: str) -> Workspace:
        data = await self._router._call("workspace_create", {"name": name})
        return workspace_from_dict(data)

    async def ensure(self, name: str) -> Workspace:
        data = await self._router._call("workspace_ensure", {"name": name})
        return workspace_from_dict(data)

    async def list(self) -> list[Workspace]:
        data = await self._router._call("workspace_list", {})
        return [workspace_from_dict(item) for item in data]

    async def get(self, workspace_id: str) -> Workspace:
        data = await self._router._call("workspace_get", {"workspaceId": workspace_id})
        return workspace_from_dict(data)

    async def delete(self, workspace_id: str) -> Workspace:
        data = await self._router._call("workspace_delete", {"workspaceId": workspace_id})
        return workspace_from_dict(data)


class _SchemaApi:
    def __init__(self, router: ContextRouter) -> None:
        self._router = router

    async def create(
        self,
        workspace_id: str,
        name: str,
        fields: dict[str, Any],
        rules: Optional[list[dict[str, Any]]] = None,
    ) -> Any:
        payload: dict[str, Any] = {
            "workspaceId": workspace_id,
            "name": name,
            "fields": fields,
        }
        if rules is not None:
            payload["rules"] = rules
        return await self._router._call("schema_create", payload)

    async def get(self, workspace_id: str, name: str) -> Any:
        return await self._router._call(
            "schema_get",
            {"workspaceId": workspace_id, "name": name},
        )

    async def list(self, workspace_id: str) -> Any:
        return await self._router._call("schema_list", {"workspaceId": workspace_id})

    async def validate(
        self,
        workspace_id: str,
        schema_name: str,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        return await self._router._call(
            "schema_validate",
            {"workspaceId": workspace_id, "schemaName": schema_name, "data": data},
        )


class _AgentRoleApi:
    def __init__(self, router: ContextRouter) -> None:
        self._router = router

    async def create(
        self,
        workspace_id: str,
        name: str,
        allowed_write_keys: list[str],
        allowed_read_keys: list[str],
    ) -> Any:
        return await self._router._call(
            "agent_role_create",
            {
                "workspaceId": workspace_id,
                "name": name,
                "allowedWriteKeys": allowed_write_keys,
                "allowedReadKeys": allowed_read_keys,
            },
        )

    async def list(self, workspace_id: str) -> Any:
        return await self._router._call("agent_role_list", {"workspaceId": workspace_id})


class _WorkflowApi:
    def __init__(self, router: ContextRouter) -> None:
        self._router = router

    async def create(self, workspace_id: str) -> Workflow:
        data = await self._router._call("workflow_create", {"workspaceId": workspace_id})
        return workflow_from_dict(data)

    async def status(self, workspace_id: str, workflow_id: str) -> Workflow:
        data = await self._router._call(
            "workflow_status",
            {"workspaceId": workspace_id, "workflowId": workflow_id},
        )
        return workflow_from_dict(data)

    async def complete(self, workspace_id: str, workflow_id: str) -> Workflow:
        data = await self._router._call(
            "workflow_complete",
            {"workspaceId": workspace_id, "workflowId": workflow_id},
        )
        return workflow_from_dict(data)

    async def fail(self, workspace_id: str, workflow_id: str, reason: str) -> Workflow:
        data = await self._router._call(
            "workflow_fail",
            {
                "workspaceId": workspace_id,
                "workflowId": workflow_id,
                "reason": reason,
            },
        )
        return workflow_from_dict(data)


class _StateApi:
    def __init__(self, router: ContextRouter) -> None:
        self._router = router

    async def write(
        self,
        workspace_id: str,
        workflow_id: str,
        key: str,
        value: dict[str, Any],
        *,
        schema_name: Optional[str] = None,
        expected_version: Optional[int] = None,
        agent_role: Optional[str] = None,
        provenance: Optional[dict[str, Any]] = None,
        provenance_mode: Optional[str] = None,
    ) -> Any:
        payload: dict[str, Any] = {
            "workspaceId": workspace_id,
            "workflowId": workflow_id,
            "key": key,
            "value": value,
        }
        if schema_name is not None:
            payload["schemaName"] = schema_name
        if expected_version is not None:
            payload["expectedVersion"] = expected_version
        if agent_role is not None:
            payload["agentRole"] = agent_role
        if provenance is not None:
            payload["provenance"] = provenance
        if provenance_mode is not None:
            payload["provenanceMode"] = provenance_mode
        return await self._router._call("state_write", payload)

    async def read(
        self,
        workspace_id: str,
        workflow_id: str,
        key: str,
        *,
        agent_role: Optional[str] = None,
        unwrap: Optional[bool] = None,
    ) -> StateValue:
        payload: dict[str, Any] = {
            "workspaceId": workspace_id,
            "workflowId": workflow_id,
            "key": key,
        }
        if agent_role is not None:
            payload["agentRole"] = agent_role
        if unwrap is not None:
            payload["unwrap"] = unwrap
        data = await self._router._call("state_read", payload)
        return state_value_from_dict(data)

    async def read_many(
        self,
        workspace_id: str,
        workflow_id: str,
        keys: list[str],
        *,
        agent_role: Optional[str] = None,
        unwrap: Optional[bool] = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "workspaceId": workspace_id,
            "workflowId": workflow_id,
            "keys": keys,
        }
        if agent_role is not None:
            payload["agentRole"] = agent_role
        if unwrap is not None:
            payload["unwrap"] = unwrap
        return await self._router._call("state_read", payload)

    async def delete(self, workspace_id: str, workflow_id: str, key: str) -> Any:
        return await self._router._call(
            "state_delete",
            {"workspaceId": workspace_id, "workflowId": workflow_id, "key": key},
        )

    async def snapshot(
        self,
        workspace_id: str,
        workflow_id: str,
        *,
        agent_role: Optional[str] = None,
        unwrap: Optional[bool] = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "workspaceId": workspace_id,
            "workflowId": workflow_id,
        }
        if agent_role is not None:
            payload["agentRole"] = agent_role
        if unwrap is not None:
            payload["unwrap"] = unwrap
        return await self._router._call("state_snapshot", payload)


class _StepApi:
    def __init__(self, router: ContextRouter) -> None:
        self._router = router

    async def start(
        self,
        workspace_id: str,
        workflow_id: str,
        step_id: str,
        execution_id: str,
        agent_id: Optional[str] = None,
    ) -> Any:
        payload: dict[str, Any] = {
            "workspaceId": workspace_id,
            "workflowId": workflow_id,
            "stepId": step_id,
            "executionId": execution_id,
        }
        if agent_id is not None:
            payload["agentId"] = agent_id
        return await self._router._call("step_run_start", payload)

    async def complete(
        self,
        workspace_id: str,
        workflow_id: str,
        step_id: str,
        execution_id: str,
        result: Optional[dict[str, Any]] = None,
    ) -> Any:
        payload: dict[str, Any] = {
            "workspaceId": workspace_id,
            "workflowId": workflow_id,
            "stepId": step_id,
            "executionId": execution_id,
        }
        if result is not None:
            payload["result"] = result
        return await self._router._call("step_run_complete", payload)

    async def fail(
        self,
        workspace_id: str,
        workflow_id: str,
        step_id: str,
        execution_id: str,
        reason: str,
    ) -> Any:
        return await self._router._call(
            "step_run_fail",
            {
                "workspaceId": workspace_id,
                "workflowId": workflow_id,
                "stepId": step_id,
                "executionId": execution_id,
                "reason": reason,
            },
        )


class _CheckpointApi:
    def __init__(self, router: ContextRouter) -> None:
        self._router = router

    async def create(
        self,
        workspace_id: str,
        workflow_id: str,
        *,
        label: Optional[str] = None,
    ) -> Any:
        payload: dict[str, Any] = {
            "workspaceId": workspace_id,
            "workflowId": workflow_id,
        }
        if label is not None:
            payload["label"] = label
        return await self._router._call("checkpoint_create", payload)

    async def list(self, workspace_id: str, workflow_id: str) -> list[Any]:
        data = await self._router._call(
            "checkpoint_list",
            {"workspaceId": workspace_id, "workflowId": workflow_id},
        )
        return [checkpoint_from_dict(item) for item in data]

    async def restore(self, workspace_id: str, checkpoint_id: str) -> Any:
        return await self._router._call(
            "checkpoint_restore",
            {"workspaceId": workspace_id, "checkpointId": checkpoint_id},
        )

    async def delete(self, workspace_id: str, checkpoint_id: str) -> Any:
        return await self._router._call(
            "checkpoint_delete",
            {"workspaceId": workspace_id, "checkpointId": checkpoint_id},
        )


class _HandoffApi:
    def __init__(self, router: ContextRouter) -> None:
        self._router = router

    async def generate(
        self,
        workspace_id: str,
        workflow_id: str,
        *,
        keys: Optional[list[str]] = None,
        max_tokens: Optional[int] = None,
        agent_role: Optional[str] = None,
        priority_keys: Optional[list[str]] = None,
        next_goals: Optional[list[str]] = None,
        format: Optional[str] = None,
    ) -> HandoffResult:
        payload: dict[str, Any] = {
            "workspaceId": workspace_id,
            "workflowId": workflow_id,
        }
        if keys is not None:
            payload["keys"] = keys
        if max_tokens is not None:
            payload["maxTokens"] = max_tokens
        if agent_role is not None:
            payload["agentRole"] = agent_role
        if priority_keys is not None:
            payload["priorityKeys"] = priority_keys
        if next_goals is not None:
            payload["nextGoals"] = next_goals
        if format is not None:
            payload["format"] = format
        data = await self._router._call("handoff_generate", payload)
        return handoff_result_from_dict(data)

    async def apply(
        self,
        workspace_id: str,
        workflow_id: str,
        *,
        keys: Optional[list[str]] = None,
        prefix: Optional[str] = None,
        max_tokens: Optional[int] = None,
        agent_role: Optional[str] = None,
        priority_keys: Optional[list[str]] = None,
        next_goals: Optional[list[str]] = None,
        format: Optional[str] = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "workspaceId": workspace_id,
            "workflowId": workflow_id,
        }
        if keys is not None:
            payload["keys"] = keys
        if prefix is not None:
            payload["prefix"] = prefix
        if max_tokens is not None:
            payload["maxTokens"] = max_tokens
        if agent_role is not None:
            payload["agentRole"] = agent_role
        if priority_keys is not None:
            payload["priorityKeys"] = priority_keys
        if next_goals is not None:
            payload["nextGoals"] = next_goals
        if format is not None:
            payload["format"] = format
        return await self._router._call("handoff_apply", payload)


class ContextRouter:
    """Python SDK for Context Router MCP server."""

    def __init__(
        self,
        *,
        data_dir: Optional[str] = None,
        database_url: Optional[str] = None,
        owner_id: Optional[str] = None,
    ) -> None:
        if data_dir and database_url:
            raise ValueError("data_dir and database_url cannot be used together")
        self._data_dir = data_dir
        self._database_url = database_url
        self._owner_id = owner_id
        self._session: Optional[ClientSession] = None
        self._exit_stack = AsyncExitStack()
        self._connected = False

        self.workspace = _WorkspaceApi(self)
        self.schema = _SchemaApi(self)
        self.agent_role = _AgentRoleApi(self)
        self.workflow = _WorkflowApi(self)
        self.state = _StateApi(self)
        self.step = _StepApi(self)
        self.checkpoint = _CheckpointApi(self)
        self.handoff = _HandoffApi(self)

    async def __aenter__(self) -> ContextRouter:
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        await self.close()

    @classmethod
    async def local(
        cls,
        *,
        data_dir: Optional[str] = None,
        database_url: Optional[str] = None,
        owner_id: Optional[str] = None,
    ) -> ContextRouter:
        router = cls(data_dir=data_dir, database_url=database_url, owner_id=owner_id)
        await router.connect()
        return router

    def _build_env(self) -> dict[str, str]:
        env = {key: value for key, value in os.environ.items() if value is not None}
        if self._data_dir:
            env.pop("DATABASE_URL", None)
            env["STORAGE_ENGINE"] = "sqlite"
            env["CONTEXT_ROUTER_DATA_DIR"] = self._data_dir
        elif self._database_url:
            env.pop("CONTEXT_ROUTER_DATA_DIR", None)
            env.pop("STORAGE_ENGINE", None)
            env["DATABASE_URL"] = self._database_url
        if self._owner_id:
            env["CONTEXT_ROUTER_OWNER_ID"] = self._owner_id
        return env

    async def connect(
        self,
        command: Optional[str] = None,
        args: Optional[list[str]] = None,
        env: Optional[dict[str, str]] = None,
    ) -> None:
        if self._connected:
            return

        node = command or _find_node_executable()
        launch_args = args if args is not None else [resolve_server_entry()]

        merged_env = self._build_env()
        if env:
            merged_env.update(env)

        server_params = StdioServerParameters(
            command=node,
            args=launch_args,
            env=merged_env,
        )

        stack = AsyncExitStack()
        try:
            read_stream, write_stream = await stack.enter_async_context(
                stdio_client(server_params),
            )
            session = await stack.enter_async_context(
                ClientSession(read_stream, write_stream),
            )
            await session.initialize()
        except Exception:
            await stack.aclose()
            raise

        self._exit_stack = stack
        self._session = session
        self._connected = True

    async def close(self) -> None:
        if not self._connected:
            return
        await self._exit_stack.aclose()
        self._session = None
        self._connected = False
        self._exit_stack = AsyncExitStack()

    async def start(self, workspace_name: str) -> WorkflowSession:
        from .session import WorkflowSession

        workspace = await self.workspace.ensure(workspace_name)
        workflow = await self.workflow.create(workspace.id)
        return WorkflowSession(self, workspace, workflow)

    async def status(self) -> RouterStatus:
        data = await self._call("router_status", {})
        return router_status_from_dict(data)

    async def discover_tools(self) -> list[str]:
        if not self._session:
            raise ConnectionError("NOT_CONNECTED", "ContextRouter is not connected")
        result = await self._session.list_tools()
        return [tool.name for tool in result.tools]

    async def _call(self, tool: str, args: dict[str, Any]) -> Any:
        if not self._session:
            raise ConnectionError(
                "NOT_CONNECTED",
                "ContextRouter is not connected. Call connect() first.",
            )
        result = await self._session.call_tool(tool, arguments=args)
        return parse_tool_result(result)
