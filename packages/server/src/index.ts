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
import { connectDatabase } from './db/client.js';
import { registerWorkspaceTools } from './tools/workspace.js';
import { registerSchemaTools } from './tools/schema.js';
import { registerStateTools } from './tools/state.js';
import { registerCheckpointTools } from './tools/checkpoint.js';
import { registerHandoffTools } from './tools/handoff.js';
import { registerWorkflowTools } from './tools/workflow.js';
import { registerStepTools } from './tools/step.js';
import { registerAgentRoleTools } from './tools/agent-role.js';
import { registerRouterTools } from './tools/router.js';
import { registerDebuggerTools } from './tools/debugger-tool.js';
import { registerJournalTools } from './tools/journal.js';
import { registerStateDiffTools } from './tools/state-diff.js';
import { registerSchemaMigrationTools } from './tools/schema-migration.js';
import {
  initTracing,
  initMetrics,
  shutdownTracing,
} from './telemetry/index.js';
import { startTTLCleanup, stopTTLCleanup } from './services/state-ttl.js';
import { failure, type Tool } from './tools/tool-kit.js';
import { SERVER_VERSION } from './version.js';

// Create and configure the MCP server with all registered tools
const server = new McpServer(
  {
    name: 'context-router',
    version: SERVER_VERSION,
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

const stepTools = registerStepTools(server, getCurrentUserId);
stepTools.forEach((tool, name) => allTools.set(name, tool));

const agentRoleTools = registerAgentRoleTools(server, getCurrentUserId);
agentRoleTools.forEach((tool, name) => allTools.set(name, tool));

const routerTools = registerRouterTools(server, getCurrentUserId);
routerTools.forEach((tool, name) => allTools.set(name, tool));

const debuggerTools = registerDebuggerTools(server, getCurrentUserId);
debuggerTools.forEach((tool, name) => allTools.set(name, tool));

const journalTools = registerJournalTools(server, getCurrentUserId);
journalTools.forEach((tool, name) => allTools.set(name, tool));

const stateDiffTools = registerStateDiffTools(server, getCurrentUserId);
stateDiffTools.forEach((tool, name) => allTools.set(name, tool));

const schemaMigrationTools = registerSchemaMigrationTools(
  server,
  getCurrentUserId,
);
schemaMigrationTools.forEach((tool, name) => allTools.set(name, tool));

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

  // Initialize observability
  initTracing();
  initMetrics();

  // DB must be ready before TTL cleanup — startTTLCleanup runs an immediate pass
  await connectDatabase();
  startTTLCleanup();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Context Router MCP Server running on stdio');
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.error('Shutting down Context Router MCP Server...');
  stopTTLCleanup();
  const { shutdownTracing: shutdownOtel } =
    await import('./telemetry/index.js');
  await shutdownOtel();
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', () => {
  shutdown();
});
process.on('SIGTERM', () => {
  shutdown();
});

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
