/**
 * Group Chat Coordinator for AutoGen agents
 *
 * Coordinates multi-agent conversations using Context Router's state management.
 */

import type { GroupChatConfig, ConversationMessage } from './types.js';

/**
 * Coordinates group chat between multiple AutoGen agents
 */
export class GroupChatCoordinator {
  private config: GroupChatConfig;
  private messages: ConversationMessage[] = [];
  private sessionId: string;

  constructor(config: GroupChatConfig) {
    this.config = config;
    this.sessionId = `group-session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  /**
   * Get the session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Run the group chat
   */
  async run(): Promise<ConversationMessage[]> {
    const maxTurns = this.config.maxTurns ?? 10;
    const agents = this.config.agents;

    if (agents.length === 0) {
      return this.messages;
    }

    let currentTurn = 0;
    while (currentTurn < maxTurns) {
      // Simple round-robin for now
      const agentIndex = currentTurn % agents.length;
      const agent = agents[agentIndex];

      // Placeholder for actual agent invocation
      const response: ConversationMessage = {
        id: `msg-${Date.now()}-${currentTurn}`,
        content: `[Agent ${agentIndex}] Turn ${currentTurn + 1}`,
        senderId: `agent-${agentIndex}`,
        timestamp: Date.now(),
        type: 'assistant',
      };

      this.messages.push(response);
      currentTurn++;
    }

    return this.messages;
  }

  /**
   * Get all messages in the conversation
   */
  getMessages(): ConversationMessage[] {
    return [...this.messages];
  }

  /**
   * Add a message to the conversation
   */
  addMessage(message: ConversationMessage): void {
    this.messages.push(message);
  }
}
