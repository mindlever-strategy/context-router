/**
 * MCP Tool Definitions for AutoGen Adapter
 *
 * These tools expose AutoGen adapter capabilities via the Model Context Protocol.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Tool definitions for AutoGen adapter MCP server
 */
export const autogenTools: Tool[] = [
  {
    name: 'autogen_create_session',
    description: 'Create a new AutoGen conversation session',
    inputSchema: {
      type: 'object',
      properties: {
        workflowName: {
          type: 'string',
          description: 'Name of the workflow',
        },
      },
      required: ['workflowName'],
    },
  },
  {
    name: 'autogen_send_message',
    description: 'Send a message to an AutoGen agent',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The session ID to send the message to',
        },
        agentId: {
          type: 'string',
          description: 'The agent ID to receive the message',
        },
        message: {
          type: 'string',
          description: 'The message content to send',
        },
      },
      required: ['sessionId', 'agentId', 'message'],
    },
  },
  {
    name: 'autogen_get_history',
    description: 'Get conversation history for a session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The session ID to get history for',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of messages to return (default: 50)',
          default: 50,
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'autogen_handoff',
    description: 'Transfer context between agents',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The session ID for the handoff',
        },
        fromAgentId: {
          type: 'string',
          description: 'The source agent ID',
        },
        toAgentId: {
          type: 'string',
          description: 'The target agent ID to handoff to',
        },
        summary: {
          type: 'string',
          description: 'Summary of the conversation for the handoff',
        },
      },
      required: ['sessionId', 'fromAgentId', 'toAgentId'],
    },
  },
  {
    name: 'autogen_checkpoint',
    description: 'Save a checkpoint for the session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The session ID to checkpoint',
        },
        checkpointName: {
          type: 'string',
          description: 'Name for the checkpoint',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'autogen_restore',
    description: 'Restore from a checkpoint',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The session ID to restore to',
        },
        checkpointId: {
          type: 'string',
          description: 'The checkpoint ID to restore from',
        },
      },
      required: ['sessionId', 'checkpointId'],
    },
  },
  {
    name: 'autogen_wrap_agent',
    description: 'Wrap an AutoGen agent with Context Router',
    inputSchema: {
      type: 'object',
      properties: {
        agentConfig: {
          type: 'object',
          description: 'Agent configuration including agentId, roleDescription, and systemPromptPrefix',
          properties: {
            agentId: { type: 'string' },
            roleDescription: { type: 'string' },
            systemPromptPrefix: { type: 'string' },
          },
          required: ['agentId'],
        },
      },
      required: ['agentConfig'],
    },
  },
];
