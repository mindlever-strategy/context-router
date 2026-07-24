/**
 * Context Router - AutoGen Adapter
 *
 * Bridges Microsoft AutoGen agents with Context Router's structured state management.
 *
 * Benefits:
 * - Persistent memory across agent sessions
 * - Selective context injection (only relevant messages)
 * - Agent handoffs with structured summaries
 * - Group chat coordination
 * - Checkpoint/resume capabilities
 *
 * Usage:
 * ```typescript
 * import { createAutoGenAdapter, AutoGenContextManager } from '@context-router/autogen-adapter';
 *
 * const adapter = createAutoGenAdapter();
 *
 * // Wrap an AutoGen agent
 * const wrappedAgent = adapter.wrapAgent(autogenAgent);
 *
 * // Start a session
 * const session = await adapter.createSession({ workflowName: 'my-workflow' });
 *
 * // Use in group chat
 * const coordinator = adapter.createGroupChatCoordinator({
 *   agents: [agentA, agentB, agentC]
 * });
 *
 * await coordinator.run();
 * ```
 */

// Re-export types for consumers
export type {
  AutoGenAdapterConfig,
  AgentWrapperOptions,
  GroupChatConfig,
  ConversationMessage,
  AgentContext,
  HandoffInfo,
} from './types.js';

// Re-export main classes
export { AutoGenContextManager } from './context-manager.js';
export { ContextRouterAgentWrapper } from './agent-wrapper.js';
export { GroupChatCoordinator } from './group-chat-coordinator.js';

// Factory function
export { createAutoGenAdapter } from './adapter.js';
