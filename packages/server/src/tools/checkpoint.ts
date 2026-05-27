import { Server as McpServer } from '@modelcontextprotocol/sdk/server';
import { z } from 'zod';
import {
  createCheckpoint,
  listCheckpoints,
  restoreCheckpoint,
  snapshotState,
  trackUsage,
} from '../db/queries';

// Input schemas for validation
const checkpointCreateSchema = z.object({
  workspaceId: z.string().uuid('Invalid workspace ID format'),
  workflowId: z.string().uuid('Invalid workflow ID format'),
  label: z.string().max(255, 'Label must be 255 characters or less').optional(),
});

const checkpointListSchema = z.object({
  workflowId: z.string().uuid('Invalid workflow ID format'),
});

const checkpointRestoreSchema = z.object({
  checkpointId: z.string().uuid('Invalid checkpoint ID format'),
});

const checkpointDeleteSchema = z.object({
  checkpointId: z.string().uuid('Invalid checkpoint ID format'),
});

export type CheckpointCreateInput = z.infer<typeof checkpointCreateSchema>;
export type CheckpointListInput = z.infer<typeof checkpointListSchema>;
export type CheckpointRestoreInput = z.infer<typeof checkpointRestoreSchema>;
export type CheckpointDeleteInput = z.infer<typeof checkpointDeleteSchema>;

export interface CheckpointToolDefinition {
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
 * Register checkpoint management tools with the MCP server.
 *
 * Tools provided:
 * - checkpoint_create: Create a state snapshot checkpoint for a workflow
 * - checkpoint_list: List all checkpoints for a workflow
 * - checkpoint_restore: Restore workflow state from a checkpoint
 * - checkpoint_delete: Delete a checkpoint
 */
export function registerCheckpointTools(
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

  // checkpoint_create tool
  const checkpointCreateTool: Tool = {
    definition: {
      name: 'checkpoint_create',
      description: 'Create a state snapshot checkpoint for a workflow',
      inputSchema: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: 'Workspace ID (UUID format)',
          },
          workflowId: {
            type: 'string',
            description: 'Workflow ID (UUID format)',
          },
          label: {
            type: 'string',
            description: 'Optional label to identify the checkpoint (max 255 chars)',
          },
        },
        required: ['workspaceId', 'workflowId'],
      },
    },
    handler: async (args: unknown) => {
      const parsed = checkpointCreateSchema.safeParse(args);

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
        const { workspaceId, workflowId, label } = parsed.data;

        // Snapshot current state
        const snapshot = await snapshotState(workflowId);

        // Create checkpoint
        const checkpoint = await createCheckpoint(workspaceId, workflowId, snapshot, label);
        await track(workspaceId, 'checkpoint_create');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                checkpoint,
                snapshotKeys: Object.keys(snapshot),
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
                error: 'Failed to create checkpoint',
                details: message,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  };

  // checkpoint_list tool
  const checkpointListTool: Tool = {
    definition: {
      name: 'checkpoint_list',
      description: 'List all checkpoints for a workflow',
      inputSchema: {
        type: 'object',
        properties: {
          workflowId: {
            type: 'string',
            description: 'Workflow ID (UUID format)',
          },
        },
        required: ['workflowId'],
      },
    },
    handler: async (args: unknown) => {
      const parsed = checkpointListSchema.safeParse(args);

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
        const { workflowId } = parsed.data;
        const checkpoints = await listCheckpoints(workflowId);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                checkpoints,
                count: checkpoints.length,
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
                error: 'Failed to list checkpoints',
                details: message,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  };

  // checkpoint_restore tool
  const checkpointRestoreTool: Tool = {
    definition: {
      name: 'checkpoint_restore',
      description: 'Restore workflow state from a checkpoint',
      inputSchema: {
        type: 'object',
        properties: {
          checkpointId: {
            type: 'string',
            description: 'Checkpoint ID (UUID format)',
          },
        },
        required: ['checkpointId'],
      },
    },
    handler: async (args: unknown) => {
      const parsed = checkpointRestoreSchema.safeParse(args);

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
        const { checkpointId } = parsed.data;
        const checkpoint = await restoreCheckpoint(checkpointId);
        await track(checkpoint.workspaceId, 'checkpoint_restore');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                checkpoint,
                restoredWorkflowId: checkpoint.workflowId,
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
                error: 'Failed to restore checkpoint',
                details: message,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  };

  // checkpoint_delete tool
  const checkpointDeleteTool: Tool = {
    definition: {
      name: 'checkpoint_delete',
      description: 'Delete a checkpoint',
      inputSchema: {
        type: 'object',
        properties: {
          checkpointId: {
            type: 'string',
            description: 'Checkpoint ID (UUID format)',
          },
        },
        required: ['checkpointId'],
      },
    },
    handler: async (args: unknown) => {
      const parsed = checkpointDeleteSchema.safeParse(args);

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
        const { checkpointId } = parsed.data;

        // We need to get the checkpoint first to track usage
        const { prisma } = await import('../db/client');
        const checkpoint = await prisma.checkpoint.findUnique({
          where: { id: checkpointId },
        });

        if (!checkpoint) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'Checkpoint not found',
                  checkpointId,
                }),
              },
            ],
            isError: true,
          };
        }

        await prisma.checkpoint.delete({
          where: { id: checkpointId },
        });

        await track(checkpoint.workspaceId, 'checkpoint_delete');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                deletedCheckpointId: checkpointId,
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
                error: 'Failed to delete checkpoint',
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
  tools.set('checkpoint_create', checkpointCreateTool);
  tools.set('checkpoint_list', checkpointListTool);
  tools.set('checkpoint_restore', checkpointRestoreTool);
  tools.set('checkpoint_delete', checkpointDeleteTool);

  return tools;
}
