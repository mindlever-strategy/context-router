/**
 * Context Router agent wrapper for AutoGen
 *
 * Wraps an AutoGen agent to integrate with Context Router's state management.
 */

import type { AgentWrapperOptions, AgentContext } from './types.js';

/**
 * Wraps an AutoGen agent with Context Router integration
 */
export class ContextRouterAgentWrapper {
  private agentId: string;
  private options: AgentWrapperOptions;
  private wrappedAgent: unknown;

  constructor(agent: unknown, options: AgentWrapperOptions) {
    this.agentId = options.agentId;
    this.options = options;
    this.wrappedAgent = agent;
  }

  /**
   * Get the agent ID
   */
  getAgentId(): string {
    return this.agentId;
  }

  /**
   * Process a message with context injection
   */
  async processMessage(
    context: AgentContext,
    message: string
  ): Promise<{ response: string; updatedContext: AgentContext }> {
    return {
      response: `[Context Router wrapped agent ${this.agentId}]: ${message}`,
      updatedContext: context,
    };
  }

  /**
   * Get context for this agent
   */
  async getContext(sessionId: string): Promise<AgentContext> {
    return {
      sessionId,
      agentId: this.agentId,
      relevantMessages: [],
      workflowState: {},
    };
  }

  /**
   * Inject context into the agent's prompt
   */
  injectContext(context: AgentContext): string {
    const systemPrompt = this.options.systemPromptPrefix || '';
    const messages = context.relevantMessages
      .map((m) => `[${m.senderId}]: ${m.content}`)
      .join('\n');

    return `${systemPrompt}\n\nRelevant context:\n${messages}`.trim();
  }

  /**
   * Get the wrapped agent instance
   */
  getWrappedAgent(): unknown {
    return this.wrappedAgent;
  }
}
