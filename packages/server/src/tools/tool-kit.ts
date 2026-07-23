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
  const suggestion = suggestionForCode(code);

  const errorResponse: Record<string, unknown> = {
    success: false,
    error: {
      code,
      message,
    },
  };

  // Add helpful context based on error type
  if (details !== undefined) {
    errorResponse.error = { ...errorResponse.error as object, details };
  }

  if (suggestion) {
    errorResponse.error = { ...errorResponse.error as object, suggestion };
  }

  // Add a helpful hint for common errors
  if (code === 'VALIDATION_ERROR' && details && typeof details === 'object' && 'fieldErrors' in details) {
    const fieldErrors = (details as { fieldErrors?: Record<string, unknown[]> }).fieldErrors;
    if (fieldErrors && Object.keys(fieldErrors).length > 0) {
      const fieldNames = Object.keys(fieldErrors).join(', ');
      errorResponse.error = {
        ...errorResponse.error as object,
        hint: `Invalid fields: ${fieldNames}. Check the API documentation for correct types.`,
      };
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(errorResponse),
      },
    ],
    isError: true,
  };
}

function messageForCode(code: string): string {
  const messages: Record<string, string> = {
    // Workspace errors
    WORKSPACE_NOT_FOUND: 'Workspace was not found. Use workspace_ensure() or workspace_create() first.',
    WORKSPACE_NAME_AMBIGUOUS: 'Multiple workspaces have this name. Use workspace_get() with a specific ID.',
    WORKSPACE_ALREADY_EXISTS: 'A workspace with this name already exists. Use workspace_ensure() for idempotent creation.',
    WORKSPACE_DELETE_FORBIDDEN: 'Cannot delete workspace. Only the owner can delete a workspace.',

    // Workflow errors
    WORKFLOW_NOT_FOUND: 'Workflow was not found. Use workflow_create() or router.start() first.',
    WORKFLOW_NOT_RUNNING: 'Workflow is no longer running. Only RUNNING workflows can be modified.',
    WORKFLOW_ALREADY_COMPLETED: 'Workflow is already completed and cannot be modified.',
    WORKFLOW_ALREADY_FAILED: 'Workflow has already failed. Create a new workflow to continue.',

    // State errors
    STATE_NOT_FOUND: 'State key was not found. Use state_write() to create it first.',
    STATE_VERSION_MISMATCH: 'State was modified by another operation. Check the current version and retry.',
    SCHEMA_NOT_FOUND: 'Schema was not found. Use schema_create() to define a schema first.',
    SCHEMA_VALIDATION_FAILED: 'State value does not match the schema. Check field types and required fields.',

    // Checkpoint errors
    CHECKPOINT_NOT_FOUND: 'Checkpoint was not found. Use checkpoint_create() to create checkpoints.',
    CHECKPOINT_RESTORE_FAILED: 'Failed to restore checkpoint. The checkpoint may be corrupted.',
    CHECKPOINT_LIMIT_EXCEEDED: 'Too many checkpoints. Consider using checkpoint_delete() to free space.',

    // Concurrency errors
    VERSION_CONFLICT: 'Version conflict: another operation modified this value. Use expectedVersion for compare-and-swap.',

    // Permission errors
    WRITE_FORBIDDEN: 'Agent role cannot write this state key. Check allowedWriteKeys in agent_role_create().',
    READ_FORBIDDEN: 'Agent role cannot read this state key. Check allowedReadKeys in agent_role_create().',
    AGENT_ROLE_NOT_FOUND: 'Agent role was not found. Use agent_role_create() to define roles.',

    // Step errors
    STEP_EXECUTION_NOT_FOUND: 'Step execution was not found. Use step_run_start() first.',
    STEP_ALREADY_COMPLETED: 'Step has already been completed. Each step can only complete once.',
    STEP_ALREADY_FAILED: 'Step has already failed. Create a new step execution.',

    // Validation errors
    VALIDATION_ERROR: 'Input validation failed. Check required fields and data types.',

    // Handoff errors
    HANDOFF_GENERATION_FAILED: 'Failed to generate handoff summary. Check that state keys exist.',
    HANDOFF_INVALID_KEYS: 'One or more state keys do not exist for handoff.',

    // Generic
    INTERNAL_ERROR: 'An internal error occurred. Check server logs for details.',
    TOOL_NOT_FOUND: 'Tool not found. Verify the tool name is correct.',
  };
  return messages[code] ?? `Operation failed: ${code}`;
}

/**
 * Get a human-readable suggestion for fixing the error
 */
function suggestionForCode(code: string): string | undefined {
  const suggestions: Record<string, string> = {
    STATE_NOT_FOUND: 'Tip: Use state_write() before state_read(), or check the key name for typos.',
    WORKFLOW_NOT_RUNNING: 'Tip: Use router.start() to create a new running workflow.',
    VERSION_CONFLICT: 'Tip: Read the current version with state_read() and pass it as expectedVersion.',
    SCHEMA_VALIDATION_FAILED: 'Tip: Use schema_validate() to check your data against the schema before writing.',
    CHECKPOINT_NOT_FOUND: 'Tip: Use checkpoint_list() to see available checkpoints.',
    WRITE_FORBIDDEN: 'Tip: Check the agent role permissions or write without specifying agentRole.',
  };
  return suggestions[code];
}

export const uuid = { type: 'string', format: 'uuid' };
export const string = { type: 'string' };
export const number = { type: 'number' };
export const object = { type: 'object' };
