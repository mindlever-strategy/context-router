/**
 * State TTL MCP Tools
 * Write state with expiration and manage expired state cleanup
 */

import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { writeState, readState, cleanupExpiredStates } from '../db/queries.js';
import { isTTLCleanupRunning, startTTLCleanup, stopTTLCleanup } from '../services/state-ttl.js';
import {
  defineTool,
  string,
  uuid,
  type ToolRegistry,
} from './tool-kit.js';

export function registerStateTTLTools(
  _server: McpServer,
  getCurrentUserId: () => string,
): ToolRegistry {
  const tools: ToolRegistry = new Map();

  tools.set(
    'state_write_ttl',
    defineTool(
      {
        name: 'state_write_ttl',
        description:
          'Write state with optional TTL (time-to-live) expiration. State will be automatically deleted after expiration.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            workflowId: uuid,
            key: string,
            value: {
              description: 'Any JSON value',
              anyOf: [
                { type: 'object' },
                { type: 'array' },
                { type: 'string' },
                { type: 'number' },
                { type: 'boolean' },
                { type: 'null' },
              ],
            },
            expiresIn: {
              type: 'number',
              description: 'TTL in seconds from now (mutually exclusive with expiresAt)',
            },
            expiresAt: {
              type: 'string',
              description: 'Absolute expiration timestamp (ISO 8601). Mutually exclusive with expiresIn.',
            },
            refreshOnAccess: {
              type: 'boolean',
              description:
                'Deprecated: ignored. This tool never read this option on the write side.',
            },
            expectedVersion: {
              type: 'number',
              description: 'Expected current version for optimistic locking',
            },
          },
          required: ['workspaceId', 'workflowId', 'key', 'value'],
        },
      },
      z.object({
        workspaceId: z.string().uuid(),
        workflowId: z.string().uuid(),
        key: z.string().min(1).max(255),
        value: z.unknown(),
        expiresIn: z.number().int().positive().optional(),
        expiresAt: z.string().datetime().optional(),
        refreshOnAccess: z.boolean().optional(),
        expectedVersion: z.number().int().min(0).optional(),
      }),
      async ({ workspaceId, workflowId, key, value, expiresIn, expiresAt, expectedVersion }) => {
        // Validate mutual exclusivity
        if (expiresIn && expiresAt) {
          throw new Error('Provide either expiresIn or expiresAt, not both');
        }

        const result = await writeState(
          workspaceId,
          getCurrentUserId(),
          workflowId,
          key,
          value as import('../generated/postgresql/client.js').Prisma.InputJsonValue,
          {
            expiresIn,
            expiresAt: expiresAt ? new Date(expiresAt) : undefined,
            expectedVersion,
          },
        );

        return {
          written: true,
          key: result.key,
          version: result.version,
          expiresAt: result.expiresAt,
          message: result.expiresAt
            ? `State expires at ${result.expiresAt.toISOString()}`
            : 'State has no expiration',
        };
      },
    ),
  );

  tools.set(
    'state_read_ttl',
    defineTool(
      {
        name: 'state_read_ttl',
        description: 'Read state with TTL support.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            workflowId: uuid,
            key: string,
            refreshOnAccess: {
              type: 'boolean',
              description:
                'Deprecated: ignored. TTL refresh-on-read is no longer supported; a read never extends a key\'s expiry.',
            },
            unwrap: {
              type: 'boolean',
              description: 'Remove provenance metadata wrapper',
            },
          },
          required: ['workspaceId', 'workflowId', 'key'],
        },
      },
      z.object({
        workspaceId: z.string().uuid(),
        workflowId: z.string().uuid(),
        key: z.string().min(1).max(255),
        refreshOnAccess: z.boolean().optional(),
        unwrap: z.boolean().optional(),
      }),
      async ({ workspaceId, workflowId, key, unwrap }) => {
        const state = await readState(
          workspaceId,
          getCurrentUserId(),
          workflowId,
          key,
          { unwrap },
        );

        if (!state) {
          return { found: false, key, message: 'State not found or expired' };
        }

        return {
          found: true,
          key,
          value: state.value,
          version: state.version,
          expiresAt: state.expiresAt,
        };
      },
    ),
  );

  tools.set(
    'state_delete_expired',
    defineTool(
      {
        name: 'state_delete_expired',
        description:
          'Delete all expired state entries. Usually run by the background cleanup service, but can be triggered manually.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            batchSize: {
              type: 'number',
              description: 'Maximum number of entries to delete per call',
            },
          },
          required: ['workspaceId'],
        },
      },
      z.object({
        workspaceId: z.string().uuid().optional(),
        batchSize: z.number().int().positive().max(1000).default(100),
      }),
      async ({ workspaceId, batchSize }) => {
        const deleted = await cleanupExpiredStates(batchSize);

        return {
          deleted,
          message: `Deleted ${deleted} expired state entries`,
          cleanupRunning: isTTLCleanupRunning(),
        };
      },
    ),
  );

  tools.set(
    'ttl_service_status',
    defineTool(
      {
        name: 'ttl_service_status',
        description:
          'Check the status of the TTL cleanup background service.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      z.object({}),
      async () => {
        const config = await import('../services/state-ttl.js');
        return {
          running: isTTLCleanupRunning(),
          config: config.getTTLCleanupConfig(),
        };
      },
    ),
  );

  return tools;
}
