# @context-router/langgraph-adapter

Bridge LangGraph workflows with Context Router's structured state management for persistent, resumable, and scalable agent orchestration.

## Installation

```bash
npm install @context-router/langgraph-adapter
```

**Requirements:**
- Node.js >= 20
- `@context-router/sdk` (peer dependency, installed automatically)
- `langgraph-sdk` (peer dependency, install separately)

## Quick Example

```typescript
import { createContextRouterChecker } from '@context-router/langgraph-adapter';
import { StateGraph, MANDATORY_CHANNELS } from '@langchain/langgraph';

const checker = createContextRouterChecker();

const graph = new StateGraph({ channels: MANDATORY_CHANNELS })
  .addNode('research', researchNode)
  .addNode('write', writeNode)
  .addEdge('research', 'write')
  .addConditionalEdges('write', shouldContinue)
  .compile({ checkpointer: checker });

// Run with persistence across sessions
const result = await graph.invoke(
  { messages: [] },
  { configurable: { thread_id: 'user-123-session-1' } }
);
```

## Why This Adapter?

### Built-in LangGraph Checkpointers

| Feature | Memory | Postgres | SQLite | Context Router |
|---------|--------|----------|--------|----------------|
| **Persistence** | Session only | Permanent | File-based | Permanent |
| **Multi-tenancy** | No | Yes | No | Yes (workspaces) |
| **Selective reads** | No | Manual SQL | Manual SQL | Built-in (handoffs) |
| **Serverless ready** | No | External DB | File issues | SQLite auto-created |
| **State schema** | Any | Any | Any | Typed + validated |
| **Version history** | No | Basic | No | Full checkpoints |

Context Router combines workspace isolation, typed state, selective context (handoffs), and automatic checkpointing in one package.

## API Reference

### `createContextRouterChecker(config?)`

Creates a LangGraph-compatible checkpointer backed by Context Router.

```typescript
const checker = createContextRouterChecker({
  workspaceName: 'my-app',  // Optional: isolates workflows
  autoCheckpoint: true,     // Default: true
  router?: ContextRouter,   // Optional: share existing instance
});
```

### `ContextRouterChecker`

The main checkpointer class with these methods:

#### `get(config)`
Retrieve saved state for a thread. Returns `null` if no checkpoint exists.

```typescript
const checkpoint = await checker.get({ thread_id: 'session-1' });
// Returns: { data: {...}, config: { thread_id, checkpoint_id } } | null
```

#### `put(config, data)`
Save state to Context Router with automatic checkpointing.

```typescript
await checker.put({ thread_id: 'session-1' }, { count: 42, items: [...] });
```

#### `list(config)`
List all checkpoints for a thread.

```typescript
const checkpoints = await checker.list({ thread_id: 'session-1' });
// [{ id: 'cp-1', metadata: { label, createdAt } }, ...]
```

#### `restore(config)`
Restore workflow state from a specific checkpoint.

```typescript
await checker.restore({
  thread_id: 'session-1',
  checkpoint_id: 'cp-1'
});
```

#### `close()`
Clean up all sessions and connections. Call when done.

```typescript
await checker.close();
```

---

### `contextRouterNode(graphState, config, options)`

LangGraph node helper that reads selected keys from Context Router.

```typescript
const researchNode = async (state, config) => {
  const ctxState = await contextRouterNode(state, config, {
    keys: ['search_query', 'filters'],  // Selective context
    nodeName: 'research'
  });

  const results = await search(ctxState.search_query);
  return { ...state, results };
};
```

---

### `writeContextRouterNode(graphState, config, options)`

LangGraph node helper that writes state to Context Router with checkpointing.

```typescript
const writeNode = async (state, config) => {
  const updated = { ...state, draft: 'Generated content...' };
  await writeContextRouterNode(updated, config, { nodeName: 'write' });
  return updated;
};
```

---

### `generateHandoff(graphState, config, options)`

Generate a structured summary for the next agent in a pipeline. Uses Context Router's built-in handoff summarization.

```typescript
const supervisorNode = async (state, config) => {
  const handoff = await generateHandoff(state, config, {
    keys: ['analysis', 'findings', 'next_steps'],
    maxTokens: 500,
    nextGoals: ['Review findings', 'Draft recommendations']
  });

  return { ...state, handoff_summary: handoff.summary };
};
```

**Returns:**
- `summary`: AI-generated context summary
- `keysIncluded`: Which keys were included
- `packet`: Optional structured payload

---

### `contextRouterChannel(threadId)`

Create a LangGraph state channel that syncs bidirectionally with Context Router.

```typescript
const graph = new StateGraph({
  channels: {
    ...MANDATORY_CHANNELS,
    context_router: contextRouterChannel('thread_id_123'),
  }
});
```

---

## Advanced Usage

### Multi-Tenant Workflows

Use workspace isolation for multi-tenant deployments:

```typescript
const checker = createContextRouterChecker({
  workspaceName: req.tenantId,  // Each tenant gets isolated storage
});
```

### Shared Router Instance

For better connection pooling in server environments:

```typescript
const router = await ContextRouter.local();
const checker = createContextRouterChecker({ router });

// Use same router across multiple graph instances
const graph1 = new StateGraph(...).compile({ checkpointer: checker });
const graph2 = new StateGraph(...).compile({ checkpointer: checker });

// Clean up once at the end
await checker.close();
```

### Selective Context with Handoffs

Only pass relevant data between agents:

```typescript
// In research node
await writeContextRouterNode(state, config, { nodeName: 'research' });

// In write node - only read what you need
const { query, results } = await contextRouterNode(state, config, {
  keys: ['query', 'results'],
});
```

## License

Apache-2.0 - see [LICENSE](LICENSE)
