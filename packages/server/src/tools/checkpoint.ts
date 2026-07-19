import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import {
  createCheckpoint,
  deleteCheckpoint,
  listCheckpoints,
  restoreCheckpoint,
} from '../db/queries.js';
import { defineTool, string, uuid, type ToolRegistry } from './tool-kit.js';

const workflowSchema = z.object({
  workspaceId: z.string().uuid(),
  workflowId: z.string().uuid(),
});
const checkpointSchema = z.object({
  workspaceId: z.string().uuid(),
  checkpointId: z.string().uuid(),
});

export function registerCheckpointTools(
  _server: McpServer,
  getCurrentUserId: () => string,
): ToolRegistry {
  const tools: ToolRegistry = new Map();

  tools.set(
    'checkpoint_create',
    defineTool(
      {
        name: 'checkpoint_create',
        description: 'Create a durable snapshot of a running workflow state',
        inputSchema: {
          type: 'object',
          properties: { workspaceId: uuid, workflowId: uuid, label: string },
          required: ['workspaceId', 'workflowId'],
        },
      },
      workflowSchema.extend({ label: z.string().max(255).optional() }),
      ({ workspaceId, workflowId, label }) =>
        createCheckpoint(workspaceId, getCurrentUserId(), workflowId, label),
    ),
  );

  tools.set(
    'checkpoint_list',
    defineTool(
      {
        name: 'checkpoint_list',
        description: 'List checkpoints for a workflow',
        inputSchema: {
          type: 'object',
          properties: { workspaceId: uuid, workflowId: uuid },
          required: ['workspaceId', 'workflowId'],
        },
      },
      workflowSchema,
      ({ workspaceId, workflowId }) =>
        listCheckpoints(workspaceId, getCurrentUserId(), workflowId),
    ),
  );

  tools.set(
    'checkpoint_restore',
    defineTool(
      {
        name: 'checkpoint_restore',
        description: 'Atomically restore a running workflow from a checkpoint',
        inputSchema: {
          type: 'object',
          properties: { workspaceId: uuid, checkpointId: uuid },
          required: ['workspaceId', 'checkpointId'],
        },
      },
      checkpointSchema,
      ({ workspaceId, checkpointId }) =>
        restoreCheckpoint(workspaceId, getCurrentUserId(), checkpointId),
    ),
  );

  tools.set(
    'checkpoint_delete',
    defineTool(
      {
        name: 'checkpoint_delete',
        description: 'Delete a checkpoint from a workspace',
        inputSchema: {
          type: 'object',
          properties: { workspaceId: uuid, checkpointId: uuid },
          required: ['workspaceId', 'checkpointId'],
        },
      },
      checkpointSchema,
      ({ workspaceId, checkpointId }) =>
        deleteCheckpoint(workspaceId, getCurrentUserId(), checkpointId),
    ),
  );

  return tools;
}
