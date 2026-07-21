# Implementation Plan — v0.3 to v0.4

**Status:** Planning  
**Date:** 2026-07-21  
**Goal:** Complete adoptability improvements before public launch

---

## Overview

This plan covers all three remaining priorities:

1. **Workflow Templates** — 2 additional examples (parallel-merge, retry-recovery)
2. **Python SDK** — Complete and publishable client library
3. **Polish** — CLI enhancements and quickstart tooling

---

## Priority 1: Workflow Templates

### 1.1 Parallel Merge Example (`examples/parallel-merge.ts`)

**Pattern:** Fan-out to multiple agents, then merge results

```
       → Agent B ─┐
Agent A ─┤        ├→ Agent D
       → Agent C ─┘
```

**Use Case:** Research pipeline where one agent gathers data, three agents analyze different aspects in parallel, then a synthesizer combines findings.

**Implementation:**

```typescript
import { ContextRouter } from '@context-router/sdk';

async function gatherData() {
  return { raw: ['item1', 'item2', 'item3'] };
}

async function analyzeAspectA(data: any) {
  return { aspect: 'A', result: `Analysis A on ${data.raw.length} items` };
}

async function analyzeAspectB(data: any) {
  return { aspect: 'B', result: `Analysis B on ${data.raw.length} items` };
}

async function analyzeAspectC(data: any) {
  return { aspect: 'C', result: `Analysis C on ${data.raw.length} items` };
}

async function synthesize(results: any[]) {
  return {
    summary: `Combined ${results.length} analyses`,
    conclusions: results.map((r) => r.result),
  };
}

const router = await ContextRouter.local();

try {
  const flow = await router.start('Parallel research');

  // Step 1: Gather data
  await flow.set('data', await gatherData());

  // Step 2: Fan out to 3 agents in parallel
  const [analysisA, analysisB, analysisC] = await Promise.all([
    analyzeAspectA((await flow.get('data')).value),
    analyzeAspectB((await flow.get('data')).value),
    analyzeAspectC((await flow.get('data')).value),
  ]);

  // Step 3: Store all results
  await flow.set('analysisA', analysisA);
  await flow.set('analysisB', analysisB);
  await flow.set('analysisC', analysisC);

  // Step 4: Create checkpoint before synthesis
  await flow.checkpoint('pre-synthesis');

  // Step 5: Synthesize (hand off only the analyses)
  const handoff = await flow.handoff({
    keys: ['analysisA', 'analysisB', 'analysisC'],
    maxTokens: 200,
  });
  await flow.set(
    'synthesis',
    await synthesize([analysisA, analysisB, analysisC]),
  );

  await flow.complete();
  console.log((await flow.get('synthesis')).value);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await router.close();
}
```

**Files to create:**

- `examples/parallel-merge.ts`

**Key concepts demonstrated:**

- `Promise.all` for parallel execution
- Checkpoint before merge point
- Selective handoff (only analyses, not raw data)

---

### 1.2 Retry Recovery Example (`examples/retry-recovery.ts`)

**Pattern:** Checkpoint-based retry with state restoration

```
Agent A → Agent B → [FAIL] → restore checkpoint → Agent B → Success
```

**Use Case:** Document processing where a parsing step might fail on malformed input, but should retry from a known good state.

**Implementation:**

```typescript
import { ContextRouter } from '@context-router/sdk';

const MAX_RETRIES = 3;

async function fetchDocument(url: string) {
  return {
    id: 'doc-123',
    content: `Document content from ${url}`,
    format: 'markdown',
  };
}

async function parseDocument(doc: any): Promise<{ parsed: any }> {
  // Simulate potential failure
  if (Math.random() < 0.5) {
    throw new Error('Parse error: unexpected format');
  }
  return { parsed: { title: 'Parsed', body: doc.content } };
}

async function validateDocument(parsed: any) {
  return { valid: true, document: parsed };
}

async function retryWithRecovery(
  flow: any,
  operation: () => Promise<any>,
  checkpointLabel: string,
): Promise<any> {
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      // Create checkpoint before attempt
      await flow.checkpoint(`${checkpointLabel}-attempt-${attempt}`);

      const result = await operation();
      return result;
    } catch (error) {
      attempt++;
      console.error(`Attempt ${attempt} failed: ${error}`);

      if (attempt >= MAX_RETRIES) {
        throw new Error(`All ${MAX_RETRIES} attempts failed`);
      }

      // Restore to pre-attempt checkpoint
      console.log(
        `Restoring checkpoint: ${checkpointLabel}-attempt-${attempt - 1}`,
      );
      const checkpoints = await flow.router.checkpoint.list(
        flow.workspace.id,
        flow.workflow.id,
      );
      const targetCheckpoint = checkpoints.find(
        (cp: any) => cp.label === `${checkpointLabel}-attempt-${attempt - 1}`,
      );

      if (targetCheckpoint) {
        await flow.router.checkpoint.restore(
          flow.workspace.id,
          targetCheckpoint.id,
        );
      }
    }
  }
}

const router = await ContextRouter.local();

try {
  const flow = await router.start('Document processing');

  // Fetch document (one-time, not retried)
  const doc = await fetchDocument('https://example.com/report');
  await flow.set('document', doc);

  // Retry parsing with checkpoint-based recovery
  const parsed = await retryWithRecovery(
    flow,
    () => parseDocument(doc),
    'parse',
  );

  await flow.set('parsed', parsed);

  // Validation (final step)
  const validated = await validateDocument(parsed.parsed);
  await flow.set('validated', validated);

  await flow.complete();
  console.log('Document processed successfully:', validated);
} catch (error) {
  await flow.fail(String(error));
  console.error('Processing failed:', error);
  process.exitCode = 1;
} finally {
  await router.close();
}
```

**Files to create:**

- `examples/retry-recovery.ts`

**Key concepts demonstrated:**

- Checkpoint before each retry attempt
- `checkpoint.list()` and `checkpoint.restore()`
- Workflow failure tracking
- Idempotent operations

---

### 1.3 Update Examples README Section

After creating both examples, update `README.md` examples section:

```markdown
## Examples

### Simple Pipeline

[simple-pipeline.ts](examples/simple-pipeline.ts) — Linear agent chain

### Parallel Merge

[parallel-merge.ts](examples/parallel-merge.ts) — Fan-out to multiple agents, merge results

### Retry Recovery

[retry-recovery.ts](examples/retry-recovery.ts) — Checkpoint-based retry with state restoration
```

---

## Priority 2: Python SDK

### 2.1 Package Structure

```
packages/sdk-python/
├── src/
│   └── context_router/
│       ├── __init__.py
│       ├── client.py          # Main ContextRouter class
│       ├── session.py         # WorkflowSession class
│       ├── exceptions.py      # ContextRouterError
│       └── types.py           # Type definitions
├── tests/
│   ├── test_client.py
│   └── test_session.py
├── pyproject.toml
├── README.md
└── LICENSE
```

### 2.2 Core Implementation

**`types.py`** — Shared type definitions:

```python
from dataclasses import dataclass
from typing import Any, Optional
from enum import Enum

class WorkflowStatus(Enum):
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

@dataclass
class Workspace:
    id: str
    name: str
    owner_id: str
    created_at: str

@dataclass
class Workflow:
    id: str
    workspace_id: str
    status: WorkflowStatus
    created_at: str
    completed_at: Optional[str] = None
    failure_reason: Optional[str] = None

@dataclass
class StateValue:
    key: str
    value: dict
    version: int

@dataclass
class HandoffResult:
    summary: str
    keys_included: list[str]
    packet: Optional[dict] = None
```

**`exceptions.py`** — Error handling:

```python
class ContextRouterError(Exception):
    def __init__(self, code: str, message: str, details: Any = None):
        self.code = code
        self.message = message
        self.details = details
        super().__init__(f"[{code}] {message}")
```

**`client.py`** — Main client:

```python
import json
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Optional

from .types import (
    Workspace,
    Workflow,
    StateValue,
    HandoffResult,
    WorkflowStatus,
)
from .exceptions import ContextRouterError
from .session import WorkflowSession

class ContextRouter:
    """
    Python SDK for Context Router MCP server.

    Usage:
        router = ContextRouter.local()
        flow = await router.start("My Workspace")
        await flow.set("key", {"data": "value"})
        await flow.complete()
        await router.close()
    """

    def __init__(
        self,
        command: str = "node",
        args: Optional[list[str]] = None,
        env: Optional[dict[str, str]] = None,
        data_dir: Optional[str] = None,
        database_url: Optional[str] = None,
        owner_id: Optional[str] = None,
    ):
        self.command = command
        self._env = {**os.environ, **(env or {})}
        self._process: Optional[subprocess.Popen] = None
        self._reader: Optional[BufferedReader] = None

        if data_dir and database_url:
            raise ValueError("data_dir and database_url cannot be used together")
        if data_dir:
            self._env["STORAGE_ENGINE"] = "sqlite"
            self._env["CONTEXT_ROUTER_DATA_DIR"] = data_dir
        if database_url:
            self._env["DATABASE_URL"] = database_url
        if owner_id:
            self._env["CONTEXT_ROUTER_OWNER_ID"] = owner_id

        # Resolve server entry point
        if args is None:
            import require_from_package
            server_entry = require_from_package.resolve(
                "@context-router/mcp-server/entry"
            )
            self._args = [command, server_entry]
        else:
            self._args = [command] + args

    async def __aenter__(self) -> "ContextRouter":
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        await self.close()

    @staticmethod
    def local(
        data_dir: Optional[str] = None,
        database_url: Optional[str] = None,
        owner_id: Optional[str] = None,
    ) -> "ContextRouter":
        """Create a local ContextRouter with automatic storage configuration."""
        return ContextRouter(
            data_dir=data_dir,
            database_url=database_url,
            owner_id=owner_id,
        )

    async def connect(self) -> None:
        """Start the MCP server and establish connection."""
        import asyncio
        from asyncio.subprocess import PIPE

        self._process = await asyncio.create_subprocess_exec(
            self.command,
            *self._args,
            env=self._env,
            stdin=PIPE,
            stdout=PIPE,
            stderr=PIPE,
        )
        self._reader = self._process.stdout

    async def close(self) -> None:
        """Stop the MCP server."""
        if self._process:
            self._process.terminate()
            await self._process.wait()

    async def _call(self, tool: str, args: dict[str, Any]) -> Any:
        """Internal: Call an MCP tool."""
        if not self._process or not self._reader:
            raise ContextRouterError(
                "NOT_CONNECTED",
                "ContextRouter is not connected. Call connect() first.",
            )

        request = json.dumps({"name": tool, "arguments": args})
        self._process.stdin.write((request + "\n").encode())
        await self._process.stdin.drain()

        response_line = await self._reader.readline()
        response = json.loads(response_line.decode())

        if not response.get("success", True):
            error = response.get("error", {})
            raise ContextRouterError(
                error.get("code", "UNKNOWN"),
                error.get("message", "Unknown error"),
                error.get("details"),
            )

        return response.get("data")

    # Workspace operations
    async def workspace_ensure(self, name: str) -> Workspace:
        """Get or create a workspace by name."""
        data = await self._call("workspace_ensure", {"name": name})
        return Workspace(**data)

    async def workspace_create(self, name: str) -> Workspace:
        """Create a new workspace."""
        data = await self._call("workspace_create", {"name": name})
        return Workspace(**data)

    async def workspace_list(self) -> list[Workspace]:
        """List all workspaces."""
        data = await self._call("workspace_list", {})
        return [Workspace(**w) for w in data]

    async def workspace_get(self, workspace_id: str) -> Workspace:
        """Get a workspace by ID."""
        data = await self._call("workspace_get", {"workspaceId": workspace_id})
        return Workspace(**data)

    async def workspace_delete(self, workspace_id: str) -> Workspace:
        """Delete a workspace."""
        data = await self._call("workspace_delete", {"workspaceId": workspace_id})
        return Workspace(**data)

    # Workflow operations
    async def workflow_create(self, workspace_id: str) -> Workflow:
        """Create a new workflow."""
        data = await self._call("workflow_create", {"workspaceId": workspace_id})
        return Workflow(
            id=data["id"],
            workspace_id=data["workspaceId"],
            status=WorkflowStatus(data["status"]),
            created_at=data["createdAt"],
        )

    async def workflow_complete(self, workspace_id: str, workflow_id: str) -> Workflow:
        """Mark a workflow as completed."""
        data = await self._call("workflow_complete", {
            "workspaceId": workspace_id,
            "workflowId": workflow_id,
        })
        return Workflow(
            id=data["id"],
            workspace_id=data["workspaceId"],
            status=WorkflowStatus(data["status"]),
            created_at=data["createdAt"],
            completed_at=data.get("completedAt"),
        )

    async def workflow_fail(
        self, workspace_id: str, workflow_id: str, reason: str
    ) -> Workflow:
        """Mark a workflow as failed."""
        data = await self._call("workflow_fail", {
            "workspaceId": workspace_id,
            "workflowId": workflow_id,
            "reason": reason,
        })
        return Workflow(
            id=data["id"],
            workspace_id=data["workspaceId"],
            status=WorkflowStatus(data["status"]),
            created_at=data["createdAt"],
            failure_reason=data.get("failureReason"),
        )

    # State operations
    async def state_write(
        self,
        workspace_id: str,
        workflow_id: str,
        key: str,
        value: dict,
        schema_name: Optional[str] = None,
    ) -> StateValue:
        """Write state to a workflow."""
        args = {
            "workspaceId": workspace_id,
            "workflowId": workflow_id,
            "key": key,
            "value": value,
        }
        if schema_name:
            args["schemaName"] = schema_name
        data = await self._call("state_write", args)
        return StateValue(key=data["key"], value=data["value"], version=data["version"])

    async def state_read(
        self, workspace_id: str, workflow_id: str, key: str
    ) -> StateValue:
        """Read state from a workflow."""
        data = await self._call("state_read", {
            "workspaceId": workspace_id,
            "workflowId": workflow_id,
            "key": key,
        })
        return StateValue(key=data["key"], value=data["value"], version=data["version"])

    async def state_snapshot(
        self, workspace_id: str, workflow_id: str
    ) -> dict[str, Any]:
        """Get a snapshot of all workflow state."""
        return await self._call("state_snapshot", {
            "workspaceId": workspace_id,
            "workflowId": workflow_id,
        })

    # Checkpoint operations
    async def checkpoint_create(
        self,
        workspace_id: str,
        workflow_id: str,
        label: Optional[str] = None,
    ) -> dict:
        """Create a checkpoint."""
        args = {"workspaceId": workspace_id, "workflowId": workflow_id}
        if label:
            args["label"] = label
        return await self._call("checkpoint_create", args)

    async def checkpoint_list(
        self, workspace_id: str, workflow_id: str
    ) -> list[dict]:
        """List all checkpoints for a workflow."""
        return await self._call("checkpoint_list", {
            "workspaceId": workspace_id,
            "workflowId": workflow_id,
        })

    async def checkpoint_restore(
        self, workspace_id: str, checkpoint_id: str
    ) -> dict:
        """Restore state from a checkpoint."""
        return await self._call("checkpoint_restore", {
            "workspaceId": workspace_id,
            "checkpointId": checkpoint_id,
        })

    # Handoff operations
    async def handoff_generate(
        self,
        workspace_id: str,
        workflow_id: str,
        keys: Optional[list[str]] = None,
        max_tokens: int = 500,
    ) -> HandoffResult:
        """Generate a handoff summary."""
        args = {"workspaceId": workspace_id, "workflowId": workflow_id}
        if keys:
            args["keys"] = keys
        if max_tokens:
            args["maxTokens"] = max_tokens
        data = await self._call("handoff_generate", args)
        return HandoffResult(
            summary=data["summary"],
            keys_included=data["keysIncluded"],
            packet=data.get("packet"),
        )

    # High-level API
    async def start(self, workspace_name: str) -> WorkflowSession:
        """Start a new workflow in a workspace."""
        workspace = await self.workspace_ensure(workspace_name)
        workflow = await self.workflow_create(workspace.id)
        return WorkflowSession(self, workspace, workflow)
```

**`session.py`** — Workflow session:

```python
from typing import Any, Optional
from .types import StateValue, HandoffResult, Workflow, Workspace
from .client import ContextRouter

class WorkflowSession:
    """High-level workflow session API.

    Usage:
        flow = await router.start("My Workspace")
        await flow.set("key", {"data": "value"})
        result = await flow.get("key")
        await flow.checkpoint("before-merge")
        handoff = await flow.handoff(keys=["key"])
        await flow.complete()
    """

    def __init__(
        self, router: ContextRouter, workspace: Workspace, workflow: Workflow
    ):
        self.router = router
        self.workspace = workspace
        self.workflow = workflow

    async def set(
        self, key: str, value: dict, schema_name: Optional[str] = None
    ) -> StateValue:
        """Write state to the workflow."""
        return await self.router.state_write(
            self.workspace.id,
            self.workflow.id,
            key,
            value,
            schema_name,
        )

    async def get(self, key: str) -> StateValue:
        """Read state from the workflow."""
        return await self.router.state_read(
            self.workspace.id,
            self.workflow.id,
            key,
        )

    async def checkpoint(self, label: Optional[str] = None) -> dict:
        """Create a checkpoint."""
        return await self.router.checkpoint_create(
            self.workspace.id,
            self.workflow.id,
            label,
        )

    async def handoff(
        self,
        keys: Optional[list[str]] = None,
        max_tokens: int = 500,
    ) -> HandoffResult:
        """Generate a handoff summary."""
        return await self.router.handoff_generate(
            self.workspace.id,
            self.workflow.id,
            keys,
            max_tokens,
        )

    async def complete(self) -> Workflow:
        """Mark the workflow as completed."""
        return await self.router.workflow_complete(
            self.workspace.id,
            self.workflow.id,
        )

    async def fail(self, reason: str) -> Workflow:
        """Mark the workflow as failed."""
        return await self.router.workflow_fail(
            self.workspace.id,
            self.workflow.id,
            reason,
        )
```

**`__init__.py`** — Package exports:

```python
from .client import ContextRouter
from .session import WorkflowSession
from .exceptions import ContextRouterError
from .types import (
    Workspace,
    Workflow,
    StateValue,
    HandoffResult,
    WorkflowStatus,
)

__version__ = "0.3.0"
__all__ = [
    "ContextRouter",
    "WorkflowSession",
    "ContextRouterError",
    "Workspace",
    "Workflow",
    "StateValue",
    "HandoffResult",
    "WorkflowStatus",
]
```

### 2.3 `pyproject.toml`

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "@context-router/sdk"
version = "0.3.0"
description = "Python SDK for Context Router MCP server"
readme = "README.md"
license = {text = "Apache-2.0"}
authors = [
    {name = "MindLever Strategy", email = "context-router@example.com"}
]
keywords = ["mcp", "agents", "sdk", "context-router"]
classifiers = [
    "Development Status :: 4 - Beta",
    "Intended Audience :: Developers",
    "License :: OSI Approved :: Apache Software License",
    "Programming Language :: Python :: 3",
    "Programming Language :: Python :: 3.10",
    "Programming Language :: Python :: 3.11",
    "Programming Language :: Python :: 3.12",
]
requires-python = ">=3.10"
dependencies = []

[project.optional-dependencies]
dev = [
    "pytest>=7.0",
    "pytest-asyncio>=0.21",
    "mypy>=1.0",
    "ruff>=0.1",
]

[project.urls]
Homepage = "https://github.com/mindlever-strategy/context-router"
Repository = "https://github.com/mindlever-strategy/context-router"
Documentation = "https://github.com/mindlever-strategy/context-router#readme"

[project.scripts]
context-router = "context_router.cli:main"

[tool.hatch.build.targets.wheel]
packages = ["src/context_router"]

[tool.ruff]
line-length = 100
target-version = "py310"

[tool.mypy]
python_version = "3.10"
strict = true
```

### 2.4 Python README (`packages/sdk-python/README.md`)

````markdown
# Context Router Python SDK

Python SDK for Context Router MCP server — structured state management for multi-agent workflows.

## Installation

```bash
pip install @context-router/sdk
```
````

Requires Python 3.10+ and Node.js 20+ (for the MCP server).

## Quick Start

```python
import asyncio
from context_router import ContextRouter

async def main():
    router = ContextRouter.local()

    # Start a workflow
    flow = await router.start("My Project")

    # Write state
    await flow.set("research", {"topic": "AI agents", "findings": [...]})

    # Generate handoff for next agent
    handoff = await flow.handoff(keys=["research"], max_tokens=100)
    print(handoff.summary)

    # Create checkpoint and complete
    await flow.checkpoint("pre-analysis")
    await flow.complete()

    await router.close()

asyncio.run(main())
```

## Async Context Manager

```python
from context_router import ContextRouter

async def main():
    async with ContextRouter.local() as router:
        flow = await router.start("My Project")
        await flow.set("data", {"key": "value"})
        await flow.complete()
```

## Full API

See the [TypeScript SDK documentation](https://github.com/mindlever-strategy/context-router)
for complete API reference. The Python SDK mirrors the TypeScript API.

## License

Apache 2.0

````

### 2.5 Test Stub (`packages/sdk-python/tests/test_client.py`)

```python
import pytest
from context_router import ContextRouter, ContextRouterError

@pytest.mark.asyncio
async def test_local_connection():
    """Test that local() creates a working connection."""
    async with ContextRouter.local() as router:
        workspace = await router.workspace_ensure("test-workspace")
        assert workspace.name == "test-workspace"

@pytest.mark.asyncio
async def test_workflow_lifecycle():
    """Test create, complete workflow."""
    async with ContextRouter.local() as router:
        flow = await router.start("test-workflow")
        await flow.set("key", {"value": 42})
        result = await flow.get("key")
        assert result.value == {"value": 42}
        await flow.complete()

@pytest.mark.asyncio
async def test_checkpoint_and_handoff():
    """Test checkpoint creation and handoff generation."""
    async with ContextRouter.local() as router:
        flow = await router.start("test-checkpoints")
        await flow.set("data", {"content": "test"})
        await flow.checkpoint("test-label")

        handoff = await flow.handoff(keys=["data"])
        assert "content" in handoff.summary

        await flow.complete()
````

---

## Priority 3: Polish

### 3.1 CLI Quickstart Command

Add a `quickstart` command that runs an example:

**New file: `packages/sdk-typescript/src/quickstart.ts`**

```typescript
#!/usr/bin/env node
import { ContextRouter } from './client.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const examples = ['simple-pipeline', 'parallel-merge', 'retry-recovery'];

async function runQuickstart(exampleName?: string): Promise<void> {
  if (!exampleName) {
    console.log('Available examples:');
    for (const name of examples) {
      console.log(`  - ${name}`);
    }
    console.log('\nUsage: npx context-router quickstart <example-name>');
    return;
  }

  if (!examples.includes(exampleName)) {
    console.error(`Unknown example: ${exampleName}`);
    console.log('Available examples:', examples.join(', '));
    process.exit(1);
  }

  console.log(`Running example: ${exampleName}`);
  console.log('---');

  try {
    // Dynamically import the example
    const examplePath = join(
      dirname(new URL(import.meta.url).href.replace(/^file:\/\//, '')),
      '..',
      '..',
      'examples',
      `${exampleName}.ts`,
    );

    // For now, just show the file location
    console.log(`Example file: ${examplePath}`);
    console.log('\nTo run this example:');
    console.log(`  npx tsx ${examplePath}`);
  } catch (error) {
    console.error('Failed to run example:', error);
    process.exit(1);
  }
}

const exampleName = process.argv[2];
runQuickstart(exampleName).catch((error) => {
  console.error(error);
  process.exit(1);
});
```

**Update `cli.ts` to register the command:**

```typescript
interface ParsedArguments {
  command: 'doctor' | 'status' | 'quickstart';
  // ... existing fields
  example?: string;
}
```

### 3.2 Enhanced Doctor Output

Improve the `doctor` command to suggest fixes:

```bash
$ npx context-router doctor
Context Router doctor: failed
✓ node: v22.4.0
✗ server: MCP server failed to start
  → Run: npm install @context-router/mcp-server
✗ database: (not checked - server failed)
✗ data-directory: (not checked - server failed)
✗ mcp-tools: (not checked - server failed)

Fix: npm install @context-router/sdk @context-router/mcp-server
```

### 3.3 Update Adoptability Strategy

Mark completed items in `docs/adoptability-strategy.md`:

```markdown
### Phase 1: Zero-to-Working in 5 Minutes (v0.2/v0.3) ✅

- [x] SQLite adapter as default
- [x] Node 20+ support
- [x] Workflow session SDK (WorkflowSession class)
- [x] CLI dashboard (doctor/status commands)
- [x] Step execution tools
- [x] Agent roles
- [ ] 3 workflow templates (2 of 3 complete)

### Phase 2: Broad Reach (v0.4)

- [ ] Python SDK published
- [ ] Web playground / visual debugger
- [ ] Import adapters (LangGraph, CrewAI)
- [ ] 1-click deploy templates (Railway, Vercel)
```

---

## Implementation Order

### Step 1: Workflow Templates (30 minutes)

1. Create `examples/parallel-merge.ts`
2. Create `examples/retry-recovery.ts`
3. Update `README.md` examples section
4. Test both examples

### Step 2: Python SDK (2-3 hours)

1. Create `packages/sdk-python/` directory structure
2. Implement `types.py`, `exceptions.py`
3. Implement `client.py` core client
4. Implement `session.py` workflow session
5. Create `__init__.py` and exports
6. Create `pyproject.toml`
7. Write `README.md`
8. Create test stubs
9. Verify Python syntax

### Step 3: Polish (1 hour)

1. Enhance CLI `doctor` command with fix suggestions
2. Update `docs/adoptability-strategy.md` with completed items
3. Run full test suite to verify nothing broke
4. Build verification

---

## Verification Checklist

After implementation:

- [ ] `npm run test` — all tests pass
- [ ] `npm run typecheck` — no type errors
- [ ] `npm run build` — builds successfully
- [ ] `npm run test:mcp` — 29 tools discovered
- [ ] `npm run test:local` — local SQLite works
- [ ] `npm run pack:check` — packages pack correctly
- [ ] `examples/parallel-merge.ts` — runs without error
- [ ] `examples/retry-recovery.ts` — runs without error
- [ ] `packages/sdk-python/` — Python syntax valid
- [ ] `packages/sdk-python/pyproject.toml` — valid TOML
- [ ] `docs/adoptability-strategy.md` — updated with completed items

---

## Files to Create/Modify

### Create

- `examples/parallel-merge.ts`
- `examples/retry-recovery.ts`
- `packages/sdk-python/src/context_router/__init__.py`
- `packages/sdk-python/src/context_router/client.py`
- `packages/sdk-python/src/context_router/session.py`
- `packages/sdk-python/src/context_router/exceptions.py`
- `packages/sdk-python/src/context_router/types.py`
- `packages/sdk-python/tests/__init__.py`
- `packages/sdk-python/tests/test_client.py`
- `packages/sdk-python/pyproject.toml`
- `packages/sdk-python/README.md`
- `packages/sdk-python/LICENSE`

### Modify

- `README.md` — update examples section
- `docs/adoptability-strategy.md` — mark completed items
- `packages/sdk-typescript/src/cli.ts` — enhance doctor output

---

## Time Estimate

| Task                   | Estimated Time |
| ---------------------- | -------------- |
| Workflow templates     | 30 minutes     |
| Python SDK             | 2-3 hours      |
| Polish                 | 1 hour         |
| Testing & verification | 30 minutes     |
| **Total**              | **4-5 hours**  |
