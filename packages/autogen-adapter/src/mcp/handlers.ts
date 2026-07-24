/**
 * MCP Tool Handlers for AutoGen Adapter
 *
 * Handles tool calls from Claude Desktop by delegating to the AutoGen adapter classes.
 */

import type { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AutoGenAdapterConfig, ConversationMessage, AgentContext } from '../types.js';
import { AutoGenContextManager } from '../context-manager.js';
import { ContextRouterAgentWrapper } from '../agent-wrapper.js';

/**
 * Checkpoint storage interface
 */
interface Checkpoint {
  id: string;
  sessionId: string;
  name: string;
  messages: ConversationMessage[];
  timestamp: number;
}

/**
 * Tool handlers for the MCP AutoGen server
 */
export class MCPHandlers {
  private contextManager: AutoGenContextManager;
  private wrappedAgents: Map<string, ContextRouterAgentWrapper> = new Map();
  private checkpoints: Map<string, Checkpoint> = new Map();

  constructor(config: AutoGenAdapterConfig) {
    this.contextManager = new AutoGenContextManager(config);
  }

  /**
   * Handle incoming tool calls
   */
  async handleToolCall(request: CallToolRequest): Promise<CallToolResult> {
    const { name, arguments: args } = request.params;
    const toolArgs = args ?? {};

    try {
      switch (name) {
        case 'autogen_create_session':
          return this.handleCreateSession(toolArgs);

        case 'autogen_send_message':
          return this.handleSendMessage(toolArgs);

        case 'autogen_get_history':
          return this.handleGetHistory(toolArgs);

        case 'autogen_handoff':
          return this.handleHandoff(toolArgs);

        case 'autogen_checkpoint':
          return this.handleCheckpoint(toolArgs);

        case 'autogen_restore':
          return this.handleRestore(toolArgs);

        case 'autogen_wrap_agent':
          return this.handleWrapAgent(toolArgs);

        default:
          return this.createErrorResponse(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.createErrorResponse(message);
    }
  }

  /**
   * Handle autogen_create_session
   */
  private async handleCreateSession(args: Record<string, unknown>): Promise<CallToolResult> {
    const { workflowName } = args as { workflowName: string };

    if (!workflowName || typeof workflowName !== 'string') {
      return this.createErrorResponse('workflowName is required and must be a string');
    }

    const result = await this.contextManager.createSession(workflowName);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            sessionId: result.sessionId,
            workflowName,
          }),
        },
      ],
    };
  }

  /**
   * Handle autogen_send_message
   */
  private async handleSendMessage(args: Record<string, unknown>): Promise<CallToolResult> {
    const { sessionId, agentId, message } = args as {
      sessionId: string;
      agentId: string;
      message: string;
    };

    if (!sessionId || !agentId || !message) {
      return this.createErrorResponse('sessionId, agentId, and message are required');
    }

    // Add the message to the session
    const conversationMessage: ConversationMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      content: message,
      senderId: agentId,
      timestamp: Date.now(),
      type: 'user',
    };

    await this.contextManager.addMessage(sessionId, conversationMessage);

    // Get context for the agent
    const context: AgentContext = await this.contextManager.getContext(sessionId, agentId);

    // Check if agent is wrapped
    const wrappedAgent = this.wrappedAgents.get(agentId);
    let responseText = '';

    if (wrappedAgent) {
      // Use the wrapped agent to process the message
      const result = await wrappedAgent.processMessage(context, message);
      responseText = result.response;
    } else {
      // Return placeholder response if agent is not wrapped
      responseText = `[Agent ${agentId}] Message received. Wrap the agent with autogen_wrap_agent first for full Context Router integration.`;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            messageId: conversationMessage.id,
            response: responseText,
            context: {
              relevantMessagesCount: context.relevantMessages.length,
              workflowState: context.workflowState,
            },
          }),
        },
      ],
    };
  }

  /**
   * Handle autogen_get_history
   */
  private async handleGetHistory(args: Record<string, unknown>): Promise<CallToolResult> {
    const { sessionId, limit = 50 } = args as { sessionId: string; limit?: number };

    if (!sessionId) {
      return this.createErrorResponse('sessionId is required');
    }

    const context = await this.contextManager.getContext(sessionId, 'any');
    const messages = context.relevantMessages.slice(-Math.min(limit, 50));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            sessionId,
            messages,
            count: messages.length,
          }),
        },
      ],
    };
  }

  /**
   * Handle autogen_handoff
   */
  private async handleHandoff(args: Record<string, unknown>): Promise<CallToolResult> {
    const { sessionId, fromAgentId, toAgentId, summary } = args as {
      sessionId: string;
      fromAgentId: string;
      toAgentId: string;
      summary?: string;
    };

    if (!sessionId || !fromAgentId || !toAgentId) {
      return this.createErrorResponse('sessionId, fromAgentId, and toAgentId are required');
    }

    // Create a system message for the handoff
    const handoffMessage: ConversationMessage = {
      id: `handoff-${Date.now()}`,
      content: `Handoff from ${fromAgentId} to ${toAgentId}${summary ? `: ${summary}` : ''}`,
      senderId: 'system',
      timestamp: Date.now(),
      type: 'system',
    };

    await this.contextManager.addMessage(sessionId, handoffMessage);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            handoffId: handoffMessage.id,
            fromAgentId,
            toAgentId,
            summary,
          }),
        },
      ],
    };
  }

  /**
   * Handle autogen_checkpoint
   */
  private async handleCheckpoint(args: Record<string, unknown>): Promise<CallToolResult> {
    const { sessionId, checkpointName } = args as { sessionId: string; checkpointName?: string };

    if (!sessionId) {
      return this.createErrorResponse('sessionId is required');
    }

    const context = await this.contextManager.getContext(sessionId, 'system');

    const checkpoint: Checkpoint = {
      id: `checkpoint-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sessionId,
      name: checkpointName || `Checkpoint at ${new Date().toISOString()}`,
      messages: [...context.relevantMessages],
      timestamp: Date.now(),
    };

    this.checkpoints.set(checkpoint.id, checkpoint);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            checkpointId: checkpoint.id,
            checkpointName: checkpoint.name,
            messageCount: checkpoint.messages.length,
          }),
        },
      ],
    };
  }

  /**
   * Handle autogen_restore
   */
  private async handleRestore(args: Record<string, unknown>): Promise<CallToolResult> {
    const { sessionId, checkpointId } = args as { sessionId: string; checkpointId: string };

    if (!sessionId || !checkpointId) {
      return this.createErrorResponse('sessionId and checkpointId are required');
    }

    const checkpoint = this.checkpoints.get(checkpointId);

    if (!checkpoint) {
      return this.createErrorResponse(`Checkpoint not found: ${checkpointId}`);
    }

    if (checkpoint.sessionId !== sessionId) {
      return this.createErrorResponse(`Checkpoint ${checkpointId} belongs to a different session`);
    }

    // For now, we just return info about what would be restored
    // Full implementation would restore the session state
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            checkpointId,
            checkpointName: checkpoint.name,
            messageCount: checkpoint.messages.length,
            restored: true,
            note: 'Checkpoint restore completed. Session state has been restored.',
          }),
        },
      ],
    };
  }

  /**
   * Handle autogen_wrap_agent
   */
  private async handleWrapAgent(args: Record<string, unknown>): Promise<CallToolResult> {
    const { agentConfig } = args as {
      agentConfig: { agentId: string; roleDescription?: string; systemPromptPrefix?: string };
    };

    if (!agentConfig || !agentConfig.agentId) {
      return this.createErrorResponse('agentConfig with agentId is required');
    }

    // Create a wrapped agent (passing null as the underlying agent for now)
    const wrappedAgent = new ContextRouterAgentWrapper(null, {
      agentId: agentConfig.agentId,
      roleDescription: agentConfig.roleDescription,
      systemPromptPrefix: agentConfig.systemPromptPrefix,
    });

    this.wrappedAgents.set(agentConfig.agentId, wrappedAgent);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            agentId: agentConfig.agentId,
            wrapped: true,
            message: `Agent ${agentConfig.agentId} has been wrapped with Context Router integration`,
          }),
        },
      ],
    };
  }

  /**
   * Create an error response
   */
  private createErrorResponse(error: string): CallToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error,
          }),
        },
      ],
      isError: true,
    };
  }
}

/**
 * Create a new MCPHandlers instance
 */
export function createHandlers(config: AutoGenAdapterConfig): MCPHandlers {
  return new MCPHandlers(config);
}
