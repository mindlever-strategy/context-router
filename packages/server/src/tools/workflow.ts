import { Server as McpServer } from '@modelcontextprotocol/sdk/server';
import { z } from 'zod';
import {
  createWorkflow,
  getWorkflow,
  completeWorkflow,
  failWorkflow,
  trackUsage,
  countCompletedWorkflows,
} from '../db/queries';

// Input schemas for validation
const workflowCreateSchema = z.object({
  workspaceId: z.string().uuid('Invalid workspace ID format'),
});

const workflowGetSchema = z.object({
  id: z.string().uuid('Invalid workflow ID format'),
});

const workflowCompleteSchema = z.object({
  id: z.string().uuid('Invalid workflow ID format'),
  workspaceId: z.string().uuid('Invalid workspace ID format'),
});

const workflowFailSchema = z.object({
  id: z.string().uuid('Invalid workflow ID format'),
  reason: z.string().min(1, 'Failure reason is required'),
  workspaceId: z.string().uuid('Invalid workspace ID format'),
});

export type WorkflowCreateInput = z.infer<typeof workflowCreateSchema>;
export type WorkflowGetInput = z.infer<typeof workflowGetSchema>;
export type WorkflowCompleteInput = z.infer<typeof workflowCompleteSchema>;
export type WorkflowFailInput = z.infer<typeof workflowFailSchema>;

export interface WorkflowToolDefinition {
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
 * Register workflow management tools with the MCP server.
 *
 * Tools provided:
 * - workflow_create: Create a new workflow within a workspace
 * - workflow_status: Get the current status of a workflow
 * - workflow_complete: Mark a workflow as completed
 * - workflow_fail: Mark a workflow as failed with a reason
 */
export function registerWorkflowTools(
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
  const track = async (workspaceId: string, workflowId: string | null, action: string) => {
    try {
      await trackUsage(workspaceId, workflowId, action);
    } catch {
      // Silently fail usage tracking - don't block the operation
      console.warn(`Failed to track usage for action: ${action}`);
    }
  };

  // workflow_create tool
  const workflowCreateTool: Tool = {
    definition: {
      name: 'workflow_create',
      description: 'Create a new workflow within a workspace',
      inputSchema: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: 'Workspace ID to create the workflow in (UUID format)',
          },
        },
        required: ['workspaceId'],
      },
    },
    handler: async (args: unknown) => {
      const parsed = workflowCreateSchema.safeParse(args);

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
        const workflow = await createWorkflow(parsed.data.workspaceId);
        await track(parsed.data.workspaceId, workflow.id, 'workflow_create');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                workflow,
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
                error: 'Failed to create workflow',
                details: message,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  };

  // workflow_status tool
  const workflowStatusTool: Tool = {
    definition: {
      name: 'workflow_status',
      description: 'Get the current status of a workflow',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Workflow ID to check status for (UUID format)',
          },
        },
        required: ['id'],
      },
    },
    handler: async (args: unknown) => {
      const parsed = workflowGetSchema.safeParse(args);

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
        const workflow = await getWorkflow(parsed.data.id);

        if (!workflow) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'Workflow not found',
                  id: parsed.data.id,
                }),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                workflow,
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
                error: 'Failed to get workflow status',
                details: message,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  };

  // workflow_complete tool
  const workflowCompleteTool: Tool = {
    definition: {
      name: 'workflow_complete',
      description: 'Mark a workflow as completed. Tracked for billing.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Workflow ID to complete (UUID format)',
          },
          workspaceId: {
            type: 'string',
            description: 'Workspace ID for billing tracking (UUID format)',
          },
        },
        required: ['id', 'workspaceId'],
      },
    },
    handler: async (args: unknown) => {
      const parsed = workflowCompleteSchema.safeParse(args);

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
        // Verify workflow exists before completing
        const existing = await getWorkflow(parsed.data.id);
        if (!existing) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'Workflow not found',
                  id: parsed.data.id,
                }),
              },
            ],
            isError: true,
          };
        }

        const workflow = await completeWorkflow(parsed.data.id);
        await track(parsed.data.workspaceId, workflow.id, 'workflow_complete');

        // Count completed workflows for billing (this month)
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const completedCount = await countCompletedWorkflows(parsed.data.workspaceId, startOfMonth);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                workflow,
                usageThisMonth: completedCount,
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
                error: 'Failed to complete workflow',
                details: message,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  };

  // workflow_fail tool
  const workflowFailTool: Tool = {
    definition: {
      name: 'workflow_fail',
      description: 'Mark a workflow as failed with a reason',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Workflow ID to mark as failed (UUID format)',
          },
          reason: {
            type: 'string',
            description: 'Reason for workflow failure',
          },
          workspaceId: {
            type: 'string',
            description: 'Workspace ID for tracking (UUID format)',
          },
        },
        required: ['id', 'reason', 'workspaceId'],
      },
    },
    handler: async (args: unknown) => {
      const parsed = workflowFailSchema.safeParse(args);

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
        // Verify workflow exists before failing
        const existing = await getWorkflow(parsed.data.id);
        if (!existing) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'Workflow not found',
                  id: parsed.data.id,
                }),
              },
            ],
            isError: true,
          };
        }

        const workflow = await failWorkflow(parsed.data.id, parsed.data.reason);
        await track(parsed.data.workspaceId, workflow.id, 'workflow_fail');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                workflow,
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
                error: 'Failed to mark workflow as failed',
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
  tools.set('workflow_create', workflowCreateTool);
  tools.set('workflow_status', workflowStatusTool);
  tools.set('workflow_complete', workflowCompleteTool);
  tools.set('workflow_fail', workflowFailTool);

  return tools;
}
