import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import {
  deleteState,
  getSchema,
  readState,
  readStateFields,
  snapshotState,
  writeState,
} from '../db/queries.js';
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
          'Write structured state with optional schema validation, CAS, provenance, and agent role ACL',
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
            schemaName: string,
            expectedVersion: number,
            agentRole: string,
            provenance: object,
            provenanceMode: {
              type: 'string',
              enum: ['per-field', 'whole-object'],
            },
          },
          required: ['workspaceId', 'workflowId', 'key', 'value'],
        },
      },
      z.object({
        ...identifiers,
        key: z.string().min(1).max(255),
        value: z.unknown(), // Accept any JSON value including arrays and nested objects
        schemaName: z.string().min(1).max(100).optional(),
        expectedVersion: z.number().int().min(0).optional(),
        agentRole: z.string().min(1).max(100).optional(),
        provenance: provenanceSchema,
        provenanceMode: z.enum(['per-field', 'whole-object']).optional(),
      }),
      async ({
        workspaceId,
        workflowId,
        key,
        value,
        schemaName,
        expectedVersion,
        agentRole,
        provenance,
        provenanceMode,
      }) => {
        if (schemaName) {
          const schema = await getSchema(
            workspaceId,
            getCurrentUserId(),
            schemaName,
          );
          if (!schema) throw new Error('SCHEMA_NOT_FOUND');
          const errors = validator.validate(
            schema.fields as Record<string, FieldDefinition>,
            value,
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
          !schemaName &&
          process.env.CONTEXT_ROUTER_LOG_UNVALIDATED_STATE === 'true'
        ) {
          console.warn(
            `[context-router] state_write key="${key}" without schemaName: UNVALIDATED_STATE`,
          );
        }
        const state = await writeState(
          workspaceId,
          getCurrentUserId(),
          workflowId,
          key,
          value as Prisma.InputJsonValue,
          {
            expectedVersion,
            agentRole,
            provenance,
            provenanceMode,
          },
        );
        return {
          written: true,
          state,
          ...(schemaName ? {} : { warning: 'UNVALIDATED_STATE' as const }),
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
          'Read one state key or selected keys with optional role filtering and unwrap',
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
          return {
            values: await readStateFields(
              workspaceId,
              getCurrentUserId(),
              workflowId,
              keys,
              { agentRole, unwrap },
            ),
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
        return { key: state.key, value: state.value, version: state.version };
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

  return tools;
}
