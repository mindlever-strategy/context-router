import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { readStateFields } from '../db/queries.js';
import { HandoffGenerator } from '../services/handoff-generator.js';
import { defineTool, string, uuid, type ToolRegistry } from './tool-kit.js';

const generator = new HandoffGenerator();
const handoffSchema = z.object({
  workspaceId: z.string().uuid(),
  workflowId: z.string().uuid(),
  keys: z.array(z.string().min(1)).optional(),
  maxTokens: z.number().int().min(50).max(1000).default(200),
});

export function registerHandoffTools(
  _server: McpServer,
  getCurrentUserId: () => string,
): ToolRegistry {
  const tools: ToolRegistry = new Map();
  const commonProperties = {
    workspaceId: uuid,
    workflowId: uuid,
    keys: { type: 'array', items: string },
    maxTokens: { type: 'integer', minimum: 50, maximum: 1000, default: 200 },
  };

  tools.set(
    'handoff_generate',
    defineTool(
      {
        name: 'handoff_generate',
        description:
          'Generate a bounded human-readable summary from selected or all state keys',
        inputSchema: {
          type: 'object',
          properties: commonProperties,
          required: ['workspaceId', 'workflowId'],
        },
      },
      handoffSchema,
      async ({ workspaceId, workflowId, keys, maxTokens }) => {
        const state = await readStateFields(
          workspaceId,
          getCurrentUserId(),
          workflowId,
          keys,
        );
        return {
          summary: generator.generate(state, { maxTokens }),
          keysIncluded: Object.keys(state),
        };
      },
    ),
  );

  tools.set(
    'handoff_apply',
    defineTool(
      {
        name: 'handoff_apply',
        description: 'Generate a handoff summary and prepend optional context',
        inputSchema: {
          type: 'object',
          properties: { ...commonProperties, prefix: string },
          required: ['workspaceId', 'workflowId'],
        },
      },
      handoffSchema.extend({ prefix: z.string().max(1000).optional() }),
      async ({ workspaceId, workflowId, keys, maxTokens, prefix }) => {
        const state = await readStateFields(
          workspaceId,
          getCurrentUserId(),
          workflowId,
          keys,
        );
        const summary = generator.generate(state, { maxTokens });
        return {
          context: prefix ? `${prefix}\n\n${summary}` : summary,
          keysIncluded: Object.keys(state),
        };
      },
    ),
  );

  return tools;
}
