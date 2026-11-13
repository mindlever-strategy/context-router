# Context Router: The MCP State Layer Your Multi-Agent Workflows Have Been Missing

**Clean state in. Focused context out.**

---

## The Problem

Multi-agent systems are great — until you try to pass context between agents.

Most teams solve this by dumping entire chat histories. Every agent gets everything: irrelevant reasoning, dead ends, contradictory answers, and mounting token costs.

Sound familiar?

```
Agent A: [full history of 47 messages]
         ↓
Agent B: "here's everything, good luck figuring out what matters"
         ↓
Agent C: still parsing the noise from A and B
         ↓
 💸 Token bill goes brrr
```

This isn't a workflow — it's context debt.

---

## Introducing Context Router

Context Router is a **local MCP server** that gives multi-agent workflows a purpose-built state layer.

Instead of passing conversation chains, agents exchange **validated, versioned, selective state**.

```
 Agent A                  Context Router                  Agent B
┌─────────┐              ┌────────────────┐             ┌─────────┐
│ Reason  │──write──────▶│ Structured     │──select────▶│ Reason  │
│ & act   │              │ workflow state │             │ & act   │
└─────────┘              │                │             └─────────┘
                         │  ✓ schemas     │
                         │  ✓ checkpoints │
                         │  ✓ handoffs    │
                         └───────┬────────┘
                                 ▼
                       SQLite / PostgreSQL
```

No agent execution. No orchestration magic. Just a **reliable state exchange** that any MCP-compatible agent can use.

---

## What You Actually Get

- **37 MCP tools** — workspaces, schemas, workflows, state, checkpoints, handoffs, step execution, agent roles, event journal, state diff, TTL, and more
- **Schema-enforced state** — nested objects, arrays, enums, required fields
- **Selective context reads** — agents read only the keys they need
- **Durable checkpoints** — atomic restore if a step fails
- **Bounded handoffs** — concise summaries that stay within token limits
- **Event Journal** — full audit trail with replay capability
- **AI-powered summaries** — natural language handoff generation

### 37 Tools at Your Service

| Area       | Tools                                                    |
| ---------- | -------------------------------------------------------- |
| Workspace  | `workspace_create`, `workspace_list`, `workspace_delete` |
| Schema     | `schema_create`, `schema_validate`, `schema_migrate`     |
| Workflow   | `workflow_create`, `workflow_complete`, `workflow_fail`  |
| State      | `state_write`, `state_read`, `state_snapshot`            |
| Checkpoint | `checkpoint_create`, `checkpoint_restore`                |
| Handoff    | `handoff_generate`, `handoff_generate_ai`                |
| Journal    | `journal_query`, `journal_append`                        |
| Debugger   | `debugger_inspect`                                       |

---

## The Numbers That Matter

Running benchmarks shows the impact clearly:

### Token Reduction (72% average)

| Scenario            | Traditional | Context Router | Reduction |
| ------------------- | ----------- | -------------- | --------- |
| Simple (3 rounds)   | 1,630       | 471            | **71.1%** |
| Medium (5 rounds)   | 2,689       | 753            | **72.0%** |
| Complex (10 rounds) | 5,334       | 1,458          | **72.7%** |

### Memory Savings (20-50x smaller)

| Size   | Chat History | Context Router | Savings |
| ------ | ------------ | -------------- | ------- |
| Small  | 0.01 MB      | 0.00 MB        | 11x     |
| Medium | 0.05 MB      | 0.00 MB        | **24x** |
| Large  | 0.20 MB      | 0.00 MB        | **51x** |

### Cost Impact

For large teams: **$34,320/year** in API savings. That's real ROI.

---

## How Simple Is It?

### TypeScript

```typescript
import { ContextRouter } from '@context-router/sdk';

const router = await ContextRouter.local();
const flow = await router.start('Research');

// Write validated state
await flow.set('findings', { answer: 42, source: 'example' });

// Generate a concise handoff for the next agent
const handoff = await flow.handoff({ keys: ['findings'] });
console.log(handoff.summary);

await flow.complete();
await router.close();
```

### Python

```python
import asyncio
from context_router import ContextRouter

async def main():
    async with await ContextRouter.local() as router:
        flow = await router.start('Research')
        await flow.set('findings', {'answer': 42, 'source': 'example'})
        handoff = await flow.handoff(keys=['findings'])
        print(handoff.summary)
        await flow.complete()

asyncio.run(main())
```

### Cursor Agent

Add to your Cursor MCP config:

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

Then use tools like `workspace_ensure`, `state_write`, and `handoff_generate` directly in your Agent chats.

---

## Integrations That Matter

Context Router isn't locked into one ecosystem:

- **LangGraph** — use as a drop-in checkpointer
- **CREWAI** — memory adapter for crew memory management
- **AutoGen** — agent conversation memory
- **LlamaIndex** — vector search over workflow state
- **Cursor** — zero-config MCP integration

---

## Current Status

- **v0.6.0 preview** — production-ready core, experimental features
- TypeScript SDK (`@context-router/sdk`) + Python SDK (`ctxrouter`)
- SQLite by default, PostgreSQL for production
- **259 tests passing**
- **37 MCP tools** with stable JSON envelopes
- Apache 2.0 licensed

---

## Start Building

Zero config. No Docker. No migrations (SQLite defaults to auto-created).

```bash
# TypeScript
npm install @context-router/sdk

# Python
pip install ctxrouter

# Cursor MCP
npx -y @context-router/mcp-server
```

**GitHub:** github.com/mindlever-strategy/context-router
**Docs:** context-router.dev

---

## The Bottom Line

Multi-agent workflows don't need more agents. They need **better state management**.

Context Router gives your agents clean, validated, selective context — and keeps your token costs from spiraling.

> "Build agents that share facts, not noise."

---

_What multi-agent problem are you trying to solve? Drop it in the comments._

#MultiAgent #MCP #AI #LLM #OpenSource #TypeScript #Python #AIEngineering
