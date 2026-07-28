/**
 * State Diff MCP Tools
 * Compare state between checkpoints or current state
 */

import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { listCheckpoints, snapshotState } from '../db/queries.js';
import { diffState, type StateDiffOptions } from '../services/state-diff.js';
import { snapshotValues } from '../services/checkpoint-format.js';
import {
  defineTool,
  string,
  uuid,
  type ToolRegistry,
} from './tool-kit.js';
import { recordStateDiff } from '../telemetry/metrics.js';

export function registerStateDiffTools(
  _server: McpServer,
  getCurrentUserId: () => string,
): ToolRegistry {
  const tools: ToolRegistry = new Map();

  tools.set(
    'state_diff',
    defineTool(
      {
        name: 'state_diff',
        description:
          'Compare state between checkpoints or current state. Returns added, removed, and modified keys.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            mode: {
              type: 'string',
              enum: ['checkpoints', 'current-vs-checkpoint', 'recent'],
              description:
                'checkpoints: compare two checkpoints. current-vs-checkpoint: compare live state to one checkpoint. recent: compare the newest checkpoint to one N back.',
            },
            workflowId: {
              type: 'string',
              description: 'Required for current-vs-checkpoint and recent modes',
            },
            sourceCheckpointId: {
              type: 'string',
              description: 'Source checkpoint ID (the "before" state)',
            },
            targetCheckpointId: {
              type: 'string',
              description: 'Target checkpoint ID (the "after" state)',
            },
            checkpointId: {
              type: 'string',
              description: 'Checkpoint ID for current-vs-checkpoint mode',
            },
            checkpointsBack: {
              type: 'number',
              description: 'recent mode: how many checkpoints back to compare',
            },
            options: {
              type: 'object',
              properties: {
                deepDiff: {
                  type: 'boolean',
                  description: 'Compare nested object fields',
                },
                includeUnchanged: {
                  type: 'boolean',
                  description: 'Include keys with unchanged values',
                },
                format: {
                  type: 'string',
                  enum: ['summary', 'detailed', 'json'],
                  description: 'Output format (checkpoints mode only)',
                },
              },
            },
          },
          required: ['workspaceId'],
        },
      },
      z.object({
        workspaceId: z.string().uuid(),
        mode: z
          .enum(['checkpoints', 'current-vs-checkpoint', 'recent'])
          .optional(),
        workflowId: z.string().uuid().optional(),
        sourceCheckpointId: z.string().optional(),
        targetCheckpointId: z.string().optional(),
        checkpointId: z.string().optional(),
        checkpointsBack: z.number().int().min(1).default(1),
        options: z
          .object({
            deepDiff: z.boolean().default(false),
            includeUnchanged: z.boolean().default(false),
            format: z.enum(['summary', 'detailed', 'json']).default('detailed'),
          })
          .optional(),
      }),
      async ({ workspaceId, mode, workflowId, sourceCheckpointId, targetCheckpointId, checkpointId, checkpointsBack, options }) => {
        // Validate: when no checkpoint IDs are provided, mode is required
        if (!mode && !sourceCheckpointId && !targetCheckpointId) {
          throw new Error(
            'VALIDATION_ERROR: mode is required when comparing without checkpoint IDs. Use "checkpoints", "current-vs-checkpoint", or "recent".',
          );
        }

        // Apply default mode after validation
        const resolvedMode = mode ?? 'checkpoints';
        const { prisma } = await import('../db/client.js');

        const diffOptions: StateDiffOptions = {
          deepDiff: options?.deepDiff ?? false,
          includeUnchanged: options?.includeUnchanged ?? false,
        };

        // Mode: checkpoints (compare two checkpoints)
        if (resolvedMode === 'checkpoints') {
          if (!sourceCheckpointId || !targetCheckpointId) {
            throw new Error('VALIDATION_ERROR: sourceCheckpointId and targetCheckpointId are required for checkpoints mode');
          }

          const [sourceCp, targetCp] = await Promise.all([
            prisma.checkpoint.findFirst({
              where: { id: sourceCheckpointId, workspaceId },
            }),
            prisma.checkpoint.findFirst({
              where: { id: targetCheckpointId, workspaceId },
            }),
          ]);

          if (!sourceCp) throw new Error('SOURCE_CHECKPOINT_NOT_FOUND');
          if (!targetCp) throw new Error('TARGET_CHECKPOINT_NOT_FOUND');

          const sourceSnapshot = snapshotValues(sourceCp.snapshot);
          const targetSnapshot = snapshotValues(targetCp.snapshot);
          const result = diffState(sourceSnapshot, targetSnapshot, diffOptions);

          const fieldsChanged = result.summary.addedKeys.length + result.summary.removedKeys.length + result.summary.modifiedKeys.length;
          recordStateDiff(fieldsChanged, result.summary.modifiedKeys.length);

          if (options?.format === 'summary') {
            return {
              added: result.summary.addedKeys.length,
              removed: result.summary.removedKeys.length,
              modified: result.summary.modifiedKeys.length,
              unchanged: result.summary.unchangedKeys.length,
              keys: result.summary,
            };
          }
          if (options?.format === 'json') {
            return JSON.stringify(result, null, 2);
          }
          return result;
        }

        // Mode: current-vs-checkpoint
        if (resolvedMode === 'current-vs-checkpoint') {
          if (!workflowId || !checkpointId) {
            throw new Error('VALIDATION_ERROR: workflowId and checkpointId are required for current-vs-checkpoint mode');
          }

          const [checkpoint, currentState] = await Promise.all([
            prisma.checkpoint.findFirst({
              where: { id: checkpointId, workspaceId },
            }),
            snapshotState(workspaceId, getCurrentUserId(), workflowId),
          ]);

          if (!checkpoint) throw new Error('CHECKPOINT_NOT_FOUND');

          const result = diffState(
            snapshotValues(checkpoint.snapshot),
            (currentState ?? {}) as Record<string, unknown>,
            diffOptions,
          );

          const fieldsChanged = result.summary.addedKeys.length + result.summary.removedKeys.length + result.summary.modifiedKeys.length;
          recordStateDiff(fieldsChanged, result.summary.modifiedKeys.length);

          return result;
        }

        // Mode: recent
        if (!workflowId) {
          throw new Error('VALIDATION_ERROR: workflowId is required for recent mode');
        }

        const checkpoints = await prisma.checkpoint.findMany({
          where: { workspaceId, workflowId },
          orderBy: { createdAt: 'desc' },
          take: checkpointsBack + 1,
        });

        if (checkpoints.length < checkpointsBack) {
          throw new Error(`Not enough checkpoints. Found ${checkpoints.length}, need ${checkpointsBack}`);
        }

        const sourceCheckpoint = checkpoints[checkpointsBack - 1];
        const targetCheckpoint = checkpoints[0];

        if (!sourceCheckpoint || !targetCheckpoint) {
          throw new Error('CHECKPOINT_NOT_FOUND');
        }

        const result = diffState(
          snapshotValues(sourceCheckpoint.snapshot),
          snapshotValues(targetCheckpoint.snapshot),
          diffOptions,
        );

        const fieldsChanged = result.summary.addedKeys.length + result.summary.removedKeys.length + result.summary.modifiedKeys.length;
        recordStateDiff(fieldsChanged, result.summary.modifiedKeys.length);

        return {
          sourceCheckpointId: sourceCheckpoint.id,
          targetCheckpointId: targetCheckpoint.id,
          ...result,
        };
      },
    ),
  );

  return tools;
}
