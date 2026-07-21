import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { completeStepRun, failStepRun, startStepRun } from '../db/queries.js';
import type { Prisma } from '../generated/postgresql/client.js';
import {
  defineTool,
  object,
  string,
  uuid,
  type ToolRegistry,
} from './tool-kit.js';

const stepSchema = z.object({
  workspaceId: z.string().uuid(),
  workflowId: z.string().uuid(),
  stepId: z.string().min(1).max(100),
  executionId: z.string().uuid(),
});

export function registerStepTools(
  _server: McpServer,
  getCurrentUserId: () => string,
): ToolRegistry {
  const tools: ToolRegistry = new Map();

  tools.set(
    'step_run_start',
    defineTool(
      {
        name: 'step_run_start',
        description:
          'Start or retry a workflow step with idempotent execution tracking and auto-checkpoint',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            workflowId: uuid,
            stepId: string,
            executionId: uuid,
            agentId: string,
          },
          required: ['workspaceId', 'workflowId', 'stepId', 'executionId'],
        },
      },
      stepSchema.extend({ agentId: z.string().max(100).optional() }),
      ({ workspaceId, workflowId, stepId, executionId, agentId }) =>
        startStepRun(
          workspaceId,
          getCurrentUserId(),
          workflowId,
          stepId,
          executionId,
          agentId,
        ),
    ),
  );

  tools.set(
    'step_run_complete',
    defineTool(
      {
        name: 'step_run_complete',
        description: 'Mark a step execution as succeeded and cache its result',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            workflowId: uuid,
            stepId: string,
            executionId: uuid,
            result: object,
          },
          required: ['workspaceId', 'workflowId', 'stepId', 'executionId'],
        },
      },
      stepSchema.extend({
        result: z.record(z.string(), z.unknown()).optional(),
      }),
      ({ workspaceId, workflowId, stepId, executionId, result }) =>
        completeStepRun(
          workspaceId,
          getCurrentUserId(),
          workflowId,
          stepId,
          executionId,
          result as Prisma.InputJsonValue | undefined,
        ),
    ),
  );

  tools.set(
    'step_run_fail',
    defineTool(
      {
        name: 'step_run_fail',
        description: 'Mark a step execution as failed with a reason',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            workflowId: uuid,
            stepId: string,
            executionId: uuid,
            reason: string,
          },
          required: [
            'workspaceId',
            'workflowId',
            'stepId',
            'executionId',
            'reason',
          ],
        },
      },
      stepSchema.extend({ reason: z.string().min(1).max(2000) }),
      ({ workspaceId, workflowId, stepId, executionId, reason }) =>
        failStepRun(
          workspaceId,
          getCurrentUserId(),
          workflowId,
          stepId,
          executionId,
          reason,
        ),
    ),
  );

  return tools;
}
