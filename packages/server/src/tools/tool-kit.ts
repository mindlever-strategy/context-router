import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import type { ZodType } from 'zod';

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface Tool {
  definition: {
    name: string;
    description: string;
    inputSchema: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
  handler: (args: unknown) => Promise<ToolResult>;
}

export type ToolRegistry = Map<string, Tool>;
export type RegisterTools = (
  server: McpServer,
  getCurrentUserId: () => string,
) => ToolRegistry;

export class ToolOperationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function defineTool<T>(
  definition: Tool['definition'],
  schema: ZodType<T>,
  operation: (input: T) => Promise<unknown>,
): Tool {
  return {
    definition,
    handler: async (args) => {
      const parsed = schema.safeParse(args);
      if (!parsed.success) {
        return failure(
          'VALIDATION_ERROR',
          'Tool arguments are invalid',
          parsed.error.flatten(),
        );
      }
      try {
        return success(await operation(parsed.data));
      } catch (error) {
        if (error instanceof ToolOperationError) {
          return failure(error.code, error.message, error.details);
        }
        const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
        return failure(
          /^[A-Z][A-Z0-9_]+$/.test(code) ? code : 'INTERNAL_ERROR',
          messageForCode(code),
          code === 'INTERNAL_ERROR' ? String(error) : undefined,
        );
      }
    },
  };
}

export function success(data: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ success: true, data }) }],
  };
}

export function failure(
  code: string,
  message: string,
  details?: unknown,
): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: {
            code,
            message,
            ...(details === undefined ? {} : { details }),
          },
        }),
      },
    ],
    isError: true,
  };
}

function messageForCode(code: string): string {
  const messages: Record<string, string> = {
    WORKSPACE_NOT_FOUND: 'Workspace was not found for the local owner',
    WORKSPACE_NAME_AMBIGUOUS:
      'Multiple legacy workspaces have this name; select one by ID or rename duplicates',
    WORKFLOW_NOT_FOUND: 'Workflow was not found in the workspace',
    WORKFLOW_NOT_RUNNING: 'Workflow is no longer running',
    STATE_NOT_FOUND: 'State key was not found in the workflow',
    SCHEMA_NOT_FOUND: 'Schema was not found in the workspace',
    CHECKPOINT_NOT_FOUND: 'Checkpoint was not found in the workspace',
    VERSION_CONFLICT: 'State version does not match the expected version',
    WRITE_FORBIDDEN: 'Agent role is not allowed to write this state key',
    READ_FORBIDDEN: 'Agent role is not allowed to read this state key',
    AGENT_ROLE_NOT_FOUND: 'Agent role was not found in the workspace',
    STEP_EXECUTION_NOT_FOUND: 'Step execution was not found for this workflow',
  };
  return messages[code] ?? 'Tool operation failed';
}

export const uuid = { type: 'string', format: 'uuid' };
export const string = { type: 'string' };
export const number = { type: 'number' };
export const object = { type: 'object' };
