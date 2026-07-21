import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import {
  createWorkspace,
  deleteWorkspace,
  ensureWorkspace,
  getWorkspace,
  listWorkspaces,
} from '../db/queries.js';
import { defineTool, string, uuid, type ToolRegistry } from './tool-kit.js';

export function registerWorkspaceTools(
  _server: McpServer,
  getCurrentUserId: () => string,
): ToolRegistry {
  const tools: ToolRegistry = new Map();

  tools.set(
    'workspace_create',
    defineTool(
      {
        name: 'workspace_create',
        description: 'Create a workspace owned by the trusted local user',
        inputSchema: {
          type: 'object',
          properties: { name: string },
          required: ['name'],
        },
      },
      z.object({ name: z.string().min(1).max(100) }),
      ({ name }) => createWorkspace(name, getCurrentUserId()),
    ),
  );

  tools.set(
    'workspace_ensure',
    defineTool(
      {
        name: 'workspace_ensure',
        description:
          'Get or create one stable workspace by normalized name for the local owner',
        inputSchema: {
          type: 'object',
          properties: { name: string },
          required: ['name'],
        },
      },
      z.object({ name: z.string().trim().min(1).max(100) }),
      ({ name }) => ensureWorkspace(name, getCurrentUserId()),
    ),
  );

  tools.set(
    'workspace_list',
    defineTool(
      {
        name: 'workspace_list',
        description: 'List workspaces owned by the trusted local user',
        inputSchema: { type: 'object', properties: {} },
      },
      z.object({}),
      () => listWorkspaces(getCurrentUserId()),
    ),
  );

  const workspaceIdSchema = z.object({ workspaceId: z.string().uuid() });
  tools.set(
    'workspace_get',
    defineTool(
      {
        name: 'workspace_get',
        description: 'Get a workspace owned by the trusted local user',
        inputSchema: {
          type: 'object',
          properties: { workspaceId: uuid },
          required: ['workspaceId'],
        },
      },
      workspaceIdSchema,
      async ({ workspaceId }) => {
        const workspace = await getWorkspace(workspaceId, getCurrentUserId());
        if (!workspace) throw new Error('WORKSPACE_NOT_FOUND');
        return workspace;
      },
    ),
  );

  tools.set(
    'workspace_delete',
    defineTool(
      {
        name: 'workspace_delete',
        description: 'Delete a workspace and all of its data',
        inputSchema: {
          type: 'object',
          properties: { workspaceId: uuid },
          required: ['workspaceId'],
        },
      },
      workspaceIdSchema,
      ({ workspaceId }) => deleteWorkspace(workspaceId, getCurrentUserId()),
    ),
  );

  return tools;
}
