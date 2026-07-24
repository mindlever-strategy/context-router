# AutoGen Adapter for Context Router

[![npm version](https://img.shields.io/npm/v/@context-router/autogen-adapter)](https://www.npmjs.com/package/@context-router/autogen-adapter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)

Bridges Microsoft AutoGen agents with Context Router's structured state management. Enables persistent memory, selective context injection, agent handoffs, group chat coordination, and checkpoint/restore capabilities.

## Installation

```bash
npm install @context-router/autogen-adapter
```

**Peer Dependencies:**
- `@context-router/sdk` ^0.4.0

## Quick Start

```typescript
import { createAutoGenAdapter } from '@context-router/autogen-adapter';

// Create the adapter
const adapter = createAutoGenAdapter({
  serverUrl: 'http://localhost:3000',
  apiKey: 'your-api-key',
});

// Wrap an AutoGen agent
const wrappedAgent = adapter.wrapAgent(myAutogenAgent, {
  agentId: 'assistant-1',
  roleDescription: 'Helpful AI assistant',
});

// Create a session
const { sessionId } = await adapter.createSession({
  workflowName: 'customer-support',
});

// Send messages
const result = await adapter.getContextManager().getContext(sessionId, 'assistant-1');
```

## Features

- **Persistent Memory** - Maintains conversation context across agent sessions
- **Selective Context Injection** - Only relevant messages are injected to agents
- **Agent Handoffs** - Structured transfers between agents with summaries
- **Group Chat Coordination** - Coordinate multi-agent conversations
- **Checkpoint/Restore** - Save and resume conversation state
- **MCP Server** - Integrate with Claude Desktop via Model Context Protocol
- **TypeScript Support** - Full type definitions included

## API Reference

### `createAutoGenAdapter(config)`

Factory function that creates an AutoGen adapter instance.

```typescript
import { createAutoGenAdapter } from '@context-router/autogen-adapter';

const adapter = createAutoGenAdapter({
  serverUrl: 'http://localhost:3000',  // Required
  apiKey: 'optional-api-key',          // Optional
  sessionTtl: 3600,                    // Optional, default session TTL in seconds
});
```

Returns an adapter with the following methods:

| Method | Description |
|--------|-------------|
| `createSession(options)` | Create a new conversation session |
| `wrapAgent(agent, options)` | Wrap an AutoGen agent with Context Router |
| `createGroupChatCoordinator(config)` | Create a group chat coordinator |
| `getContextManager()` | Get the context manager instance |

### AutoGenContextManager

Manages conversation context, session state, and selective context injection.

```typescript
import { AutoGenContextManager } from '@context-router/autogen-adapter';

const contextManager = new AutoGenContextManager({
  serverUrl: 'http://localhost:3000',
});

// Create a new session
const { sessionId } = await contextManager.createSession('my-workflow');

// Add a message
await contextManager.addMessage(sessionId, {
  id: 'msg-1',
  content: 'Hello, world!',
  senderId: 'user-1',
  timestamp: Date.now(),
  type: 'user',
});

// Get context for an agent
const context = await contextManager.getContext(sessionId, 'agent-1');
// Returns: { sessionId, agentId, relevantMessages, workflowState }

// Clear a session
await contextManager.clearSession(sessionId);
```

#### Methods

| Method | Description |
|--------|-------------|
| `createSession(workflowName)` | Create a new session, returns `{ sessionId }` |
| `addMessage(sessionId, message)` | Add a message to the session |
| `getContext(sessionId, agentId)` | Get relevant context for an agent turn |
| `clearSession(sessionId)` | Delete a session and its data |

### ContextRouterAgentWrapper

Wraps an AutoGen agent to integrate with Context Router's state management.

```typescript
import { ContextRouterAgentWrapper } from '@context-router/autogen-adapter';

const wrapper = new ContextRouterAgentWrapper(myAutogenAgent, {
  agentId: 'assistant-1',
  roleDescription: 'Helpful AI assistant',
  systemPromptPrefix: 'You are a helpful assistant.',
});

// Get the agent ID
const agentId = wrapper.getAgentId();

// Process a message with context injection
const result = await wrapper.processMessage(context, 'Hello!');
// Returns: { response: string, updatedContext: AgentContext }

// Get the wrapped agent instance
const agent = wrapper.getWrappedAgent();
```

#### Methods

| Method | Description |
|--------|-------------|
| `getAgentId()` | Get the wrapped agent's ID |
| `processMessage(context, message)` | Process a message with context injection |
| `getWrappedAgent()` | Get the underlying AutoGen agent |

### GroupChatCoordinator

Coordinates group chat between multiple AutoGen agents.

```typescript
import { GroupChatCoordinator } from '@context-router/autogen-adapter';

const coordinator = new GroupChatCoordinator({
  agents: [agentA, agentB, agentC],
  maxTurns: 10,
  speakerSelectionMethod: 'round_robin', // 'round_robin' | 'auto' | 'random'
});

// Run the group chat
const messages = await coordinator.run();

// Get all messages
const allMessages = coordinator.getMessages();

// Add a message
coordinator.addMessage({
  id: 'msg-1',
  content: 'Starting the discussion...',
  senderId: 'moderator',
  timestamp: Date.now(),
  type: 'system',
});
```

#### Methods

| Method | Description |
|--------|-------------|
| `run()` | Execute the group chat, returns all messages |
| `getMessages()` | Get all messages in the conversation |
| `addMessage(message)` | Add a message to the conversation |

### Types

```typescript
interface AutoGenAdapterConfig {
  serverUrl: string;
  apiKey?: string;
  sessionTtl?: number;
}

interface AgentWrapperOptions {
  agentId: string;
  roleDescription?: string;
  systemPromptPrefix?: string;
}

interface GroupChatConfig {
  agents: unknown[];
  maxTurns?: number;
  speakerSelectionMethod?: 'round_robin' | 'auto' | 'random';
}

interface ConversationMessage {
  id: string;
  content: string;
  senderId: string;
  timestamp: number;
  type: 'user' | 'assistant' | 'system';
}

interface AgentContext {
  sessionId: string;
  agentId: string;
  relevantMessages: ConversationMessage[];
  workflowState: Record<string, unknown>;
}

interface HandoffInfo {
  targetAgentId: string;
  summary: string;
  reason: string;
}
```

## MCP Server

The adapter includes an MCP (Model Context Protocol) server for Claude Desktop integration.

### Running the MCP Server

Create a script to start the server:

```typescript
// mcp-server.ts
import { MCPAutoGenServer } from '@context-router/autogen-adapter/mcp';

const server = new MCPAutoGenServer({
  serverUrl: 'http://localhost:3000',
  apiKey: 'your-api-key',
});

server.start().catch(console.error);
```

Configure Claude Desktop to use the server:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "context-router-autogen": {
      "command": "npx",
      "args": ["tsx", "path/to/mcp-server.ts"]
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `autogen_create_session` | Create a new AutoGen conversation session |
| `autogen_send_message` | Send a message to an AutoGen agent |
| `autogen_get_history` | Get conversation history for a session |
| `autogen_handoff` | Transfer context between agents |
| `autogen_checkpoint` | Save a checkpoint for the session |
| `autogen_restore` | Restore from a checkpoint |
| `autogen_wrap_agent` | Wrap an AutoGen agent with Context Router |

### MCP Tool Examples

```typescript
// Create a session
await mcp.callTool({
  name: 'autogen_create_session',
  arguments: { workflowName: 'customer-support' },
});

// Send a message
await mcp.callTool({
  name: 'autogen_send_message',
  arguments: {
    sessionId: 'session-123',
    agentId: 'assistant-1',
    message: 'Help me with my order',
  },
});

// Get conversation history
await mcp.callTool({
  name: 'autogen_get_history',
  arguments: { sessionId: 'session-123', limit: 50 },
});

// Hand off to another agent
await mcp.callTool({
  name: 'autogen_handoff',
  arguments: {
    sessionId: 'session-123',
    fromAgentId: 'triage-agent',
    toAgentId: 'support-agent',
    summary: 'Customer needs help with order status',
  },
});

// Create a checkpoint
await mcp.callTool({
  name: 'autogen_checkpoint',
  arguments: {
    sessionId: 'session-123',
    checkpointName: 'pre-checkout-state',
  },
});

// Restore from checkpoint
await mcp.callTool({
  name: 'autogen_restore',
  arguments: {
    sessionId: 'session-123',
    checkpointId: 'checkpoint-456',
  },
});

// Wrap an agent
await mcp.callTool({
  name: 'autogen_wrap_agent',
  arguments: {
    agentConfig: {
      agentId: 'support-agent',
      roleDescription: 'Customer support specialist',
      systemPromptPrefix: 'You are a helpful support agent.',
    },
  },
});
```

## Examples

### Single Agent Usage

```typescript
import { createAutoGenAdapter } from '@context-router/autogen-adapter';

const adapter = createAutoGenAdapter({ serverUrl: 'http://localhost:3000' });

// Create session
const { sessionId } = await adapter.createSession({ workflowName: 'chatbot' });

// Wrap agent
const agent = adapter.wrapAgent(myAgent, { agentId: 'assistant' });

// Add user message
await adapter.getContextManager().addMessage(sessionId, {
  id: '1',
  content: 'Hello!',
  senderId: 'user',
  timestamp: Date.now(),
  type: 'user',
});

// Get context and process
const context = await adapter.getContextManager().getContext(sessionId, 'assistant');
const result = await agent.processMessage(context, 'Hello!');
```

### Group Chat Usage

```typescript
import { createAutoGenAdapter } from '@context-router/autogen-adapter';

const adapter = createAutoGenAdapter({ serverUrl: 'http://localhost:3000' });

// Create group chat coordinator
const coordinator = adapter.createGroupChatCoordinator({
  agents: [triageAgent, salesAgent, supportAgent],
  maxTurns: 20,
  speakerSelectionMethod: 'auto',
});

// Run the conversation
const messages = await coordinator.run();

console.log(`Group chat completed with ${messages.length} messages`);
```

### Agent Handoff

```typescript
import { createAutoGenAdapter } from '@context-router/autogen-adapter';

const adapter = createAutoGenAdapter({ serverUrl: 'http://localhost:3000' });
const contextManager = adapter.getContextManager();

const { sessionId } = await adapter.createSession({ workflowName: 'sales' });

// Record handoff
await contextManager.addMessage(sessionId, {
  id: 'handoff-1',
  content: 'Handoff from Triage to Sales - Customer wants enterprise plan',
  senderId: 'system',
  timestamp: Date.now(),
  type: 'system',
});

// Get updated context for new agent
const context = await contextManager.getContext(sessionId, 'sales-agent');
```

### Checkpoint and Restore

```typescript
import { createAutoGenAdapter } from '@context-router/autogen-adapter';
import { MCPAutoGenServer, createHandlers } from '@context-router/autogen-adapter/mcp';

const adapter = createAutoGenAdapter({ serverUrl: 'http://localhost:3000' });
const { sessionId } = await adapter.createSession({ workflowName: 'demo' });

// ... conversation happens ...

// Create checkpoint via MCP handlers
const handlers = createHandlers({ serverUrl: 'http://localhost:3000' });

const checkpointResult = await handlers.handleToolCall({
  params: {
    name: 'autogen_checkpoint',
    arguments: { sessionId, checkpointName: 'mid-conversation' },
  },
});

// Later, restore from checkpoint
const restoreResult = await handlers.handleToolCall({
  params: {
    name: 'autogen_restore',
    arguments: { sessionId, checkpointId: 'checkpoint-123' },
  },
});
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application                               │
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────────────────────────┐ │
│  │ AutoGen Agents  │    │         AutoGenContextManager        │ │
│  │                 │    │                                      │ │
│  │  - Agent A      │◄───┤  - createSession()                   │ │
│  │  - Agent B      │    │  - addMessage()                      │ │
│  │  - Agent C      │    │  - getContext()                      │ │
│  └────────┬────────┘    │  - clearSession()                   │ │
│           │             └──────────────────┬──────────────────┘ │
│           │                                │                     │
│           ▼                                ▼                     │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              ContextRouterAgentWrapper                       ││
│  │  - Wraps individual AutoGen agents                          ││
│  │  - Injects selective context                                ││
│  │  - Returns responses with updated context                   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              GroupChatCoordinator                            ││
│  │  - Manages multi-agent conversations                        ││
│  │  - Round-robin / auto / random speaker selection            ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                  MCPAutoGenServer                            ││
│  │  - Exposes tools via Model Context Protocol                 ││
│  │  - Connects to Claude Desktop                               ││
│  │  - Tools: create_session, send_message, handoff, etc.      ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Context Router API                          │
│                      (serverUrl configured)                      │
└─────────────────────────────────────────────────────────────────┘
```

## License

MIT
