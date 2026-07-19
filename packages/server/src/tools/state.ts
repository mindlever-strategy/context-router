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
import type { Prisma } from '../generated/prisma/client.js';
import {
  defineTool,
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
          'Write structured state, optionally validated against a schema',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            workflowId: uuid,
            key: string,
            value: object,
            schemaName: string,
          },
          required: ['workspaceId', 'workflowId', 'key', 'value'],
        },
      },
      z.object({
        ...identifiers,
        key: z.string().min(1).max(255),
        value: z.record(z.string(), z.unknown()),
        schemaName: z.string().min(1).max(100).optional(),
      }),
      async ({ workspaceId, workflowId, key, value, schemaName }) => {
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
        const state = await writeState(
          workspaceId,
          getCurrentUserId(),
          workflowId,
          key,
          value as Prisma.InputJsonValue,
        );
        return { written: true, state };
      },
    ),
  );

  tools.set(
    'state_read',
    defineTool(
      {
        name: 'state_read',
        description: 'Read one state key or a selected set of state keys',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            workflowId: uuid,
            key: string,
            keys: { type: 'array', items: string },
          },
          required: ['workspaceId', 'workflowId'],
        },
      },
      z
        .object({
          ...identifiers,
          key: z.string().min(1).optional(),
          keys: z.array(z.string().min(1)).min(1).optional(),
        })
        .refine((value) => Boolean(value.key) !== Boolean(value.keys), {
          message: 'Provide exactly one of key or keys',
        }),
      async ({ workspaceId, workflowId, key, keys }) => {
        if (keys) {
          return {
            values: await readStateFields(
              workspaceId,
              getCurrentUserId(),
              workflowId,
              keys,
            ),
          };
        }
        const state = await readState(
          workspaceId,
          getCurrentUserId(),
          workflowId,
          key!,
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
        description: 'Read the complete workflow state as a key-value object',
        inputSchema: {
          type: 'object',
          properties: { workspaceId: uuid, workflowId: uuid },
          required: ['workspaceId', 'workflowId'],
        },
      },
      z.object(identifiers),
      ({ workspaceId, workflowId }) =>
        snapshotState(workspaceId, getCurrentUserId(), workflowId),
    ),
  );

  return tools;
}
