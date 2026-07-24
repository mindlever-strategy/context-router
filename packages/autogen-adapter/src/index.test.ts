import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAutoGenAdapter, AutoGenContextManager, ContextRouterAgentWrapper } from './index.js';

describe('AutoGen Adapter', () => {
  let adapter: ReturnType<typeof createAutoGenAdapter>;

  beforeEach(() => {
    adapter = createAutoGenAdapter({
      serverUrl: 'http://localhost:3000',
    });
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
      const manager = new AutoGenContextManager({ serverUrl: 'http://localhost:3000' });
      const session = await manager.createSession('test');
      expect(session.sessionId).toBeDefined();
    });

    it('should add messages to a session', async () => {
      const manager = new AutoGenContextManager({ serverUrl: 'http://localhost:3000' });
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
      const manager = new AutoGenContextManager({ serverUrl: 'http://localhost:3000' });
      const { sessionId } = await manager.createSession('test');

      await manager.clearSession(sessionId);
      const context = await manager.getContext(sessionId, 'agent-1');
      expect(context.relevantMessages).toHaveLength(0);
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

      const manager = new AutoGenContextManager({ serverUrl: 'http://localhost:3000' });
      const { sessionId } = await manager.createSession('test');

      const wrapper = new ContextRouterAgentWrapper(mockAgent as any, {
        agentId: 'test-agent',
      });

      const context = await wrapper.getContext(sessionId);
      expect(context).toBeDefined();
      expect(context.agentId).toBe('test-agent');
    });
  });
});
