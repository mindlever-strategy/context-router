import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import {
  cleanupExpiredStates,
  deleteState,
  getSchema,
  readState,
  readStateFields,
  snapshotState,
  writeState,
  writeStateBatch,
} from '../db/queries.js';
import { isTTLCleanupRunning } from '../services/state-ttl.js';
import {
  SchemaValidator,
  type FieldDefinition,
} from '../services/schema-validator.js';
import type { Prisma } from '../generated/postgresql/client.js';
import {
  defineTool,
  number,
  object,
  string,
  ToolOperationError,
  uuid,
  type ToolRegistry,
} from './tool-kit.js';

const validator = new SchemaValidator();
const identifiers = {
  workspaceId: z.string().uuid(),
  workflowId: z.string().uuid(),
};

const provenanceSchema = z
  .object({
    agentRole: z.string().min(1).max(100).optional(),
    executionId: z.string().uuid().optional(),
    source: z.string().max(255).optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .optional();

export function registerStateTools(
  _server: McpServer,
  getCurrentUserId: () => string,
): ToolRegistry {
  const tools: ToolRegistry = new Map();

  tools.set(
    'state_write',
    defineTool(
      {
        name: 'state_write',
        description:
          'Write one state key or a batch. Supports schema validation, compare-and-set, TTL expiry, provenance, and agent role ACL.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            workflowId: uuid,
            key: string,
            // Align with z.unknown(): accept any JSON value (not only objects).
            // MCP clients that validate against this schema reject arrays/scalars
            // if type is restricted to "object".
            value: {
              description:
                'Any JSON value: object, array, string, number, boolean, or null',
              anyOf: [
                { type: 'object' },
                { type: 'array' },
                { type: 'string' },
                { type: 'number' },
                { type: 'boolean' },
                { type: 'null' },
              ],
            },
            entries: {
              type: 'array',
              description:
                'Batch mode: write many keys at once. Mutually exclusive with key/value.',
              items: {
                type: 'object',
                properties: {
                  key: string,
                  value: {
                    description:
                      'Any JSON value: object, array, string, number, boolean, or null',
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
            atomic: {
              type: 'boolean',
              description: 'Batch mode: commit all entries or none',
            },
            onConflict: {
              type: 'string',
              enum: ['upsert', 'skip', 'fail'],
              description: 'Batch mode: behaviour when a key already exists',
            },
            schemaName: string,
            expectedVersion: number,
            expiresIn: {
              type: 'number',
              description: 'TTL in seconds from now',
            },
            expiresAt: {
              type: 'string',
              description: 'Absolute expiry as an ISO 8601 timestamp',
            },
            agentRole: string,
            provenance: object,
            provenanceMode: {
              type: 'string',
              enum: ['per-field', 'whole-object'],
            },
          },
          required: ['workspaceId', 'workflowId'],
        },
      },
      z
        .object({
          ...identifiers,
          key: z.string().min(1).max(255).optional(),
          value: z.unknown().optional(),
          entries: z
            .array(
              z.object({
                key: z.string().min(1).max(255),
                value: z.unknown(),
                schemaName: z.string().min(1).max(100).optional(),
              }),
            )
            .min(1)
            .max(100)
            .optional(),
          atomic: z.boolean().optional(),
          onConflict: z.enum(['upsert', 'skip', 'fail']).optional(),
          schemaName: z.string().min(1).max(100).optional(),
          expectedVersion: z.number().int().min(0).optional(),
          expiresIn: z.number().int().positive().optional(),
          expiresAt: z.string().datetime().optional(),
          agentRole: z.string().min(1).max(100).optional(),
          provenance: provenanceSchema,
          provenanceMode: z.enum(['per-field', 'whole-object']).optional(),
        })
        .refine((input) => Boolean(input.key) !== Boolean(input.entries), {
          message: 'Provide exactly one of key or entries',
        })
        .refine((input) => !(input.expiresIn && input.expiresAt), {
          message: 'Provide either expiresIn or expiresAt, not both',
        })
        .refine(
          (input) => !(input.entries && (input.provenance || input.provenanceMode)),
          {
            message:
              'provenance and provenanceMode are not supported with batch entries. Use single key/value writes instead.',
          },
        ),
      async (input) => {
        if (input.entries) {
          return writeStateBatch(
            input.workspaceId,
            getCurrentUserId(),
            input.workflowId,
            input.entries.map((entry) => ({
              key: entry.key,
              value: entry.value as Prisma.InputJsonValue,
              schemaName: entry.schemaName,
            })),
            { atomic: input.atomic, onConflict: input.onConflict },
          );
        }

        if (input.schemaName) {
          const schema = await getSchema(
            input.workspaceId,
            getCurrentUserId(),
            input.schemaName,
          );
          if (!schema) throw new Error('SCHEMA_NOT_FOUND');
          const errors = validator.validate(
            schema.fields as Record<string, FieldDefinition>,
            input.value,
          );
          if (errors.length > 0) {
            throw new ToolOperationError(
              'SCHEMA_VALIDATION_FAILED',
              'State value does not match the schema',
              errors,
            );
          }
        }
        if (
          !input.schemaName &&
          process.env.CONTEXT_ROUTER_LOG_UNVALIDATED_STATE === 'true'
        ) {
          console.warn(
            `[context-router] state_write key="${input.key}" without schemaName: UNVALIDATED_STATE`,
          );
        }

        const state = await writeState(
          input.workspaceId,
          getCurrentUserId(),
          input.workflowId,
          input.key!,
          input.value as Prisma.InputJsonValue,
          {
            expectedVersion: input.expectedVersion,
            agentRole: input.agentRole,
            provenance: input.provenance,
            provenanceMode: input.provenanceMode,
            expiresIn: input.expiresIn,
            expiresAt: input.expiresAt
              ? new Date(input.expiresAt)
              : undefined,
          },
        );
        return {
          written: true,
          state,
          ...(input.schemaName
            ? {}
            : { warning: 'UNVALIDATED_STATE' as const }),
        };
      },
    ),
  );

  tools.set(
    'state_read',
    defineTool(
      {
        name: 'state_read',
        description:
          'Read one state key or several. Expired keys are never returned. Supports role filtering and provenance unwrap.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            workflowId: uuid,
            key: string,
            keys: { type: 'array', items: string },
            agentRole: string,
            unwrap: { type: 'boolean' },
          },
          required: ['workspaceId', 'workflowId'],
        },
      },
      z
        .object({
          ...identifiers,
          key: z.string().min(1).optional(),
          keys: z.array(z.string().min(1)).min(1).optional(),
          agentRole: z.string().min(1).max(100).optional(),
          unwrap: z.boolean().optional(),
        })
        .refine((value) => Boolean(value.key) !== Boolean(value.keys), {
          message: 'Provide exactly one of key or keys',
        }),
      async ({ workspaceId, workflowId, key, keys, agentRole, unwrap }) => {
        if (keys) {
          const values = await readStateFields(
            workspaceId,
            getCurrentUserId(),
            workflowId,
            keys,
            { agentRole, unwrap },
          );
          return {
            values,
            missing: keys.filter((candidate) => !(candidate in values)),
          };
        }
        const state = await readState(
          workspaceId,
          getCurrentUserId(),
          workflowId,
          key!,
          { agentRole, unwrap },
        );
        if (!state) throw new Error('STATE_NOT_FOUND');
        return {
          key: state.key,
          value: state.value,
          version: state.version,
          expiresAt: state.expiresAt,
        };
      },
    ),
  );

  const stateKeySchema = z.object({
    ...identifiers,
    key: z.string().min(1).max(255),
  });
  tools.set(
    'state_delete',
    defineTool(
      {
        name: 'state_delete',
        description: 'Delete a state key from a running workflow',
        inputSchema: {
          type: 'object',
          properties: { workspaceId: uuid, workflowId: uuid, key: string },
          required: ['workspaceId', 'workflowId', 'key'],
        },
      },
      stateKeySchema,
      ({ workspaceId, workflowId, key }) =>
        deleteState(workspaceId, getCurrentUserId(), workflowId, key),
    ),
  );

  tools.set(
    'state_snapshot',
    defineTool(
      {
        name: 'state_snapshot',
        description:
          'Read complete workflow state with optional role filtering',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            workflowId: uuid,
            agentRole: string,
            unwrap: { type: 'boolean' },
          },
          required: ['workspaceId', 'workflowId'],
        },
      },
      z.object({
        ...identifiers,
        agentRole: z.string().min(1).max(100).optional(),
        unwrap: z.boolean().optional(),
      }),
      ({ workspaceId, workflowId, agentRole, unwrap }) =>
        snapshotState(workspaceId, getCurrentUserId(), workflowId, {
          agentRole,
          unwrap,
        }),
    ),
  );

  tools.set(
    'state_delete_expired',
    defineTool(
      {
        name: 'state_delete_expired',
        description:
          'Delete expired state entries now. The background cleanup service does this automatically.',
        inputSchema: {
          type: 'object',
          properties: {
            batchSize: {
              type: 'number',
              description: 'Maximum entries to delete in this call',
            },
          },
        },
      },
      z.object({
        batchSize: z.number().int().positive().max(1000).default(100),
      }),
      async ({ batchSize }) => ({
        deleted: await cleanupExpiredStates(batchSize),
        cleanupRunning: isTTLCleanupRunning(),
      }),
    ),
  );

  return tools;
}
