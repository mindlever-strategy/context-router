/**
 * MCP Server for AutoGen Adapter
 *
 * Exposes AutoGen adapter capabilities via the Model Context Protocol
 * for integration with Claude Desktop.
 *
 * Usage:
 * ```typescript
 * import { MCPAutoGenServer } from '@context-router/autogen-adapter/mcp';
 *
 * const server = new MCPAutoGenServer({
 *   serverUrl: 'http://localhost:3000',
 *   apiKey: 'your-api-key',
 * });
 *
 * await server.start();
 * ```
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { autogenTools } from './tools.js';
import { createHandlers } from './handlers.js';
import type { AutoGenAdapterConfig } from '../types.js';

/**
 * MCP Server for AutoGen Adapter
 *
 * Bridges AutoGen adapter capabilities with Claude Desktop via MCP.
 */
export class MCPAutoGenServer {
  private server: Server;

  constructor(config: AutoGenAdapterConfig) {
    this.server = new Server(
      {
        name: 'context-router-autogen',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    const handlers = createHandlers(config);

    // Register tool list handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: autogenTools,
    }));

    // Register tool call handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return handlers.handleToolCall(request);
    });
  }

  /**
   * Start the MCP server using stdio transport
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP AutoGen Server started on stdio');
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    await this.server.close();
  }
}

export { autogenTools } from './tools.js';
export { createHandlers, MCPHandlers } from './handlers.js';
