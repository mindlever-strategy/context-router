/**
 * State Batch Operations MCP Tools
 * Provides batch read/write for multiple state keys in a single operation
 */

import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { writeStateBatch, readStateBatch } from '../db/queries.js';
import {
  defineTool,
  string,
  uuid,
  type ToolRegistry,
} from './tool-kit.js';

export function registerStateBatchTools(
  _server: McpServer,
  getCurrentUserId: () => string,
): ToolRegistry {
  const tools: ToolRegistry = new Map();

  tools.set(
    'state_write_batch',
    defineTool(
      {
        name: 'state_write_batch',
        description:
          'Write multiple state keys in a single batch operation. Efficient for saving related state values together.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            workflowId: uuid,
            entries: {
              type: 'array',
              description: 'State entries to write',
              items: {
                type: 'object',
                properties: {
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
                  schemaName: {
                    type: 'string',
                    description: 'Optional schema name for validation',
                  },
                },
                required: ['key', 'value'],
              },
            },
            options: {
              type: 'object',
              properties: {
                atomic: {
                  type: 'boolean',
                  description: 'If true, all writes must succeed (transaction)',
                },
                onConflict: {
                  type: 'string',
                  enum: ['upsert', 'skip', 'fail'],
                  description: 'Behavior on key conflict',
                },
              },
            },
          },
          required: ['workspaceId', 'workflowId', 'entries'],
        },
      },
      z.object({
        workspaceId: z.string().uuid(),
        workflowId: z.string().uuid(),
        entries: z
          .array(
            z.object({
              key: z.string().min(1).max(255),
              value: z.unknown(),
              schemaName: z.string().optional(),
            }),
          )
          .min(1)
          .max(100),
        options: z
          .object({
            atomic: z.boolean().default(false),
            onConflict: z.enum(['upsert', 'skip', 'fail']).optional(),
          })
          .optional(),
      }),
      async ({ workspaceId, workflowId, entries, options }) => {
        return writeStateBatch(
          workspaceId,
          getCurrentUserId(),
          workflowId,
          entries.map((e) => ({
            key: e.key,
            value: e.value as import('../generated/postgresql/client.js').Prisma.InputJsonValue,
            schemaName: e.schemaName,
          })),
          options ?? {},
        );
      },
    ),
  );

  tools.set(
    'state_read_batch',
    defineTool(
      {
        name: 'state_read_batch',
        description:
          'Read multiple state keys in a single batch operation. More efficient than multiple individual reads.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            workflowId: uuid,
            keys: {
              type: 'array',
              items: string,
              description: 'State keys to read',
            },
            options: {
              type: 'object',
              properties: {
                unwrap: {
                  type: 'boolean',
                  description: 'Remove provenance metadata wrapper',
                },
                agentRole: string,
              },
            },
          },
          required: ['workspaceId', 'workflowId', 'keys'],
        },
      },
      z.object({
        workspaceId: z.string().uuid(),
        workflowId: z.string().uuid(),
        keys: z.array(z.string().min(1)).min(1).max(100),
        options: z
          .object({
            unwrap: z.boolean().optional(),
            agentRole: z.string().optional(),
          })
          .optional(),
      }),
      async ({ workspaceId, workflowId, keys, options }) => {
        return readStateBatch(
          workspaceId,
          getCurrentUserId(),
          workflowId,
          keys,
          options ?? {},
        );
      },
    ),
  );

  return tools;
}
