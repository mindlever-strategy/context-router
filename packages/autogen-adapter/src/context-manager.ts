/**
 * Context Manager for AutoGen agents
 *
 * Manages conversation context, session state, and selective context injection.
 */

import type {
  AutoGenAdapterConfig,
  ConversationMessage,
  AgentContext,
} from './types.js';

/**
 * Manages context for AutoGen agent sessions
 */
export class AutoGenContextManager {
  private config: AutoGenAdapterConfig;
  private sessions: Map<string, unknown> = new Map();

  constructor(config: AutoGenAdapterConfig) {
    this.config = config;
  }

  /**
   * Create a new session
   */
  async createSession(workflowName: string): Promise<{ sessionId: string }> {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.sessions.set(sessionId, { workflowName, messages: [] });
    return { sessionId };
  }

  /**
   * Add a message to the session
   */
  async addMessage(sessionId: string, message: ConversationMessage): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session && Array.isArray((session as { messages: unknown[] }).messages)) {
      (session as { messages: ConversationMessage[] }).messages.push(message);
    }
  }

  /**
   * Get relevant context for an agent turn
   */
  async getContext(sessionId: string, agentId: string): Promise<AgentContext> {
    const session = this.sessions.get(sessionId);
    return {
      sessionId,
      agentId,
      relevantMessages: session ? (session as { messages: ConversationMessage[] }).messages || [] : [],
      workflowState: {},
    };
  }

  /**
   * Clear a session
   */
  async clearSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}
