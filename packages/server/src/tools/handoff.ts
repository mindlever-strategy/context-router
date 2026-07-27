import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { readStateFields, getAgentRole } from '../db/queries.js';
import { filterReadableState } from '../services/agent-role.js';
import {
  HandoffGenerator,
  type StructuredHandoff,
  type HandoffStyle,
} from '../services/handoff-generator.js';
import { AIHandoffService } from '../services/ai-handoff-service.js';
import { journaledHandoffGenerate } from '../services/journal-hooks.js';
import { defineTool, string, uuid, type ToolRegistry } from './tool-kit.js';

const generator = new HandoffGenerator();
const aiHandoffService = new AIHandoffService();

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

// Schema for AI handoff tool
const aiHandoffSchema = z.object({
  workspaceId: z.string().uuid(),
  workflowId: z.string().uuid(),
  keys: z.array(z.string().min(1)).optional(),
  priorityKeys: z.array(z.string().min(1)).optional(),
  style: z.enum(['concise', 'detailed', 'technical']).default('concise'),
  model: z.string().optional(),
  includeReasoning: z.boolean().default(true),
  includeOpenQuestions: z.boolean().default(true),
  maxTokens: z.number().int().min(50).max(1000).default(200),
  context: z.string().max(1000).optional(),
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

    const structured = await generator.generateStructured(state, {
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

        // Journal the handoff generation (fire and forget)
        journaledHandoffGenerate(input.workspaceId, input.workflowId, {
          summaryLength: structured.summary.length,
          keysIncluded: structured.keysIncluded,
          tokensEstimate: structured.tokensEstimate,
          format: input.format,
        }, { source: 'handoff_generate' }).catch(() => {});

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

  // AI-powered handoff tool
  tools.set(
    'handoff_generate_ai',
    defineTool(
      {
        name: 'handoff_generate_ai',
        description: 'Generate an AI-powered handoff summary with semantic understanding, reasoning, and open questions',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: uuid,
            workflowId: uuid,
            keys: { type: 'array', items: string },
            priorityKeys: { type: 'array', items: string },
            style: { type: 'string', enum: ['concise', 'detailed', 'technical'], default: 'concise' },
            model: string,
            includeReasoning: { type: 'boolean', default: true },
            includeOpenQuestions: { type: 'boolean', default: true },
            maxTokens: { type: 'integer', minimum: 50, maximum: 1000, default: 200 },
            context: string,
          },
          required: ['workspaceId', 'workflowId'],
        },
      },
      aiHandoffSchema,
      async (input) => {
        // Read state fields
        let state: Record<string, unknown> = (await readStateFields(
          input.workspaceId,
          getCurrentUserId(),
          input.workflowId,
          input.keys,
        )) as Record<string, unknown>;

        // Order by priority if specified
        if (input.priorityKeys?.length) {
          const ordered: Record<string, unknown> = {};
          for (const key of input.priorityKeys) {
            if (state[key] !== undefined) {
              ordered[key] = state[key];
            }
          }
          for (const key of Object.keys(state)) {
            if (!input.priorityKeys.includes(key)) {
              ordered[key] = state[key];
            }
          }
          state = ordered;
        }

        // Generate AI handoff
        const result = await aiHandoffService.generate(state, {
          enabled: true,
          style: input.style as HandoffStyle,
          model: input.model,
          includeReasoning: input.includeReasoning,
          includeOpenQuestions: input.includeOpenQuestions,
          maxTokens: input.maxTokens,
          context: input.context,
        });

        // Journal the handoff generation (fire and forget)
        journaledHandoffGenerate(input.workspaceId, input.workflowId, {
          summaryLength: result.summary.length,
          keysIncluded: Object.keys(state),
          tokensEstimate: result.metadata.tokensUsed,
          format: 'ai',
          aiMetadata: {
            model: result.metadata.model,
            durationMs: result.metadata.durationMs,
            fromCache: result.metadata.fromCache,
          },
        }, { source: 'handoff_generate_ai' }).catch(() => {});

        return {
          summary: result.summary,
          packet: result.packet,
          keysIncluded: Object.keys(state),
          metadata: result.metadata,
        };
      },
    ),
  );

  return tools;
}
