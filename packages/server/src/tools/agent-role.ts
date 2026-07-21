import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { createAgentRole, listAgentRoles } from '../db/queries.js';
import { defineTool, string, uuid, type ToolRegistry } from './tool-kit.js';

const workspaceSchema = z.object({ workspaceId: z.string().uuid() });

export function registerAgentRoleTools(
  _server: McpServer,
  getCurrentUserId: () => string,
): ToolRegistry {
  const tools: ToolRegistry = new Map();

  tools.set(
    'agent_role_create',
    defineTool(
      {
        name: 'agent_role_create',
        description:
          'Define an agent role with allowed read and write state key patterns',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            name: string,
            allowedWriteKeys: { type: 'array', items: string },
            allowedReadKeys: { type: 'array', items: string },
          },
          required: [
            'workspaceId',
            'name',
            'allowedWriteKeys',
            'allowedReadKeys',
          ],
        },
      },
      workspaceSchema.extend({
        name: z.string().min(1).max(100),
        allowedWriteKeys: z.array(z.string().min(1)).min(1),
        allowedReadKeys: z.array(z.string().min(1)).min(1),
      }),
      ({ workspaceId, name, allowedWriteKeys, allowedReadKeys }) =>
        createAgentRole(
          workspaceId,
          getCurrentUserId(),
          name,
          allowedWriteKeys,
          allowedReadKeys,
        ),
    ),
  );

  tools.set(
    'agent_role_list',
    defineTool(
      {
        name: 'agent_role_list',
        description: 'List agent roles defined in a workspace',
        inputSchema: {
          type: 'object',
          properties: { workspaceId: uuid },
          required: ['workspaceId'],
        },
      },
      workspaceSchema,
      ({ workspaceId }) => listAgentRoles(workspaceId, getCurrentUserId()),
    ),
  );

  return tools;
}
