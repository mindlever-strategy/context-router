import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { createSchema, getSchema, listSchemas } from '../db/queries.js';
import {
  SchemaValidator,
  type FieldDefinition,
} from '../services/schema-validator.js';
import {
  defineTool,
  object,
  string,
  uuid,
  type ToolRegistry,
} from './tool-kit.js';

const validator = new SchemaValidator();
const fieldDefinition: z.ZodType = z.lazy(() =>
  z.object({
    type: z.enum([
      'string',
      'integer',
      'number',
      'boolean',
      'enum',
      'object',
      'array',
    ]),
    required: z.boolean().optional(),
    values: z.array(z.string()).optional(),
    fields: z.record(z.string(), fieldDefinition).optional(),
    itemType: fieldDefinition.optional(),
  }),
);
const fieldsSchema = z.record(z.string(), fieldDefinition);
const base = { workspaceId: z.string().uuid() };

export function registerSchemaTools(
  _server: McpServer,
  getCurrentUserId: () => string,
): ToolRegistry {
  const tools: ToolRegistry = new Map();

  tools.set(
    'schema_create',
    defineTool(
      {
        name: 'schema_create',
        description: 'Create the next version of a validation schema',
        inputSchema: {
          type: 'object',
          properties: { workspaceId: uuid, name: string, fields: object },
          required: ['workspaceId', 'name', 'fields'],
        },
      },
      z.object({
        ...base,
        name: z.string().min(1).max(100),
        fields: fieldsSchema,
      }),
      ({ workspaceId, name, fields }) =>
        createSchema(
          workspaceId,
          getCurrentUserId(),
          name,
          fields as Record<string, FieldDefinition>,
        ),
    ),
  );

  const namedSchema = z.object({ ...base, name: z.string().min(1).max(100) });
  tools.set(
    'schema_get',
    defineTool(
      {
        name: 'schema_get',
        description: 'Get the latest version of a schema',
        inputSchema: {
          type: 'object',
          properties: { workspaceId: uuid, name: string },
          required: ['workspaceId', 'name'],
        },
      },
      namedSchema,
      async ({ workspaceId, name }) => {
        const schema = await getSchema(workspaceId, getCurrentUserId(), name);
        if (!schema) throw new Error('SCHEMA_NOT_FOUND');
        return schema;
      },
    ),
  );

  tools.set(
    'schema_list',
    defineTool(
      {
        name: 'schema_list',
        description: 'List all schema versions in a workspace',
        inputSchema: {
          type: 'object',
          properties: { workspaceId: uuid },
          required: ['workspaceId'],
        },
      },
      z.object(base),
      ({ workspaceId }) => listSchemas(workspaceId, getCurrentUserId()),
    ),
  );

  tools.set(
    'schema_validate',
    defineTool(
      {
        name: 'schema_validate',
        description: 'Validate data against the latest schema version',
        inputSchema: {
          type: 'object',
          properties: { workspaceId: uuid, schemaName: string, data: object },
          required: ['workspaceId', 'schemaName', 'data'],
        },
      },
      z.object({ ...base, schemaName: z.string().min(1), data: z.unknown() }),
      async ({ workspaceId, schemaName, data }) => {
        const schema = await getSchema(
          workspaceId,
          getCurrentUserId(),
          schemaName,
        );
        if (!schema) throw new Error('SCHEMA_NOT_FOUND');
        const errors = validator.validate(
          schema.fields as Record<string, FieldDefinition>,
          data,
        );
        return {
          valid: errors.length === 0,
          errors,
          schemaVersion: schema.version,
        };
      },
    ),
  );

  return tools;
}
