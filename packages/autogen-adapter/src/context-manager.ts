/**
 * Context Manager for AutoGen agents
 *
 * Manages conversation context, session state, and selective context injection.
 */

import { ContextRouter, type WorkflowSession } from '@context-router/sdk';
import type {
  AutoGenAdapterConfig,
  ConversationMessage,
  AgentContext,
} from './types.js';

const MESSAGES_KEY = 'autogen:messages';

interface SessionData {
  workflowName: string;
  messages: ConversationMessage[];
  routerSession: WorkflowSession | null;
}

/**
 * Manages context for AutoGen agent sessions
 */
export class AutoGenContextManager {
  private config: AutoGenAdapterConfig;
  private router: ContextRouter | undefined;
  private routerInitFailed = false;
  private sessions: Map<string, SessionData> = new Map();

  constructor(config: AutoGenAdapterConfig) {
    this.config = config;
    this.router = config.router;
  }

  /**
   * Get or create a router instance (injected preferred; else ContextRouter.local)
   */
  private async getRouter(): Promise<ContextRouter | null> {
    if (this.router) {
      return this.router;
    }
    if (this.routerInitFailed) {
      return null;
    }
    try {
      this.router = await ContextRouter.local();
      return this.router;
    } catch {
      this.routerInitFailed = true;
      return null;
    }
  }

  private requireSession(sessionId: string): SessionData {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  }

  private async persistMessages(session: SessionData): Promise<void> {
    if (!session.routerSession) {
      return;
    }
    try {
      await session.routerSession.set(MESSAGES_KEY, {
        messages: session.messages,
      } as unknown as Record<string, unknown>);
    } catch {
      // Best-effort remote persistence
    }
  }

  /**
   * Whether a session exists in the local map
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Create a new session
   */
  async createSession(workflowName: string): Promise<{ sessionId: string }> {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    let routerSession: WorkflowSession | null = null;
    const router = await this.getRouter();
    if (router) {
      try {
        routerSession = await router.start(workflowName);
      } catch {
        routerSession = null;
      }
    }

    this.sessions.set(sessionId, {
      workflowName,
      messages: [],
      routerSession,
    });
    return { sessionId };
  }

  /**
   * Add a message to the session
   */
  async addMessage(
    sessionId: string,
    message: ConversationMessage,
  ): Promise<void> {
    const session = this.requireSession(sessionId);
    session.messages.push(message);
    await this.persistMessages(session);
  }

  /**
   * Replace the session's message list entirely (e.g. MCP restore)
   */
  async replaceMessages(
    sessionId: string,
    messages: ConversationMessage[],
  ): Promise<void> {
    const session = this.requireSession(sessionId);
    session.messages = [...messages];
    await this.persistMessages(session);
  }

  /**
   * Get relevant context for an agent turn
   */
  async getContext(sessionId: string, agentId: string): Promise<AgentContext> {
    const session = this.sessions.get(sessionId);
    return {
      sessionId,
      agentId,
      relevantMessages: session ? [...session.messages] : [],
      workflowState: {},
    };
  }

  /**
   * Clear a session
   */
  async clearSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);

    if (session?.routerSession) {
      try {
        await session.routerSession.complete();
      } catch {
        // Best-effort remote cleanup
      }
    }
  }
}
