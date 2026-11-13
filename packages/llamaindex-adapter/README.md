# LlamaIndex Adapter for Context Router

[![npm version](https://img.shields.io/npm/v/@context-router/llamaindex-adapter)](https://www.npmjs.com/package/@context-router/llamaindex-adapter)

Bridges Context Router's structured state with LlamaIndex's powerful retrieval capabilities. This adapter enables vector search, semantic retrieval, chat memory, and automatic state synchronization for multi-agent workflows.

## Features

- **Vector Search** - Index and search workflow state semantically
- **Semantic Retrieval** - Query workflow data using natural language
- **Chat Memory** - Persistent chat history for agents with CRUD operations
- **Query Engine** - Natural language queries across multiple data sources
- **State Sync** - Automatic synchronization of state changes to vector index
- **Re-ranking** - Advanced retrieval with term matching and scoring
- **Knowledge Graphs** - Entity extraction and relationship mapping
- **MCP Tools** - Ready-to-use MCP tool definitions

## Installation

```bash
npm install @context-router/llamaindex-adapter
```

**Peer Dependencies:**

- `@context-router/sdk` ^0.5.0
- `llamaindex` ^0.5.0

## Quick Start

```typescript
import {
  ContextRouterDocumentStore,
  ContextRouterChatMemory,
  ContextRouterQueryEngine,
  StateSyncService,
} from '@context-router/llamaindex-adapter';

// Initialize Context Router
const router = await ContextRouter.local();

// Create document store for vector search
const docStore = new ContextRouterDocumentStore({
  router,
  workspaceId: 'ws-123',
});

// Index a workflow
await docStore.indexWorkflow(workflowId);

// Query with natural language
const results = await docStore.query(
  'Find similar lead qualification workflows that resulted in confirmed status',
);

// Create query engine for comprehensive queries
const queryEngine = new ContextRouterQueryEngine({
  router,
  workspaceId: 'ws-123',
  sources: {
    workflowStates: true,
    chatHistory: true,
  },
  synthesisOptions: {
    llmProvider: 'anthropic',
    llmModel: 'claude-haiku-4-5',
  },
});

// Query across all sources
const response = await queryEngine.query(
  'What approaches worked for enterprise deals?',
  { workflowId },
);
```

## Document Store

Index workflow state for semantic search:

```typescript
const docStore = new ContextRouterDocumentStore({
  router,
  workspaceId,
  documentOptions: {
    includeMetadata: true,
    chunkSize: 512,
    chunkOverlap: 50,
  },
});

// Index and query
await docStore.indexWorkflow(workflowId);
const results = await docStore.query('similar leads', { topK: 5 });
```

### API

| Method                           | Description                           |
| -------------------------------- | ------------------------------------- |
| `indexWorkflow(workflowId)`      | Index a workflow's current state      |
| `indexStateKey(workflowId, key)` | Index a single state key              |
| `indexCheckpoint(checkpointId)`  | Index a checkpoint snapshot           |
| `query(query, options?)`         | Semantic search with natural language |
| `similaritySearch(embedding, k)` | Search by embedding vector            |
| `deleteWorkflow(workflowId)`     | Remove workflow from index            |
| `getIndexStats()`                | Get index statistics                  |

## Chat Memory

Persistent chat history with retrieval strategies:

```typescript
const memory = new ContextRouterChatMemory({
  router,
  workspaceId,
  workflowId,
  memoryOptions: {
    lastNMessages: 50,
    recallStrategy: 'hybrid', // 'recent' | 'relevant' | 'hybrid'
    relevanceThreshold: 0.7,
  },
});

// Add messages
await memory.put({ role: 'user', content: 'Hello!' });
await memory.put({ role: 'assistant', content: 'How can I help?' });

// Get context
const context = await memory.getContext('What did the user ask?');

// Format for LLM
const messages = await memory.formatMessages('You are a helpful assistant');
```

### API

| Method                    | Description                      |
| ------------------------- | -------------------------------- |
| `put(message)`            | Add a message (returns with ID)  |
| `get(id)`                 | Get message by ID                |
| `update(id, updates)`     | Update a message                 |
| `delete(id)`              | Delete a message                 |
| `getHistory(limit?)`      | Get message history              |
| `getByRole(role)`         | Get messages by role             |
| `getContext(query?)`      | Get context with recall strategy |
| `formatMessages(prompt?)` | Format for LLM consumption       |
| `search(query)`           | Search messages by content       |
| `prune(max?)`             | Remove old messages              |
| `clear()`                 | Clear all messages               |

## Retrieval Pipeline

Advanced retrieval with re-ranking:

```typescript
const retriever = new ContextRouterRetriever({
  router,
  workspaceId,
  similarityTopK: 10,
  reranking: {
    enabled: true,
    topN: 5,
    scoreThreshold: 0.5,
  },
  hybridSearch: true,
  hybridAlpha: 0.5, // 0 = keyword, 1 = vector
});

// Basic retrieval
const results = await retriever.retrieve('enterprise leads');

// Hybrid search
const hybridResults = await retriever.hybridRetrieve('confirmed deals', 5);
```

### Re-ranking Features

- **Term Matching Boost** - Scores based on query term overlap
- **Hybrid Search** - Combines vector and keyword search
- **Score Threshold** - Filter low-confidence results
- **Deduplication** - Combines results from multiple sources

## Query Engine

Multi-source query with synthesis:

```typescript
const engine = new ContextRouterQueryEngine({
  router,
  workspaceId,
  sources: {
    workflowStates: true,
    checkpoints: true,
    chatHistory: true,
    eventJournal: false,
  },
  retrieverOptions: {
    similarityTopK: 5,
  },
  synthesisOptions: {
    llmProvider: 'anthropic',
    llmModel: 'claude-haiku-4-5',
    includeSources: true,
  },
});

// Index workflow for retrieval
await engine.indexWorkflow(workflowId);

// Simple query
const response = await engine.query('What worked for similar leads?', {
  workflowId,
});

// LLM-powered synthesis
const llmResponse = await engine.queryWithLLM(
  'Summarize the key decisions in this workflow',
  { workflowId },
);
```

## State Sync Service

Automatic synchronization of state changes:

```typescript
const sync = new StateSyncService({
  router,
  workspaceId,
  triggers: {
    onStateWrite: true,
    onCheckpoint: true,
    onWorkflowComplete: false,
  },
  syncOptions: {
    batchSize: 100,
    debounceMs: 1000,
    retryAttempts: 3,
  },
  includePatterns: ['lead_*', 'customer_*'],
  excludePatterns: ['cache_*', 'temp_*'],
});

// Register event handler
sync.onSync(async (event) => {
  console.log(`Synced: ${event.type} for workflow ${event.workflowId}`);
});

// Start syncing
await sync.start();

// Manual sync
await sync.syncWorkflow(workflowId);
await sync.syncStateKey(workflowId, 'lead_status');

// Stop when done
await sync.stop();
```

### API

| Method                                         | Description                |
| ---------------------------------------------- | -------------------------- |
| `start()`                                      | Start the sync service     |
| `stop()`                                       | Stop the sync service      |
| `syncWorkflow(workflowId)`                     | Sync entire workflow state |
| `syncStateKey(workflowId, key)`                | Sync specific state key    |
| `syncFromCheckpoint(workflowId, checkpointId)` | Sync from checkpoint       |
| `onWorkflowComplete(workflowId)`               | Handle workflow completion |
| `flush()`                                      | Flush pending syncs        |
| `onSync(handler)`                              | Register event handler     |
| `getStats()`                                   | Get sync statistics        |

## MCP Tools

Ready-to-use MCP tool definitions:

```typescript
import {
  mcpTools,
  handleIndexWorkflow,
  handleSearchWorkflow,
  handleQueryMemory,
} from '@context-router/llamaindex-adapter/mcp';

// Available tools
for (const tool of mcpTools) {
  console.log(`${tool.name}: ${tool.description}`);
}

// Handle tool calls
const result = await handleIndexWorkflow(
  { workspaceId: 'ws-123', workflowId: 'wf-456' },
  { router, workspaceId: 'ws-123' },
);
```

### Available Tools

| Tool                | Description                                  |
| ------------------- | -------------------------------------------- |
| `index_workflow`    | Index a workflow's state for semantic search |
| `search_workflow`   | Semantic search over workflow data           |
| `query_memory`      | Query chat memory with natural language      |
| `extract_knowledge` | Extract entities and relationships           |
| `sync_state`        | Synchronize workflow state to vector index   |

## TypeScript

Full TypeScript support with type exports:

```typescript
import type {
  WorkflowState,
  CheckpointData,
  EmbeddingConfig,
  VectorStoreConfig,
  QueryOptions,
  IndexStats,
  Entity,
  Relationship,
} from '@context-router/llamaindex-adapter';
```

## Environment Variables

```bash
# LlamaIndex adapter settings
LLAMA_INDEX_ADAPTER_ENABLED=true

# Vector store
VECTOR_STORE_TYPE=pgvector  # or 'chromadb', 'qdrant', 'in-memory'
DATABASE_URL=postgresql://...

# For ChromaDB
CHROMA_HOST=localhost
CHROMA_PORT=8000

# For Qdrant
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=...
```

## Comparison with Other Adapters

| Feature            | LangGraph | CREWAI | LlamaIndex |
| ------------------ | --------- | ------ | ---------- |
| State sync         | Yes       | Yes    | Yes        |
| Checkpoint restore | Yes       | Yes    | Yes        |
| Handoff summaries  | Yes       | Yes    | Yes        |
| Vector search      | No        | No     | **Yes**    |
| Semantic retrieval | No        | No     | **Yes**    |
| Knowledge graphs   | No        | No     | **Yes**    |
| Chat memory        | No        | Yes    | Yes        |
| Tool integration   | Yes       | Yes    | Yes        |

## License

Apache 2.0
