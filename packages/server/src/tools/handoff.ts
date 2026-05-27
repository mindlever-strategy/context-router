import { Server as McpServer } from '@modelcontextprotocol/sdk/server';
import { z } from 'zod';
import { readStateFields } from '../db/queries';
import { HandoffGenerator } from '../services/handoff-generator';

// Initialize handoff generator
const handoffGenerator = new HandoffGenerator();

// Input schemas for validation
const handoffGenerateSchema = z.object({
  workflowId: z.string().uuid('Invalid workflow ID format'),
  keys: z.array(z.string()).optional(),
  maxTokens: z.number().min(50).max(1000).optional(),
});

const handoffApplySchema = z.object({
  workflowId: z.string().uuid('Invalid workflow ID format'),
  keys: z.array(z.string()).optional(),
  prefix: z.string().max(1000).optional(),
  maxTokens: z.number().min(50).max(1000).optional(),
});

export type HandoffGenerateInput = z.infer<typeof handoffGenerateSchema>;
export type HandoffApplyInput = z.infer<typeof handoffApplySchema>;

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
 * Register handoff tools with the MCP server.
 *
 * Tools provided:
 * - handoff_generate: Generate a concise state summary for agent-to-agent handoffs
 * - handoff_apply: Generate a handoff summary with optional prefix for context injection
 */
export function registerHandoffTools(
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

  // handoff_generate tool
  const handoffGenerateTool: Tool = {
    definition: {
      name: 'handoff_generate',
      description: 'Generate a concise state summary for agent-to-agent handoffs',
      inputSchema: {
        type: 'object',
        properties: {
          workflowId: {
            type: 'string',
            description: 'Workflow ID (UUID format)',
          },
          keys: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional: array of state keys to include (defaults to all keys)',
          },
          maxTokens: {
            type: 'number',
            description: 'Maximum tokens in summary (50-1000, defaults to 200)',
          },
        },
        required: ['workflowId'],
      },
    },
    handler: async (args: unknown) => {
      const parsed = handoffGenerateSchema.safeParse(args);

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
        const { workflowId, keys, maxTokens } = parsed.data;

        // Read state for specified keys or all keys
        const state = await readStateFields(workflowId, keys || []);

        const summary = handoffGenerator.generate(state, {
          maxTokens: maxTokens || 200,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                workflowId,
                summary,
                keysIncluded: Object.keys(state),
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
                error: 'Failed to generate handoff',
                details: message,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  };

  // handoff_apply tool
  const handoffApplyTool: Tool = {
    definition: {
      name: 'handoff_apply',
      description: 'Generate a handoff summary with optional prefix for context injection',
      inputSchema: {
        type: 'object',
        properties: {
          workflowId: {
            type: 'string',
            description: 'Workflow ID (UUID format)',
          },
          keys: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional: array of state keys to include (defaults to all keys)',
          },
          prefix: {
            type: 'string',
            description: 'Optional prefix text to prepend to the summary (max 1000 chars)',
          },
          maxTokens: {
            type: 'number',
            description: 'Maximum tokens in summary (50-1000, defaults to 200)',
          },
        },
        required: ['workflowId'],
      },
    },
    handler: async (args: unknown) => {
      const parsed = handoffApplySchema.safeParse(args);

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
        const { workflowId, keys, prefix, maxTokens } = parsed.data;

        const state = await readStateFields(workflowId, keys || []);
        const summary = handoffGenerator.generate(state, {
          maxTokens: maxTokens || 200,
        });

        const context = prefix ? `${prefix}\n\n${summary}` : summary;

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                workflowId,
                context,
                keysIncluded: Object.keys(state),
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
                error: 'Failed to generate handoff context',
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
  tools.set('handoff_generate', handoffGenerateTool);
  tools.set('handoff_apply', handoffApplyTool);

  return tools;
}
