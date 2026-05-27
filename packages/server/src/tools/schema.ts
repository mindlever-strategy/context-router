import { Server as McpServer } from '@modelcontextprotocol/sdk/server';
import { z } from 'zod';
import {
  createSchema,
  getSchema,
  listSchemas,
} from '../db/queries';
import { SchemaValidator, FieldDefinition } from '../services/schema-validator';

// Initialize schema validator
const schemaValidator = new SchemaValidator();

// Input schemas for validation
const schemaCreateSchema = z.object({
  workspaceId: z.string().uuid('Invalid workspace ID format'),
  name: z.string().min(1, 'Schema name is required').max(100, 'Schema name must be 100 characters or less'),
  fields: z.record(z.string(), z.object({
    type: z.enum(['string', 'integer', 'number', 'boolean', 'enum', 'object', 'array']),
    required: z.boolean().optional(),
    values: z.array(z.string()).optional(),
    fields: z.record(z.string(), z.any()).optional(),
    itemType: z.any().optional(),
  })),
});

const schemaGetSchema = z.object({
  workspaceId: z.string().uuid('Invalid workspace ID format'),
  name: z.string().min(1, 'Schema name is required'),
});

const schemaListSchema = z.object({
  workspaceId: z.string().uuid('Invalid workspace ID format'),
});

const schemaValidateSchema = z.object({
  workspaceId: z.string().uuid('Invalid workspace ID format'),
  schemaName: z.string().min(1, 'Schema name is required'),
  data: z.unknown(),
});

export type SchemaCreateInput = z.infer<typeof schemaCreateSchema>;
export type SchemaGetInput = z.infer<typeof schemaGetSchema>;
export type SchemaListInput = z.infer<typeof schemaListSchema>;
export type SchemaValidateInput = z.infer<typeof schemaValidateSchema>;

export interface SchemaToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * MCP Tool definition matching the SDK's ToolSchema
 */
interface Tool {
  definition: {
    name: string;
    description?: string;
    inputSchema: {
      type: 'object';
      properties?: Record<string, unknown>;
      required?: string[];
    };
  };
  handler: (args: unknown) => Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }>;
}

/**
 * Register schema management tools with the MCP server.
 *
 * Tools provided:
 * - schema_create: Create a new schema for workflow data validation
 * - schema_get: Get a specific schema by workspace and name
 * - schema_list: List all schemas for a workspace
 * - schema_validate: Validate data against a schema
 */
export function registerSchemaTools(
  server: McpServer,
  getCurrentUserId: () => string | undefined
): Map<string, Tool> {
  const tools = new Map<string, Tool>();

  // Helper to get authenticated user
  const getUserId = (): string => {
    const userId = getCurrentUserId();
    if (!userId) {
      throw new Error('Authentication required: No user context available');
    }
    return userId;
  };

  // schema_create tool
  const schemaCreateTool: Tool = {
    definition: {
      name: 'schema_create',
      description: 'Create a new schema for workflow data validation',
      inputSchema: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: 'Workspace ID (UUID format)',
          },
          name: {
            type: 'string',
            description: 'Schema name (1-100 characters)',
          },
          fields: {
            type: 'object',
            description: 'Schema field definitions',
          },
        },
        required: ['workspaceId', 'name', 'fields'],
      },
    },
    handler: async (args: unknown) => {
      const parsed = schemaCreateSchema.safeParse(args);

      if (!parsed.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Validation failed',
                details: parsed.error.flatten().fieldErrors,
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        const userId = getUserId();
        const { workspaceId, name, fields } = parsed.data;

        const schema = await createSchema(workspaceId, name, fields);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                schema,
              }),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Failed to create schema',
                details: message,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  };

  // schema_get tool
  const schemaGetTool: Tool = {
    definition: {
      name: 'schema_get',
      description: 'Get a specific schema by workspace and name',
      inputSchema: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: 'Workspace ID (UUID format)',
          },
          name: {
            type: 'string',
            description: 'Schema name',
          },
        },
        required: ['workspaceId', 'name'],
      },
    },
    handler: async (args: unknown) => {
      const parsed = schemaGetSchema.safeParse(args);

      if (!parsed.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Validation failed',
                details: parsed.error.flatten().fieldErrors,
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        const { workspaceId, name } = parsed.data;
        const schema = await getSchema(workspaceId, name);

        if (!schema) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'Schema not found',
                  workspaceId,
                  name,
                }),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                schema,
              }),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Failed to get schema',
                details: message,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  };

  // schema_list tool
  const schemaListTool: Tool = {
    definition: {
      name: 'schema_list',
      description: 'List all schemas for a workspace',
      inputSchema: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: 'Workspace ID (UUID format)',
          },
        },
        required: ['workspaceId'],
      },
    },
    handler: async (args: unknown) => {
      const parsed = schemaListSchema.safeParse(args);

      if (!parsed.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Validation failed',
                details: parsed.error.flatten().fieldErrors,
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        const { workspaceId } = parsed.data;
        const schemas = await listSchemas(workspaceId);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                schemas,
                count: schemas.length,
              }),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Failed to list schemas',
                details: message,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  };

  // schema_validate tool
  const schemaValidateTool: Tool = {
    definition: {
      name: 'schema_validate',
      description: 'Validate data against a schema',
      inputSchema: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: 'Workspace ID (UUID format)',
          },
          schemaName: {
            type: 'string',
            description: 'Schema name to validate against',
          },
          data: {
            type: 'object',
            description: 'Data to validate',
          },
        },
        required: ['workspaceId', 'schemaName', 'data'],
      },
    },
    handler: async (args: unknown) => {
      const parsed = schemaValidateSchema.safeParse(args);

      if (!parsed.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Validation failed',
                details: parsed.error.flatten().fieldErrors,
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        const { workspaceId, schemaName, data } = parsed.data;

        // First get the schema
        const schema = await getSchema(workspaceId, schemaName);

        if (!schema) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'Schema not found',
                  workspaceId,
                  schemaName,
                }),
              },
            ],
            isError: true,
          };
        }

        // Validate the data against the schema fields
        const fields = schema.fields as Record<string, FieldDefinition>;
        const errors = schemaValidator.validate(fields, data);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                valid: errors.length === 0,
                errors,
                schemaName,
              }),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Failed to validate data',
                details: message,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  };

  // Register all tools
  tools.set('schema_create', schemaCreateTool);
  tools.set('schema_get', schemaGetTool);
  tools.set('schema_list', schemaListTool);
  tools.set('schema_validate', schemaValidateTool);

  return tools;
}
