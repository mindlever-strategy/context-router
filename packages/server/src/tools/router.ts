import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { getRouterStatus } from '../db/queries.js';
import { defineTool, type ToolRegistry } from './tool-kit.js';

export function registerRouterTools(
  _server: McpServer,
  getCurrentUserId: () => string,
): ToolRegistry {
  return new Map([
    [
      'router_status',
      defineTool(
        {
          name: 'router_status',
          description:
            'Inspect local storage and owner-scoped workflow totals without exposing credentials',
          inputSchema: { type: 'object', properties: {} },
        },
        z.object({}),
        () => getRouterStatus(getCurrentUserId()),
      ),
    ],
  ]);
}
