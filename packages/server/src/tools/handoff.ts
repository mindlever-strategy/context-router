import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { readStateFields, getAgentRole } from '../db/queries.js';
import { filterReadableState } from '../services/agent-role.js';
import {
  HandoffGenerator,
  type StructuredHandoff,
} from '../services/handoff-generator.js';
import { defineTool, string, uuid, type ToolRegistry } from './tool-kit.js';

const generator = new HandoffGenerator();
const handoffSchema = z.object({
  workspaceId: z.string().uuid(),
  workflowId: z.string().uuid(),
  keys: z.array(z.string().min(1)).optional(),
  maxTokens: z.number().int().min(50).max(1000).default(200),
  agentRole: z.string().min(1).max(100).optional(),
  priorityKeys: z.array(z.string().min(1)).optional(),
  nextGoals: z.array(z.string().min(1)).optional(),
  format: z.enum(['text', 'structured']).default('text'),
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
    agentRole: string,
    priorityKeys: { type: 'array', items: string },
    nextGoals: { type: 'array', items: string },
    format: { type: 'string', enum: ['text', 'structured'] },
  };

  const buildHandoff = async (
    input: z.infer<typeof handoffSchema>,
  ): Promise<StructuredHandoff> => {
    let state: Record<string, unknown> = (await readStateFields(
      input.workspaceId,
      getCurrentUserId(),
      input.workflowId,
      input.keys,
    )) as Record<string, unknown>;

    if (input.agentRole) {
      const role = await getAgentRole(
        input.workspaceId,
        getCurrentUserId(),
        input.agentRole,
      );
      if (!role) throw new Error('AGENT_ROLE_NOT_FOUND');
      state = filterReadableState(state, role.allowedReadKeys);
    }

    const structured = generator.generateStructured(state, {
      maxTokens: input.maxTokens,
      priorityKeys: input.priorityKeys,
      nextGoals: input.nextGoals,
      format: input.format,
    });

    return structured;
  };

  tools.set(
    'handoff_generate',
    defineTool(
      {
        name: 'handoff_generate',
        description:
          'Generate bounded handoff summaries with optional role projection and structured packets',
        inputSchema: {
          type: 'object',
          properties: commonProperties,
          required: ['workspaceId', 'workflowId'],
        },
      },
      handoffSchema,
      async (input) => {
        const structured = await buildHandoff(input);
        if (input.format === 'structured') return structured;
        return {
          summary: structured.summary,
          keysIncluded: structured.keysIncluded,
          tokensEstimate: structured.tokensEstimate,
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
      async (input) => {
        const handoff = await buildHandoff(input);
        return {
          context: input.prefix
            ? `${input.prefix}\n\n${handoff.summary}`
            : handoff.summary,
          keysIncluded: handoff.keysIncluded,
          ...(input.format === 'structured' ? { packet: handoff.packet } : {}),
        };
      },
    ),
  );

  return tools;
}
