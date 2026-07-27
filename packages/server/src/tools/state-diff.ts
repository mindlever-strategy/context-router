/**
 * State Diff MCP Tools
 * Compare state between checkpoints or current state
 */

import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { listCheckpoints, snapshotState } from '../db/queries.js';
import { diffState, type StateDiffOptions } from '../services/state-diff.js';
import {
  defineTool,
  string,
  uuid,
  type ToolRegistry,
} from './tool-kit.js';
import { recordStateDiff } from '../telemetry/metrics.js';

/**
 * Flattens a checkpoint snapshot to a plain key -> value map for diffing.
 * Handles both the current envelope format and the pre-0.6 bare-value format.
 */
function snapshotValues(snapshot: unknown): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries((snapshot ?? {}) as Record<string, unknown>).map(
      ([key, raw]) => {
        const candidate = raw as { value?: unknown; version?: unknown } | null;
        const isEnvelope =
          candidate !== null &&
          typeof candidate === 'object' &&
          !Array.isArray(candidate) &&
          'value' in candidate &&
          typeof candidate.version === 'number';
        return [key, isEnvelope ? candidate.value : raw];
      },
    ),
  );
}

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
          'Compare state between two checkpoints. Returns added, removed, and modified keys.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            sourceCheckpointId: {
              type: 'string',
              description: 'Source checkpoint ID (the "before" state)',
            },
            targetCheckpointId: {
              type: 'string',
              description: 'Target checkpoint ID (the "after" state)',
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
                  description: 'Output format',
                },
              },
            },
          },
          required: ['workspaceId', 'sourceCheckpointId', 'targetCheckpointId'],
        },
      },
      z.object({
        workspaceId: z.string().uuid(),
        sourceCheckpointId: z.string(),
        targetCheckpointId: z.string(),
        options: z
          .object({
            deepDiff: z.boolean().default(false),
            includeUnchanged: z.boolean().default(false),
            format: z.enum(['summary', 'detailed', 'json']).default('detailed'),
          })
          .optional(),
      }),
      async ({ workspaceId, sourceCheckpointId, targetCheckpointId, options }) => {
        const { prisma } = await import('../db/client.js');
        const startTime = Date.now();

        // Fetch both checkpoints
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

        const diffOptions: StateDiffOptions = {
          deepDiff: options?.deepDiff ?? false,
          includeUnchanged: options?.includeUnchanged ?? false,
        };

        const sourceSnapshot = snapshotValues(sourceCp.snapshot);
        const targetSnapshot = snapshotValues(targetCp.snapshot);

        const result = diffState(sourceSnapshot, targetSnapshot, diffOptions);

        // Record metrics
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
      },
    ),
  );

  tools.set(
    'state_diff_current_vs_checkpoint',
    defineTool(
      {
        name: 'state_diff_current_vs_checkpoint',
        description:
          'Compare current workflow state against a checkpoint. Shows what changed since the checkpoint was created.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            workflowId: uuid,
            checkpointId: {
              type: 'string',
              description: 'Checkpoint ID to compare against',
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
              },
            },
          },
          required: ['workspaceId', 'workflowId', 'checkpointId'],
        },
      },
      z.object({
        workspaceId: z.string().uuid(),
        workflowId: z.string().uuid(),
        checkpointId: z.string(),
        options: z
          .object({
            deepDiff: z.boolean().default(false),
            includeUnchanged: z.boolean().default(false),
          })
          .optional(),
      }),
      async ({ workspaceId, workflowId, checkpointId, options }) => {
        const { prisma } = await import('../db/client.js');
        const startTime = Date.now();

        // Fetch checkpoint and current state in parallel
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
          options ?? {},
        );

        // Record metrics
        const fieldsChanged = result.summary.addedKeys.length + result.summary.removedKeys.length + result.summary.modifiedKeys.length;
        recordStateDiff(fieldsChanged, result.summary.modifiedKeys.length);

        return result;
      },
    ),
  );

  tools.set(
    'state_diff_recent_changes',
    defineTool(
      {
        name: 'state_diff_recent_changes',
        description:
          'Compare workflow state now vs N checkpoints ago. Useful for seeing recent changes.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            workflowId: uuid,
            checkpointsBack: {
              type: 'number',
              description: 'How many checkpoints back to compare (default: 1)',
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
              },
            },
          },
          required: ['workspaceId', 'workflowId'],
        },
      },
      z.object({
        workspaceId: z.string().uuid(),
        workflowId: z.string().uuid(),
        checkpointsBack: z.number().int().min(1).default(1),
        options: z
          .object({
            deepDiff: z.boolean().default(false),
            includeUnchanged: z.boolean().default(false),
          })
          .optional(),
      }),
      async ({ workspaceId, workflowId, checkpointsBack, options }) => {
        const { prisma } = await import('../db/client.js');
        const startTime = Date.now();

        // Get checkpoints ordered by creation time (newest first)
        const checkpoints = await prisma.checkpoint.findMany({
          where: { workspaceId, workflowId },
          orderBy: { createdAt: 'desc' },
          take: checkpointsBack + 1,
        });

        if (checkpoints.length < checkpointsBack) {
          throw new Error(`Not enough checkpoints. Found ${checkpoints.length}, need ${checkpointsBack}`);
        }

        // checkpoints[0] is newest, checkpoints[checkpointsBack - 1] is the older one
        const sourceCheckpoint = checkpoints[checkpointsBack - 1];
        const targetCheckpoint = checkpoints[0];

        if (!sourceCheckpoint || !targetCheckpoint) {
          throw new Error('CHECKPOINT_NOT_FOUND');
        }

        const result = diffState(
          snapshotValues(sourceCheckpoint.snapshot),
          snapshotValues(targetCheckpoint.snapshot),
          options ?? {},
        );

        // Record metrics
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
