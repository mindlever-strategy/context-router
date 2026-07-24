/**
 * Type definitions for the AutoGen adapter
 */

/**
 * Configuration options for the AutoGen adapter
 */
export interface AutoGenAdapterConfig {
  /** Context Router server URL */
  serverUrl: string;
  /** API key for Context Router */
  apiKey?: string;
  /** Default session TTL in seconds */
  sessionTtl?: number;
}

/**
 * Options for wrapping an AutoGen agent
 */
export interface AgentWrapperOptions {
  /** Agent ID for tracking */
  agentId: string;
  /** Agent role description */
  roleDescription?: string;
  /** System prompt prefix */
  systemPromptPrefix?: string;
}

/**
 * Configuration for group chat coordination
 */
export interface GroupChatConfig {
  /** List of agents in the group chat */
  agents: unknown[];
  /** Maximum turns before termination */
  maxTurns?: number;
  /** Message speaker selection logic */
  speakerSelectionMethod?: 'round_robin' | 'auto' | 'random';
}

/**
 * A message in a conversation
 */
export interface ConversationMessage {
  /** Unique message ID */
  id: string;
  /** Message content */
  content: string;
  /** Sender agent ID */
  senderId: string;
  /** Timestamp */
  timestamp: number;
  /** Message type */
  type: 'user' | 'assistant' | 'system';
}

/**
 * Context for an agent's turn
 */
export interface AgentContext {
  /** Session ID */
  sessionId: string;
  /** Agent ID */
  agentId: string;
  /** Relevant messages for this turn */
  relevantMessages: ConversationMessage[];
  /** Current workflow state */
  workflowState: Record<string, unknown>;
}

/**
 * Information about an agent handoff
 */
export interface HandoffInfo {
  /** ID of the agent to hand off to */
  targetAgentId: string;
  /** Summary of the conversation so far */
  summary: string;
  /** Reason for handoff */
  reason: string;
}
