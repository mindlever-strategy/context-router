import 'dotenv/config';
import { z } from 'zod';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import {
  ListToolsRequestSchema,
  ListToolsResultSchema,
  CallToolRequestSchema,
  CallToolResultSchema,
} from '@modelcontextprotocol/sdk/types';
import { registerWorkspaceTools } from './tools/workspace';
import { registerSchemaTools } from './tools/schema';
import { registerStateTools } from './tools/state';
import { registerCheckpointTools } from './tools/checkpoint';
import { registerHandoffTools } from './tools/handoff';
import { registerWorkflowTools } from './tools/workflow';

/**
 * MCP Tool handler interface
 */
interface Tool {
  definition: {
    name: string;
    description?: string;
    inputSchema: {
      type: 'object';
      properties?: Record<string, unknown>;
      required?: string[];
    };
  };
  handler: (args: unknown) => Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }>;
}

// Create and configure the MCP server with all registered tools
const server = new McpServer(
  {
    name: 'context-router',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Store all registered tools for lookup
const allTools = new Map<string, Tool>();

// For MCP stdio mode, we don't have traditional auth context
// User ID would be passed via initialization or derived from the session
const getCurrentUserId = (): string | undefined => {
  // In stdio mode, user context is typically established via initialization
  // Return undefined to allow tool handlers to handle auth requirements
  return undefined;
};

// Register all tools and collect them for tool listing
const workspaceTools = registerWorkspaceTools(server, getCurrentUserId);
workspaceTools.forEach((tool, name) => allTools.set(name, tool));

const schemaTools = registerSchemaTools(server, getCurrentUserId);
schemaTools.forEach((tool, name) => allTools.set(name, tool));

const stateTools = registerStateTools(server, getCurrentUserId);
stateTools.forEach((tool, name) => allTools.set(name, tool));

const checkpointTools = registerCheckpointTools(server, getCurrentUserId);
checkpointTools.forEach((tool, name) => allTools.set(name, tool));

const handoffTools = registerHandoffTools(server, getCurrentUserId);
handoffTools.forEach((tool, name) => allTools.set(name, tool));

const workflowTools = registerWorkflowTools(server, getCurrentUserId);
workflowTools.forEach((tool, name) => allTools.set(name, tool));

// Tool listing handler - returns all available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = Array.from(allTools.values()).map((tool) => ({
    name: tool.definition.name,
    description: tool.definition.description || '',
    inputSchema: tool.definition.inputSchema,
  }));

  return ListToolsResultSchema.parse({ tools });
});

// Tool call handler - dispatches to the appropriate tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  const tool = allTools.get(name);

  if (!tool) {
    return CallToolResultSchema.parse({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: 'Tool not found',
            name,
            availableTools: Array.from(allTools.keys()),
          }),
        },
      ],
      isError: true,
    });
  }

  try {
    const result = await tool.handler(args);
    return CallToolResultSchema.parse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return CallToolResultSchema.parse({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: 'Tool execution failed',
            details: message,
          }),
        },
      ],
      isError: true,
    });
  }
});

// Start the server
async function main(): Promise<void> {
  console.error('Starting Context Router MCP Server...');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Context Router MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
