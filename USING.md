# Using Context Router

**Clean state in. Focused context out.**

This guide covers both ways people use Context Router:

1. **In Cursor** — the `@context-router` MCP server (`@context-router/mcp-server`) for multi-agent Agent chats
2. **In Python** — the `context-router` SDK that talks to the same MCP server over stdio

It is written for **adopters** (published packages) and **contributors** (this monorepo).

---

## Table of contents

1. [What Context Router is](#what-context-router-is)
2. [Choose your path](#choose-your-path)
3. [Prerequisites](#prerequisites)
4. [Use in Cursor (`@context-router`)](#use-in-cursor-context-router)
5. [Use in Python](#use-in-python)
6. [Shared concepts](#shared-concepts)
7. [Cookbook](#cookbook)
8. [Troubleshooting](#troubleshooting)
9. [Further reading](#further-reading)

---

## What Context Router is

Context Router is a **local MCP server** that stores structured workflow state for multi-agent systems. Agents write facts into keyed state, create checkpoints, and generate **bounded handoffs** for the next step.

It does **not**:

- execute or orchestrate agents
- replace your LLM client
- require Docker or a cloud account for the default SQLite path

It **does**:

- give Cursor (or any MCP client) 29 tools for workspaces, schemas, workflows, state, checkpoints, handoffs, steps, and agent roles
- give TypeScript and Python SDKs a high-level session API (`start` → `set` → `handoff` → `complete`)

---

## Choose your path

| You want… | Use |
|-----------|-----|
| Multi-step Agent work inside Cursor without pasting chat history | **Cursor MCP** (`@context-router`) |
| Scripts, apps, or services that manage workflow state in code | **Python SDK** and/or **TypeScript SDK** |
| Both (Cursor for interactive work, Python for automation) | Same SQLite store can be shared if you point both at the same data dir / owner |

**Rule of thumb:** prefer the SDK session API in code; prefer MCP tools in Cursor Agent. You do not need all 29 tools to get value — start with workspace → workflow → state → handoff → complete.

---

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Node.js 20+** | Required to run `@context-router/mcp-server` (Cursor and Python both launch it) |
| **Python 3.10+** | Only for the Python SDK |
| **npm** | Used by `npx` / package install |

Default storage is **SQLite** in your OS application-data directory. No `DATABASE_URL`, Docker, or migrations for the happy path.

Optional: PostgreSQL via `DATABASE_URL` + Prisma migrations (see [server README](packages/server/README.md)).

---

## Use in Cursor (`@context-router`)

In Cursor, the MCP server is usually named **`context-router`**. In chat you can attach or invoke it as **`@context-router`** (exact UI label depends on your Cursor version; the MCP server key is `context-router`).

### Adopter setup (zero-config)

1. Open **Cursor Settings → MCP** (or edit your MCP JSON config).
2. Add:

```json
{
  "mcpServers": {
    "context-router": {
      "command": "npx",
      "args": ["-y", "@context-router/mcp-server"]
    }
  }
}
```

3. Restart Cursor or refresh MCP tools.
4. Confirm tools appear (you should see names like `workspace_ensure`, `workflow_create`, `state_write`, `handoff_generate`).

SQLite is created automatically on first use.

### Project vs user config

- **User / global MCP config** — available in every workspace
- **Project MCP config** — useful when only this repo should expose Context Router

Either works as long as the `command` / `args` launch the published server (or your local build).

### Contributor / monorepo MCP path

From this repository:

```bash
npm ci
npm run db:generate
npm run build
```

Then point Cursor at the built entry (adjust the path):

```json
{
  "mcpServers": {
    "context-router": {
      "command": "node",
      "args": ["D:/path/to/context-router/packages/server/dist/index.js"]
    }
  }
}
```

### How to use `@context-router` in Agent

1. Start (or continue) an Agent chat for a multi-step task.
2. Attach **`@context-router`** so the agent can call MCP tools (or rely on auto tool discovery if tools are already enabled).
3. Ask for a structured workflow instead of “summarize the whole chat for the next agent.”

**Good prompt sketch:**

```text
Use @context-router for state. Do not pass full chat history between steps.

1. workspace_ensure name="my-feature"
2. workflow_create
3. For each step: state_write the facts, then handoff_generate with only the keys the next step needs
4. checkpoint_create before any risky external call
5. workflow_complete when done
```

### Multi-agent prompt pattern (MCP tools)

Recommended sequence inside one Cursor run (or across Agent turns):

1. `workspace_ensure` once per project / feature area
2. `schema_create` when you want validated state (optional on first use)
3. `agent_role_create` for each role (`research`, `validation`, `outreach`, …)
4. `workflow_create` at the start of each run
5. For each step:
   - `step_run_start` with a stable `executionId`
   - `state_write` with `agentRole`, optional `provenance`, and `expectedVersion` on updates
   - `handoff_generate` with `agentRole` and `format: "structured"`
   - `step_run_complete`
6. `checkpoint_create` before risky external calls
7. `workflow_complete` when finished

**Do not** paste the entire prior transcript into the next agent. Read only the keys that role is allowed to see.

Schema-free writes are accepted; responses may include `warning: UNVALIDATED_STATE` when no `schemaName` is supplied. Set `CONTEXT_ROUTER_LOG_UNVALIDATED_STATE=true` to also log those writes to stderr.

### Cursor smoke test

Ask Agent to call, in order:

1. `workspace_ensure`
2. `workflow_create`
3. `state_write`
4. `handoff_generate`

If all four succeed, MCP wiring is working.

### Security note

The stdio server is **trusted-local only**. Do not expose it directly to an untrusted network. `CONTEXT_ROUTER_OWNER_ID` is a local isolation scope, not remote authentication.

Shorter setup-only notes also live in [docs/cursor-setup.md](docs/cursor-setup.md).

---

## Use in Python

The Python package is **`context-router`** (import: `context_router`). It launches the Node MCP server and exposes the same high-level session API as the TypeScript SDK.

### Install (adopter / PyPI)

```bash
# Node server (required; Python SDK spawns it)
npm install -g @context-router/mcp-server
# or: npm install @context-router/mcp-server in your project

pip install context-router
```

If the package is not yet visible on your index, install from this monorepo (below) or set `CONTEXT_ROUTER_MCP_ENTRY` to a built `index.js`.

### Install (contributor / monorepo)

```bash
# From repo root
npm ci
npm run db:generate
npm run build --workspace=@context-router/mcp-server

cd packages/sdk-python
pip install -e ".[dev]"
```

### Server resolution order

`ContextRouter.local()` resolves the MCP entry as:

1. `CONTEXT_ROUTER_MCP_ENTRY` environment variable
2. Installed npm package `@context-router/mcp-server/entry`
3. Monorepo fallback: `packages/server/dist/index.js`

### Quickstart

```python
import asyncio
from context_router import ContextRouter


async def main():
    async with await ContextRouter.local() as router:
        flow = await router.start("Research")
        await flow.set("findings", {"answer": 42, "source": "example"})
        handoff = await flow.handoff(keys=["findings"])
        print(handoff.summary)
        await flow.complete()


asyncio.run(main())
```

Isolated data directory (useful in tests):

```python
async with await ContextRouter.local(data_dir="/tmp/my-router-data") as router:
    ...
```

### Session API (`WorkflowSession`)

| Method | Purpose |
|--------|---------|
| `flow.set(key, value, …)` | Write state (optional schema / agent role / CAS version) |
| `flow.get(key)` / `flow.get_many(keys)` | Read state |
| `flow.handoff(keys=…, max_tokens=…)` | Bounded handoff summary for the next agent |
| `flow.checkpoint(label)` | Snapshot before risky work |
| `flow.complete()` / `flow.fail(reason)` | Finish the workflow |

### Explicit namespaces

When you need the full MCP surface from Python:

| Namespace | Examples |
|-----------|----------|
| `router.workspace` | `create`, `ensure`, `list`, `get`, `delete` |
| `router.schema` | `create`, `get`, `list`, `validate` |
| `router.workflow` | `create`, `status`, `complete`, `fail` |
| `router.state` | `write`, `read`, `read_many`, `delete`, `snapshot` |
| `router.checkpoint` | `create`, `list`, `restore`, `delete` |
| `router.handoff` | `generate`, `apply` |
| `router.step` | `start`, `complete`, `fail` |
| `router.agent_role` | `create`, `list` |

Also: `router.status()`, `router.discover_tools()`.

Package README: [packages/sdk-python/README.md](packages/sdk-python/README.md).

---

## Shared concepts

```text
workspace_ensure / workspace_create
  → schema_create (optional)
  → agent_role_create (optional)
  → workflow_create
  → state_write / state_read
  → checkpoint_create … checkpoint_restore (when needed)
  → handoff_generate
  → workflow_complete
```

| Concept | Meaning |
|---------|---------|
| **Workspace** | Named isolation scope for a project or feature |
| **Workflow** | One run inside a workspace |
| **State key** | Named JSON object agents read/write |
| **Schema** | Optional contract for a key’s shape |
| **Agent role** | Allowed read/write key patterns |
| **Checkpoint** | Restorable snapshot of workflow state |
| **Handoff** | Bounded summary (and optional structured packet) for the next agent |

Context Router stores and transfers workflow state. It does not invoke agents.

Inspect local install health (TypeScript CLI):

```bash
npx context-router doctor
npx context-router status
```

---

## Cookbook

### Recipe 1 — Linear pipeline (Python)

Research → handoff → draft → checkpoint → complete.

```python
import asyncio
from context_router import ContextRouter


async def research_topic() -> dict:
    return {
        "topic": "Context-efficient agents",
        "findings": ["Share selected facts", "Checkpoint completed work"],
    }


async def write_draft(context: str) -> dict:
    return {"title": "Smaller handoffs, clearer agents", "contextUsed": context}


async def main() -> None:
    async with await ContextRouter.local() as router:
        flow = await router.start("Simple pipeline")
        await flow.set("research", await research_topic())

        handoff = await flow.handoff(keys=["research"], max_tokens=120)
        await flow.set("draft", await write_draft(handoff.summary))

        await flow.checkpoint("draft-created")
        draft = await flow.get("draft")
        await flow.complete()
        print(draft.value)


asyncio.run(main())
```

Runnable copy: [examples/simple-pipeline.py](examples/simple-pipeline.py).

TypeScript twin: `node scripts/run-example.mjs simple-pipeline`  
Guide: [docs/workflows/simple-pipeline.md](docs/workflows/simple-pipeline.md).

**MCP-only equivalent:**

```text
workspace_ensure → workflow_create → state_write → handoff_generate → state_write → workflow_complete
```

---

### Recipe 2 — Checkpoint / retry recovery (Python)

Before each attempt, checkpoint. On failure, restore and retry.

```python
import asyncio
from context_router import ContextRouter

MAX_RETRIES = 3


async def flaky_parse(doc: dict, attempt: int) -> dict:
    if attempt < 2:
        raise RuntimeError("Parse error: unexpected format")
    return {"parsed": {"title": doc["id"], "body": doc["content"]}}


async def main() -> None:
    async with await ContextRouter.local() as router:
        flow = await router.start("Retry recovery")
        doc = {"id": "doc-123", "content": "Sample markdown", "format": "markdown"}
        await flow.set("document", doc)

        attempt = 0
        while attempt < MAX_RETRIES:
            label = f"before-parse-attempt-{attempt}"
            await flow.checkpoint(label)
            try:
                parsed = await flaky_parse(doc, attempt)
                await flow.set("parsed", parsed)
                break
            except RuntimeError:
                attempt += 1
                if attempt >= MAX_RETRIES:
                    await flow.fail("parse failed after retries")
                    raise
                checkpoints = await router.checkpoint.list(
                    flow.workspace.id,
                    flow.workflow.id,
                )
                target = next(cp for cp in checkpoints if cp.label == label)
                await router.checkpoint.restore(flow.workspace.id, target.id)

        await flow.complete()


asyncio.run(main())
```

TypeScript demo: `node scripts/run-example.mjs retry-recovery`  
Guide: [docs/workflows/retry-recovery.md](docs/workflows/retry-recovery.md).

**MCP-only equivalent:**

```text
state_write → checkpoint_create → [attempt] → checkpoint_restore → [retry] → workflow_complete
```

---

### Recipe 3 — Multi-agent handoff in Cursor

Use this when Agent A should not dump its full transcript into Agent B.

**Turn 1 (research agent)**

```text
@context-router

Create or reuse workspace "lead-qualification".
Start a workflow.
Write key "research" with the company facts you found (domain, signals, risks).
Generate a structured handoff for keys=["research"] with maxTokens around 200.
Return only the handoff summary and the workspaceId / workflowId — do not ask me to paste chat history next.
```

**Turn 2 (validation agent)**

```text
@context-router

Continue workspaceId=… workflowId=… from the previous step.
Read only key "research" (or apply the previous handoff).
Validate the lead. Write key "validation" with { status, reasons }.
Checkpoint label "validated".
Handoff keys=["research","validation"] for outreach.
```

**Turn 3 (outreach / complete)**

```text
@context-router

Read handoff keys only. Draft outreach notes into key "outreach".
workflow_complete when finished.
```

Optional hardening: create `agent_role` entries so each agent can only read/write the keys it needs.

---

### Recipe 4 — Parallel fan-out + merge

Pattern: multiple agents write different keys, then a merge step reads selected keys and produces a combined result.

```text
workflow_create
  → state_write key=research_a
  → state_write key=research_b
  → handoff_generate keys=[research_a, research_b]
  → state_write key=merged
  → workflow_complete
```

Python sketch:

```python
async with await ContextRouter.local() as router:
    flow = await router.start("Parallel merge")
    await flow.set("research_a", {"source": "docs", "notes": ["…"]})
    await flow.set("research_b", {"source": "web", "notes": ["…"]})
    packet = await flow.handoff(keys=["research_a", "research_b"], max_tokens=300)
    await flow.set("merged", {"summary": packet.summary, "decision": "ship"})
    await flow.complete()
```

Full TypeScript example: `node scripts/run-example.mjs parallel-merge`  
Guide: [docs/workflows/parallel-merge.md](docs/workflows/parallel-merge.md).

---

### Recipe 5 — Explicit API with schema (Python)

```python
async with await ContextRouter.local() as router:
    ws = await router.workspace.ensure("Lead qualification")
    await router.schema.create(
        ws.id,
        "Lead",
        {
            "companyName": {"type": "string", "required": True},
            "domain": {"type": "string", "required": True},
            "status": {
                "type": "enum",
                "values": ["PENDING", "CONFIRMED", "REJECTED"],
                "required": True,
            },
        },
    )
    wf = await router.workflow.create(ws.id)
    await router.state.write(
        ws.id,
        wf.id,
        "lead",
        {
            "companyName": "Acme Corp",
            "domain": "acme.example",
            "status": "CONFIRMED",
        },
        schema_name="Lead",
    )
    await router.checkpoint.create(ws.id, wf.id, label="validated-lead")
    handoff = await router.handoff.generate(ws.id, wf.id, keys=["lead"], max_tokens=100)
    print(handoff.summary)
    await router.workflow.complete(ws.id, wf.id)
```

TypeScript twin: [examples/lead-qualification.ts](examples/lead-qualification.ts).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Cursor shows no `context-router` tools | MCP config missing / not refreshed | Add `npx -y @context-router/mcp-server`, restart or refresh MCP |
| `NODE_MODULE_VERSION` / `better-sqlite3` mismatch on Windows | Cursor starts MCP with bundled Node 22 while native modules were built under system Node (e.g. 25) | Pin MCP `command` to the absolute path from `where node` (same binary used for `npm install`); run `npm rebuild better-sqlite3` after a Node major upgrade |
| `NODE_NOT_FOUND` from Python | Node.js not on `PATH` | Install Node 20+ and reopen the terminal |
| `SERVER_NOT_FOUND` from Python | MCP server not installed / not built | `npm i @context-router/mcp-server` or `npm run build` in monorepo; or set `CONTEXT_ROUTER_MCP_ENTRY` |
| Tools fail with DB errors after switching engines | Mixed SQLite / Postgres env | Unset the unused of `DATABASE_URL` / `CONTEXT_ROUTER_DATA_DIR` |
| `UNVALIDATED_STATE` warning | No `schemaName` on write | Expected for schema-free mode; add `schema_create` + `schemaName` when ready |
| Handoff too large / noisy | Too many keys / no `maxTokens` | Pass `keys=[…]` and `max_tokens` / `maxTokens` |
| Contributor MCP points at stale build | Dist not rebuilt | `npm run build --workspace=@context-router/mcp-server` |
| Want separate Cursor vs Python data | Shared default app-data dir | Pass `data_dir=` in Python and/or set `CONTEXT_ROUTER_DATA_DIR` / `CONTEXT_ROUTER_OWNER_ID` in MCP `env` |

---

## Further reading

| Doc | When |
|-----|------|
| [README.md](README.md) | Project overview and TypeScript quickstart |
| [docs/cursor-setup.md](docs/cursor-setup.md) | Short Cursor MCP setup |
| [docs/api.md](docs/api.md) | Full MCP tool reference |
| [docs/architecture.md](docs/architecture.md) | How storage and tools fit together |
| [docs/workflows/](docs/workflows/) | Pattern guides (pipeline, parallel, retry) |
| [packages/sdk-python/README.md](packages/sdk-python/README.md) | Python package notes |
| [packages/sdk-typescript/README.md](packages/sdk-typescript/README.md) | TypeScript SDK notes |
| [CHANGELOG.md](CHANGELOG.md) | What changed per release |

---

**Build agents that share facts, not noise.**
