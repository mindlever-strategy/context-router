/**
 * AutoGen Adapter factory
 *
 * Creates and configures AutoGen adapter components.
 */

import type {
  AutoGenAdapterConfig,
  AgentWrapperOptions,
  GroupChatConfig,
} from './types.js';

import { AutoGenContextManager } from './context-manager.js';
import { ContextRouterAgentWrapper } from './agent-wrapper.js';
import { GroupChatCoordinator } from './group-chat-coordinator.js';

/**
 * Create an AutoGen adapter with the given configuration
 */
export function createAutoGenAdapter(config: AutoGenAdapterConfig) {
  const contextManager = new AutoGenContextManager(config);

  return {
    /**
     * Create a new session
     */
    createSession: async (options: { workflowName: string }) => {
      const result = await contextManager.createSession(options.workflowName);
      return { ...result, workflowName: options.workflowName };
    },

    /**
     * Wrap an AutoGen agent with Context Router integration
     */
    wrapAgent: (agent: unknown, options: AgentWrapperOptions) => {
      return new ContextRouterAgentWrapper(agent, options);
    },

    /**
     * Create a group chat coordinator
     */
    createGroupChatCoordinator: (config: GroupChatConfig) => {
      return new GroupChatCoordinator(config);
    },

    /**
     * Get the context manager instance
     */
    getContextManager: () => {
      return contextManager;
    },
  };
}

export type AutoGenAdapter = ReturnType<typeof createAutoGenAdapter>;
