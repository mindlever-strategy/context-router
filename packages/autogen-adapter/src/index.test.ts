import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAutoGenAdapter, AutoGenContextManager, ContextRouterAgentWrapper } from './index.js';
import { createHandlers, MCPHandlers } from './mcp/handlers.js';
import type { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import type { ContextRouter } from '@context-router/sdk';

function toolRequest(name: string, args: Record<string, unknown>): CallToolRequest {
  return { method: 'tools/call', params: { name, arguments: args } } as CallToolRequest;
}

function parseToolJson(result: { content: Array<{ type: string; text?: string }> }) {
  const text = result.content[0]?.text;
  expect(text).toBeDefined();
  return JSON.parse(text!) as Record<string, unknown>;
}

/** Lightweight injectable router so unit tests never spawn a real MCP server */
function createMockRouter() {
  const set = vi.fn(async () => undefined);
  const complete = vi.fn(async () => undefined);
  const start = vi.fn(async () => ({ set, complete }));
  return { start, set, complete, router: { start } as unknown as ContextRouter };
}

function managerConfig(router?: ContextRouter) {
  return {
    serverUrl: 'http://localhost:3000',
    router: router ?? createMockRouter().router,
  };
}

describe('AutoGen Adapter', () => {
  let adapter: ReturnType<typeof createAutoGenAdapter>;

  beforeEach(() => {
    adapter = createAutoGenAdapter(managerConfig());
  });

  describe('createAutoGenAdapter', () => {
    it('should create an adapter instance', () => {
      expect(adapter).toBeDefined();
      expect(adapter.createSession).toBeDefined();
      expect(adapter.wrapAgent).toBeDefined();
      expect(adapter.createGroupChatCoordinator).toBeDefined();
    });

    it('should create a session with a workflow name', async () => {
      const session = await adapter.createSession({ workflowName: 'test-workflow' });
      expect(session).toBeDefined();
      expect(session.sessionId).toBeDefined();
      expect(session.workflowName).toBe('test-workflow');
    });
  });

  describe('AutoGenContextManager', () => {
    it('should create a session', async () => {
      const manager = new AutoGenContextManager(managerConfig());
      const session = await manager.createSession('test');
      expect(session.sessionId).toBeDefined();
    });

    it('should add messages to a session', async () => {
      const manager = new AutoGenContextManager(managerConfig());
      const { sessionId } = await manager.createSession('test');

      await manager.addMessage(sessionId, {
        id: 'msg-1',
        content: 'Hello',
        senderId: 'user',
        timestamp: Date.now(),
        type: 'user',
      });

      const context = await manager.getContext(sessionId, 'agent-1');
      expect(context.relevantMessages).toHaveLength(1);
      expect(context.relevantMessages[0].content).toBe('Hello');
    });

    it('should clear a session', async () => {
      const manager = new AutoGenContextManager(managerConfig());
      const { sessionId } = await manager.createSession('test');

      await manager.clearSession(sessionId);
      const context = await manager.getContext(sessionId, 'agent-1');
      expect(context.relevantMessages).toHaveLength(0);
    });

    it('should throw when addMessage is called for an unknown session', async () => {
      const manager = new AutoGenContextManager(managerConfig());

      await expect(
        manager.addMessage('missing-session', {
          id: 'msg-1',
          content: 'Hello',
          senderId: 'user',
          timestamp: Date.now(),
          type: 'user',
        })
      ).rejects.toThrow('Session not found: missing-session');
    });

    it('should report hasSession for known and unknown sessions', async () => {
      const manager = new AutoGenContextManager(managerConfig());
      const { sessionId } = await manager.createSession('test');

      expect(manager.hasSession(sessionId)).toBe(true);
      expect(manager.hasSession('missing-session')).toBe(false);

      await manager.clearSession(sessionId);
      expect(manager.hasSession(sessionId)).toBe(false);
    });

    it('should replaceMessages restoring the full message list', async () => {
      const manager = new AutoGenContextManager(managerConfig());
      const { sessionId } = await manager.createSession('test');

      await manager.addMessage(sessionId, {
        id: 'msg-1',
        content: 'Hello',
        senderId: 'user',
        timestamp: Date.now(),
        type: 'user',
      });

      const restored = [
        {
          id: 'msg-a',
          content: 'Restored A',
          senderId: 'user',
          timestamp: 1,
          type: 'user' as const,
        },
        {
          id: 'msg-b',
          content: 'Restored B',
          senderId: 'assistant',
          timestamp: 2,
          type: 'assistant' as const,
        },
      ];

      await manager.replaceMessages(sessionId, restored);

      const context = await manager.getContext(sessionId, 'agent-1');
      expect(context.relevantMessages).toHaveLength(2);
      expect(context.relevantMessages.map((m) => m.content)).toEqual([
        'Restored A',
        'Restored B',
      ]);
    });

    it('should throw when replaceMessages is called for an unknown session', async () => {
      const manager = new AutoGenContextManager(managerConfig());

      await expect(
        manager.replaceMessages('missing-session', [])
      ).rejects.toThrow('Session not found: missing-session');
    });

    it('should persist messages via injected Context Router session.set', async () => {
      const mock = createMockRouter();
      const manager = new AutoGenContextManager(managerConfig(mock.router));
      const { sessionId } = await manager.createSession('wf-persist');

      expect(mock.start).toHaveBeenCalledWith('wf-persist');

      await manager.addMessage(sessionId, {
        id: 'msg-1',
        content: 'Persisted',
        senderId: 'user',
        timestamp: Date.now(),
        type: 'user',
      });

      expect(mock.set).toHaveBeenCalledWith(
        'autogen:messages',
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ content: 'Persisted' }),
          ]),
        })
      );
    });
  });

  describe('ContextRouterAgentWrapper', () => {
    it('should wrap an agent with context', () => {
      const mockAgent = {
        id: 'test-agent',
        name: 'TestAgent',
      };

      const wrapper = new ContextRouterAgentWrapper(mockAgent as any, {
        agentId: 'test-agent',
        roleDescription: 'A test agent',
      });

      expect(wrapper).toBeDefined();
      expect(wrapper.getContext).toBeDefined();
      expect(wrapper.injectContext).toBeDefined();
    });

    it('should provide context for the agent', async () => {
      const mockAgent = {
        id: 'test-agent',
        name: 'TestAgent',
      };

      const manager = new AutoGenContextManager(managerConfig());
      const { sessionId } = await manager.createSession('test');

      const wrapper = new ContextRouterAgentWrapper(mockAgent as any, {
        agentId: 'test-agent',
      });

      const context = await wrapper.getContext(sessionId);
      expect(context).toBeDefined();
      expect(context.agentId).toBe('test-agent');
    });

    it('should return messages from contextManager when provided', async () => {
      const mockAgent = { id: 'test-agent', name: 'TestAgent' };
      const manager = new AutoGenContextManager(managerConfig());
      const { sessionId } = await manager.createSession('test');

      await manager.addMessage(sessionId, {
        id: 'msg-1',
        content: 'Hello from manager',
        senderId: 'user',
        timestamp: Date.now(),
        type: 'user',
      });

      const wrapper = new ContextRouterAgentWrapper(mockAgent as any, {
        agentId: 'test-agent',
        contextManager: manager,
      });

      const context = await wrapper.getContext(sessionId);
      expect(context.relevantMessages).toHaveLength(1);
      expect(context.relevantMessages[0].content).toBe('Hello from manager');
      expect(context.agentId).toBe('test-agent');
      expect(context.sessionId).toBe(sessionId);
    });

    it('should fall back to empty messages when contextManager is absent', async () => {
      const wrapper = new ContextRouterAgentWrapper({ id: 'a' } as any, {
        agentId: 'test-agent',
      });

      const context = await wrapper.getContext('session-missing');
      expect(context.relevantMessages).toEqual([]);
      expect(context.agentId).toBe('test-agent');
    });
  });

  describe('adapter wrapAgent shared contextManager', () => {
    it('should share adapter contextManager so wrapper getContext sees messages', async () => {
      const { sessionId } = await adapter.createSession({ workflowName: 'shared-mgr' });
      const manager = adapter.getContextManager();

      await manager.addMessage(sessionId, {
        id: 'msg-shared',
        content: 'Shared via adapter',
        senderId: 'user',
        timestamp: Date.now(),
        type: 'user',
      });

      const wrapper = adapter.wrapAgent({ id: 'agent-shared' }, { agentId: 'agent-shared' });
      const context = await wrapper.getContext(sessionId);

      expect(context.relevantMessages).toHaveLength(1);
      expect(context.relevantMessages[0].content).toBe('Shared via adapter');
      expect(context.agentId).toBe('agent-shared');
    });
  });

  describe('MCPHandlers', () => {
    const config = managerConfig();

    it('should persist user and assistant messages with senderId user for inbound', async () => {
      const handlers = createHandlers(config);
      const created = parseToolJson(
        await handlers.handleToolCall(toolRequest('autogen_create_session', { workflowName: 'mcp-chat' }))
      );
      expect(created.success).toBe(true);
      const sessionId = created.sessionId as string;

      const sent = parseToolJson(
        await handlers.handleToolCall(
          toolRequest('autogen_send_message', {
            sessionId,
            agentId: 'agent-1',
            message: 'Hello agent',
          })
        )
      );
      expect(sent.success).toBe(true);
      expect(sent.response).toBeDefined();

      const history = parseToolJson(
        await handlers.handleToolCall(toolRequest('autogen_get_history', { sessionId }))
      );
      expect(history.success).toBe(true);
      const messages = history.messages as Array<{ type: string; senderId: string; content: string }>;
      expect(messages.length).toBeGreaterThanOrEqual(2);

      const userMsg = messages.find((m) => m.type === 'user');
      const assistantMsg = messages.find((m) => m.type === 'assistant');
      expect(userMsg).toBeDefined();
      expect(userMsg!.senderId).toBe('user');
      expect(userMsg!.content).toBe('Hello agent');
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg!.senderId).toBe('agent-1');
      expect(assistantMsg!.content).toBe(sent.response);
    });

    it('should restore checkpoint messages into a shared context manager', async () => {
      const manager = new AutoGenContextManager(config);
      const handlers = createHandlers(config, manager);

      const created = parseToolJson(
        await handlers.handleToolCall(toolRequest('autogen_create_session', { workflowName: 'mcp-restore' }))
      );
      const sessionId = created.sessionId as string;

      await handlers.handleToolCall(
        toolRequest('autogen_send_message', {
          sessionId,
          agentId: 'agent-1',
          message: 'before checkpoint',
        })
      );

      const checkpointed = parseToolJson(
        await handlers.handleToolCall(
          toolRequest('autogen_checkpoint', { sessionId, checkpointName: 'snap-1' })
        )
      );
      expect(checkpointed.success).toBe(true);
      const checkpointId = checkpointed.checkpointId as string;
      const messageCountAtCheckpoint = checkpointed.messageCount as number;
      expect(messageCountAtCheckpoint).toBeGreaterThanOrEqual(2);

      await handlers.handleToolCall(
        toolRequest('autogen_send_message', {
          sessionId,
          agentId: 'agent-1',
          message: 'after checkpoint',
        })
      );

      const beforeRestore = await manager.getContext(sessionId, 'agent-1');
      expect(beforeRestore.relevantMessages.length).toBeGreaterThan(messageCountAtCheckpoint);

      const restored = parseToolJson(
        await handlers.handleToolCall(
          toolRequest('autogen_restore', { sessionId, checkpointId })
        )
      );
      expect(restored.success).toBe(true);
      expect(restored.restored).toBe(true);

      const afterRestore = await manager.getContext(sessionId, 'agent-1');
      expect(afterRestore.relevantMessages).toHaveLength(messageCountAtCheckpoint);
      expect(afterRestore.relevantMessages.some((m) => m.content === 'after checkpoint')).toBe(false);
      expect(afterRestore.relevantMessages.some((m) => m.content === 'before checkpoint')).toBe(true);
    });

    it('should fail restore when checkpoint is missing', async () => {
      const handlers = createHandlers(config);
      const created = parseToolJson(
        await handlers.handleToolCall(toolRequest('autogen_create_session', { workflowName: 'mcp-missing-cp' }))
      );

      const result = parseToolJson(
        await handlers.handleToolCall(
          toolRequest('autogen_restore', {
            sessionId: created.sessionId,
            checkpointId: 'checkpoint-does-not-exist',
          })
        )
      );
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error for send_message to unknown session', async () => {
      const handlers = createHandlers(config);
      const result = await handlers.handleToolCall(
        toolRequest('autogen_send_message', {
          sessionId: 'session-unknown-xyz',
          agentId: 'agent-1',
          message: 'orphan',
        })
      );
      const body = parseToolJson(result);
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
      expect(result.isError).toBe(true);
    });

    it('should accept an optional shared contextManager (backward compatible default)', () => {
      const manager = new AutoGenContextManager(config);
      const withShared = createHandlers(config, manager);
      const without = createHandlers(config);
      expect(withShared).toBeInstanceOf(MCPHandlers);
      expect(without).toBeInstanceOf(MCPHandlers);
    });
  });
});
