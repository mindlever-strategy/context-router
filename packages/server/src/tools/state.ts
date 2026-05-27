import { Server as McpServer } from '@modelcontextprotocol/sdk/server';
import { z } from 'zod';
import {
  writeState,
  readState,
  readStateFields,
  deleteState,
  snapshotState,
  getSchema,
} from '../db/queries';
import { SchemaValidator, FieldDefinition } from '../services/schema-validator';

// Initialize schema validator
const schemaValidator = new SchemaValidator();

// Input schemas for validation
const stateWriteSchema = z.object({
  workspaceId: z.string().uuid('Invalid workspace ID format'),
  workflowId: z.string().uuid('Invalid workflow ID format'),
  key: z.string().min(1, 'State key is required').max(255, 'State key must be 255 characters or less'),
  value: z.unknown(),
  schemaName: z.string().optional(),
});

const stateReadSchema = z.object({
  workflowId: z.string().uuid('Invalid workflow ID format'),
  key: z.string().min(1, 'State key is required'),
  fields: z.array(z.string()).optional(),
});

const stateDeleteSchema = z.object({
  workflowId: z.string().uuid('Invalid workflow ID format'),
  key: z.string().min(1, 'State key is required'),
});

const stateSnapshotSchema = z.object({
  workflowId: z.string().uuid('Invalid workflow ID format'),
});

export type StateWriteInput = z.infer<typeof stateWriteSchema>;
export type StateReadInput = z.infer<typeof stateReadSchema>;
export type StateDeleteInput = z.infer<typeof stateDeleteSchema>;
export type StateSnapshotInput = z.infer<typeof stateSnapshotSchema>;

export interface StateToolDefinition {
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
 * Register state management tools with the MCP server.
 *
 * Tools provided:
 * - state_write: Write a key-value pair to workflow state with optional schema validation
 * - state_read: Read a specific state key or multiple fields
 * - state_delete: Delete a state key from workflow
 * - state_snapshot: Get a complete snapshot of all state for a workflow
 */
export function registerStateTools(
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

  // state_write tool
  const stateWriteTool: Tool = {
    definition: {
      name: 'state_write',
      description: 'Write a key-value pair to workflow state with optional schema validation',
      inputSchema: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: 'Workspace ID (UUID format)',
          },
          workflowId: {
            type: 'string',
            description: 'Workflow ID (UUID format)',
          },
          key: {
            type: 'string',
            description: 'State key name (1-255 characters)',
          },
          value: {
            type: 'object',
            description: 'State value to store (must be JSON-serializable)',
          },
          schemaName: {
            type: 'string',
            description: 'Optional schema name to validate value against',
          },
        },
        required: ['workspaceId', 'workflowId', 'key', 'value'],
      },
    },
    handler: async (args: unknown) => {
      const parsed = stateWriteSchema.safeParse(args);

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
        const { workspaceId, workflowId, key, value, schemaName } = parsed.data;

        // Validate against schema if provided
        if (schemaName) {
          const schema = await getSchema(workspaceId, schemaName);

          if (schema) {
            const fields = schema.fields as Record<string, FieldDefinition>;
            const errors = schemaValidator.validate(fields, value);

            if (errors.length > 0) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: JSON.stringify({
                      error: 'validation_failed',
                      details: errors,
                      schemaName,
                    }),
                  },
                ],
                isError: true,
              };
            }
          }
        }

        const state = await writeState(workspaceId, workflowId, key, value as object);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                state,
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
                error: 'Failed to write state',
                details: message,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  };

  // state_read tool
  const stateReadTool: Tool = {
    definition: {
      name: 'state_read',
      description: 'Read a specific state key or multiple fields from workflow state',
      inputSchema: {
        type: 'object',
        properties: {
          workflowId: {
            type: 'string',
            description: 'Workflow ID (UUID format)',
          },
          key: {
            type: 'string',
            description: 'State key to read',
          },
          fields: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional: array of field keys to read multiple values at once',
          },
        },
        required: ['workflowId'],
      },
    },
    handler: async (args: unknown) => {
      const parsed = stateReadSchema.safeParse(args);

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
        const { workflowId, key, fields } = parsed.data;

        // If fields array provided, read multiple values
        if (fields && Array.isArray(fields) && fields.length > 0) {
          const data = await readStateFields(workflowId, fields);

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: true,
                  data,
                }),
              },
            ],
          };
        }

        // Read single key
        const state = await readState(workflowId, key);

        if (!state) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'State not found',
                  workflowId,
                  key,
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
                value: state.value,
                key: state.key,
                version: state.version,
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
                error: 'Failed to read state',
                details: message,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  };

  // state_delete tool
  const stateDeleteTool: Tool = {
    definition: {
      name: 'state_delete',
      description: 'Delete a state key from workflow',
      inputSchema: {
        type: 'object',
        properties: {
          workflowId: {
            type: 'string',
            description: 'Workflow ID (UUID format)',
          },
          key: {
            type: 'string',
            description: 'State key to delete',
          },
        },
        required: ['workflowId', 'key'],
      },
    },
    handler: async (args: unknown) => {
      const parsed = stateDeleteSchema.safeParse(args);

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
        const { workflowId, key } = parsed.data;

        // Check if state exists first
        const existing = await readState(workflowId, key);

        if (!existing) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'State not found',
                  workflowId,
                  key,
                }),
              },
            ],
            isError: true,
          };
        }

        await deleteState(workflowId, key);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                workflowId,
                key,
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
                error: 'Failed to delete state',
                details: message,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  };

  // state_snapshot tool
  const stateSnapshotTool: Tool = {
    definition: {
      name: 'state_snapshot',
      description: 'Get a complete snapshot of all state key-value pairs for a workflow',
      inputSchema: {
        type: 'object',
        properties: {
          workflowId: {
            type: 'string',
            description: 'Workflow ID (UUID format)',
          },
        },
        required: ['workflowId'],
      },
    },
    handler: async (args: unknown) => {
      const parsed = stateSnapshotSchema.safeParse(args);

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
        const { workflowId } = parsed.data;
        const snapshot = await snapshotState(workflowId);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                workflowId,
                snapshot,
                keys: Object.keys(snapshot),
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
                error: 'Failed to snapshot state',
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
  tools.set('state_write', stateWriteTool);
  tools.set('state_read', stateReadTool);
  tools.set('state_delete', stateDeleteTool);
  tools.set('state_snapshot', stateSnapshotTool);

  return tools;
}
