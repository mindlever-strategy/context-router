#!/usr/bin/env node
import 'dotenv/config';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  ListToolsResultSchema,
  CallToolRequestSchema,
  CallToolResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { registerWorkspaceTools } from './tools/workspace.js';
import { registerSchemaTools } from './tools/schema.js';
import { registerStateTools } from './tools/state.js';
import { registerCheckpointTools } from './tools/checkpoint.js';
import { registerHandoffTools } from './tools/handoff.js';
import { registerWorkflowTools } from './tools/workflow.js';
import { failure, type Tool } from './tools/tool-kit.js';

// Create and configure the MCP server with all registered tools
const server = new McpServer(
  {
    name: 'context-router',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Store all registered tools for lookup
const allTools = new Map<string, Tool>();

// stdio is a trusted local transport. The owner ID scopes every database query.
const getCurrentUserId = (): string =>
  process.env.CONTEXT_ROUTER_OWNER_ID?.trim() || 'local';

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
    return CallToolResultSchema.parse(
      failure('TOOL_NOT_FOUND', `Unknown tool: ${name}`, {
        availableTools: Array.from(allTools.keys()),
      }),
    );
  }

  try {
    const result = await tool.handler(args);
    return CallToolResultSchema.parse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return CallToolResultSchema.parse(
      failure('INTERNAL_ERROR', 'Tool execution failed', message),
    );
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
