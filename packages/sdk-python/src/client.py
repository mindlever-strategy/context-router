import json
import os
from typing import Any, Optional
from mcp import ClientSession

class ContextRouter:
    def __init__(self, api_key: str, workspace_id: str):
        self.api_key = api_key
        self.workspace_id = workspace_id
        self.session: Optional[ClientSession] = None
        self.current_workflow_id: Optional[str] = None

    async def connect(self):
        """Connect to MCP server"""
        # For stdio connection, use MCP ClientSession
        pass

    async def _call_tool(self, name: str, arguments: dict) -> Any:
        """Internal method to call MCP tool"""
        if not self.session:
            raise RuntimeError("Not connected. Call connect() first.")

        result = await self.session.call_tool(name, arguments)
        return json.loads(result.content[0].text)

    @property
    def schema(self):
        return SchemaAPI(self)

    @property
    def state(self):
        return StateAPI(self)

    @property
    def checkpoint(self):
        return CheckpointAPI(self)

    @property
    def handoff(self):
        return HandoffAPI(self)

    @property
    def workflow(self):
        return WorkflowAPI(self)

    def _get_workflow_id(self) -> str:
        """Get or create current workflow ID"""
        if not self.current_workflow_id:
            raise RuntimeError("No active workflow. Call workflow.create() first.")
        return self.current_workflow_id


class SchemaAPI:
    def __init__(self, client: ContextRouter):
        self.client = client

    async def create(self, name: str, fields: dict) -> dict:
        return await self.client._call_tool("schema_create", {
            "workspaceId": self.client.workspace_id,
            "name": name,
            "fields": fields
        })

    async def get(self, name: str) -> dict:
        return await self.client._call_tool("schema_get", {
            "workspaceId": self.client.workspace_id,
            "name": name
        })

    async def list(self) -> list:
        return await self.client._call_tool("schema_list", {
            "workspaceId": self.client.workspace_id
        })

    async def validate(self, schema_name: str, data: dict) -> dict:
        return await self.client._call_tool("schema_validate", {
            "workspaceId": self.client.workspace_id,
            "schemaName": schema_name,
            "data": data
        })


class StateAPI:
    def __init__(self, client: ContextRouter):
        self.client = client

    async def write(self, key: str, value: Any, schema_name: Optional[str] = None) -> dict:
        return await self.client._call_tool("state_write", {
            "workspaceId": self.client.workspace_id,
            "workflowId": self.client._get_workflow_id(),
            "key": key,
            "value": value,
            "schemaName": schema_name
        })

    async def read(self, key: str, fields: Optional[list] = None) -> Any:
        result = await self.client._call_tool("state_read", {
            "workflowId": self.client._get_workflow_id(),
            "key": key,
            "fields": fields
        })
        return result.get("value", result)

    async def delete(self, key: str) -> dict:
        return await self.client._call_tool("state_delete", {
            "workflowId": self.client._get_workflow_id(),
            "key": key
        })

    async def snapshot(self) -> dict:
        return await self.client._call_tool("state_snapshot", {
            "workflowId": self.client._get_workflow_id()
        })


class CheckpointAPI:
    def __init__(self, client: ContextRouter):
        self.client = client

    async def create(self, workflow_id: str, label: Optional[str] = None) -> dict:
        return await self.client._call_tool("checkpoint_create", {
            "workspaceId": self.client.workspace_id,
            "workflowId": workflow_id,
            "label": label
        })

    async def list(self, workflow_id: str) -> list:
        return await self.client._call_tool("checkpoint_list", {
            "workflowId": workflow_id
        })

    async def restore(self, checkpoint_id: str) -> dict:
        return await self.client._call_tool("checkpoint_restore", {
            "checkpointId": checkpoint_id
        })


class HandoffAPI:
    def __init__(self, client: ContextRouter):
        self.client = client

    async def generate(self, keys: Optional[list] = None, max_tokens: int = 200) -> str:
        result = await self.client._call_tool("handoff_generate", {
            "workflowId": self.client._get_workflow_id(),
            "keys": keys,
            "maxTokens": max_tokens
        })
        return result if isinstance(result, str) else json.dumps(result)

    async def apply(self, keys: Optional[list] = None, prefix: Optional[str] = None, max_tokens: int = 200) -> str:
        result = await self.client._call_tool("handoff_apply", {
            "workflowId": self.client._get_workflow_id(),
            "keys": keys,
            "prefix": prefix,
            "maxTokens": max_tokens
        })
        return result if isinstance(result, str) else json.dumps(result)


class WorkflowAPI:
    def __init__(self, client: ContextRouter):
        self.client = client

    async def create(self) -> dict:
        result = await self.client._call_tool("workflow_create", {
            "workspaceId": self.client.workspace_id
        })
        self.client.current_workflow_id = result["id"]
        return result

    async def status(self, workflow_id: str) -> dict:
        return await self.client._call_tool("workflow_status", {
            "workflowId": workflow_id
        })

    async def complete(self, workflow_id: str) -> dict:
        return await self.client._call_tool("workflow_complete", {
            "workflowId": workflow_id,
            "workspaceId": self.client.workspace_id
        })

    async def fail(self, workflow_id: str, reason: str) -> dict:
        return await self.client._call_tool("workflow_fail", {
            "workflowId": workflow_id,
            "reason": reason,
            "workspaceId": self.client.workspace_id
        })
