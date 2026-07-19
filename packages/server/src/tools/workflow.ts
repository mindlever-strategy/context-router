import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import {
  createWorkflow,
  getWorkflow,
  transitionWorkflow,
} from '../db/queries.js';
import { defineTool, string, uuid, type ToolRegistry } from './tool-kit.js';

const workspaceWorkflowSchema = z.object({
  workspaceId: z.string().uuid(),
  workflowId: z.string().uuid(),
});

export function registerWorkflowTools(
  _server: McpServer,
  getCurrentUserId: () => string,
): ToolRegistry {
  const tools: ToolRegistry = new Map();

  tools.set(
    'workflow_create',
    defineTool(
      {
        name: 'workflow_create',
        description: 'Create a running workflow in a workspace',
        inputSchema: {
          type: 'object',
          properties: { workspaceId: uuid },
          required: ['workspaceId'],
        },
      },
      z.object({ workspaceId: z.string().uuid() }),
      ({ workspaceId }) => createWorkflow(workspaceId, getCurrentUserId()),
    ),
  );

  tools.set(
    'workflow_status',
    defineTool(
      {
        name: 'workflow_status',
        description: 'Get a workflow status',
        inputSchema: {
          type: 'object',
          properties: { workspaceId: uuid, workflowId: uuid },
          required: ['workspaceId', 'workflowId'],
        },
      },
      workspaceWorkflowSchema,
      async ({ workspaceId, workflowId }) => {
        const workflow = await getWorkflow(
          workspaceId,
          getCurrentUserId(),
          workflowId,
        );
        if (!workflow) throw new Error('WORKFLOW_NOT_FOUND');
        return workflow;
      },
    ),
  );

  tools.set(
    'workflow_complete',
    defineTool(
      {
        name: 'workflow_complete',
        description: 'Mark a running workflow as completed',
        inputSchema: {
          type: 'object',
          properties: { workspaceId: uuid, workflowId: uuid },
          required: ['workspaceId', 'workflowId'],
        },
      },
      workspaceWorkflowSchema,
      ({ workspaceId, workflowId }) =>
        transitionWorkflow(
          workspaceId,
          getCurrentUserId(),
          workflowId,
          'COMPLETED',
        ),
    ),
  );

  tools.set(
    'workflow_fail',
    defineTool(
      {
        name: 'workflow_fail',
        description: 'Mark a running workflow as failed',
        inputSchema: {
          type: 'object',
          properties: { workspaceId: uuid, workflowId: uuid, reason: string },
          required: ['workspaceId', 'workflowId', 'reason'],
        },
      },
      workspaceWorkflowSchema.extend({ reason: z.string().min(1).max(2000) }),
      ({ workspaceId, workflowId, reason }) =>
        transitionWorkflow(
          workspaceId,
          getCurrentUserId(),
          workflowId,
          'FAILED',
          reason,
        ),
    ),
  );

  return tools;
}
