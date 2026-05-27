import { Server as McpServer } from '@modelcontextprotocol/sdk/server';
import { z } from 'zod';
import {
  createWorkspace,
  listWorkspaces,
  deleteWorkspace,
  getWorkspace,
  trackUsage,
} from '../db/queries';

// Input schemas for validation
const workspaceCreateSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').max(100, 'Workspace name must be 100 characters or less'),
});

const workspaceDeleteSchema = z.object({
  id: z.string().uuid('Invalid workspace ID format'),
});

const workspaceGetSchema = z.object({
  id: z.string().uuid('Invalid workspace ID format'),
});

export type WorkspaceCreateInput = z.infer<typeof workspaceCreateSchema>;
export type WorkspaceDeleteInput = z.infer<typeof workspaceDeleteSchema>;
export type WorkspaceGetInput = z.infer<typeof workspaceGetSchema>;

export interface WorkspaceToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * MCP Tool definition matching the SDK's ToolSchema
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

/**
 * Register workspace management tools with the MCP server.
 *
 * Tools provided:
 * - workspace_create: Create a new workspace (isolated state namespace)
 * - workspace_list: List all workspaces for the current user
 * - workspace_get: Get a specific workspace by ID
 * - workspace_delete: Delete a workspace and all its data
 */
export function registerWorkspaceTools(
  server: McpServer,
  getCurrentUserId: () => string | undefined
): Map<string, Tool> {
  const tools = new Map<string, Tool>();

  // Helper to get authenticated user
  const getUserId = (): string => {
    const userId = getCurrentUserId();
    if (!userId) {
      throw new Error('Authentication required: No user context available');
    }
    return userId;
  };

  // Helper to track tool usage
  const track = async (workspaceId: string | null, action: string) => {
    try {
      await trackUsage(workspaceId ?? 'system', null, action);
    } catch {
      // Silently fail usage tracking - don't block the operation
      console.warn(`Failed to track usage for action: ${action}`);
    }
  };

  // workspace_create tool
  const workspaceCreateTool: Tool = {
    definition: {
      name: 'workspace_create',
      description: 'Create a new workspace (isolated state namespace)',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Workspace name (1-100 characters)',
          },
        },
        required: ['name'],
      },
    },
    handler: async (args: unknown) => {
      const parsed = workspaceCreateSchema.safeParse(args);

      if (!parsed.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Validation failed',
                details: parsed.error.flatten().fieldErrors,
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        const userId = getUserId();
        const workspace = await createWorkspace(parsed.data.name, userId);
        await track(workspace.id, 'workspace_create');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                workspace,
              }),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Failed to create workspace',
                details: message,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  };

  // workspace_list tool
  const workspaceListTool: Tool = {
    definition: {
      name: 'workspace_list',
      description: 'List all workspaces for the current user',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async (_args: unknown) => {
      try {
        const userId = getUserId();
        const workspaces = await listWorkspaces(userId);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                workspaces,
                count: workspaces.length,
              }),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Failed to list workspaces',
                details: message,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  };

  // workspace_get tool
  const workspaceGetTool: Tool = {
    definition: {
      name: 'workspace_get',
      description: 'Get a specific workspace by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Workspace ID (UUID format)',
          },
        },
        required: ['id'],
      },
    },
    handler: async (args: unknown) => {
      const parsed = workspaceGetSchema.safeParse(args);

      if (!parsed.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Validation failed',
                details: parsed.error.flatten().fieldErrors,
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        const workspace = await getWorkspace(parsed.data.id);

        if (!workspace) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'Workspace not found',
                  id: parsed.data.id,
                }),
              },
            ],
            isError: true,
          };
        }

        await track(workspace.id, 'workspace_get');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                workspace,
              }),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Failed to get workspace',
                details: message,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  };

  // workspace_delete tool
  const workspaceDeleteTool: Tool = {
    definition: {
      name: 'workspace_delete',
      description: 'Delete a workspace and all its data (schemas, states, workflows, checkpoints)',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Workspace ID to delete (UUID format)',
          },
        },
        required: ['id'],
      },
    },
    handler: async (args: unknown) => {
      const parsed = workspaceDeleteSchema.safeParse(args);

      if (!parsed.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Validation failed',
                details: parsed.error.flatten().fieldErrors,
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        // Verify workspace exists before deletion
        const existing = await getWorkspace(parsed.data.id);
        if (!existing) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'Workspace not found',
                  id: parsed.data.id,
                }),
              },
            ],
            isError: true,
          };
        }

        await deleteWorkspace(parsed.data.id);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                id: parsed.data.id,
                deletedWorkspace: existing.name,
              }),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Failed to delete workspace',
                details: message,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  };

  // Register all tools
  tools.set('workspace_create', workspaceCreateTool);
  tools.set('workspace_list', workspaceListTool);
  tools.set('workspace_get', workspaceGetTool);
  tools.set('workspace_delete', workspaceDeleteTool);

  return tools;
}
