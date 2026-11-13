/**
 * AI Handoff Service
 *
 * Provides AI-powered handoff summary generation using LLM providers.
 * Falls back to rule-based generation when AI is unavailable.
 */

import type {
  HandoffLLMProvider,
  LLMResponse,
  ProviderType,
} from './llm-provider.js';
import {
  createProvider,
  detectProvider,
  isAIHandoffEnabled,
} from './llm-provider.js';
import { AnthropicProvider } from './providers/anthropic-provider.js';
import { OpenAIProvider } from './providers/openai-provider.js';
import {
  SYSTEM_PROMPT,
  buildHandoffPrompt,
  type HandoffStyle,
} from './ai-handoff-prompts.js';
import {
  HandoffGenerator,
  type StructuredHandoff,
  type HandoffPacket,
} from './handoff-generator.js';
import { HandoffCacheService } from './handoff-cache.js';

export interface AIHandoffOptions {
  enabled?: boolean;
  provider?: ProviderType;
  model?: string;
  style?: HandoffStyle;
  includeReasoning?: boolean;
  includeOpenQuestions?: boolean;
  maxTokens?: number;
  workflowDescription?: string;
  agentRole?: string;
  context?: string;
}

export interface AIHandoffResult {
  summary: string;
  packet: HandoffPacket;
  metadata: {
    model: string;
    tokensUsed: number;
    durationMs: number;
    fromCache: boolean;
  };
}

export interface AIHandoffServiceConfig {
  provider?: ProviderType;
  apiKey?: string;
  model?: string;
}

export class AIHandoffService {
  private provider: HandoffLLMProvider;
  private fallbackGenerator: HandoffGenerator;
  private cache: HandoffCacheService;

  private defaultProvider: ProviderType;
  private defaultModel: string;
  private defaultStyle: HandoffStyle;

  constructor(config?: AIHandoffServiceConfig) {
    this.defaultProvider = config?.provider ?? this.detectProvider();
    this.defaultModel = config?.model ?? this.getDefaultModel();
    this.defaultStyle = 'concise';

    this.provider = this.createProvider(config?.provider, config?.apiKey);
    this.fallbackGenerator = new HandoffGenerator();
    this.cache = new HandoffCacheService();
  }

  private detectProvider(): ProviderType {
    try {
      return detectProvider();
    } catch {
      // Default to anthropic if no API key is set
      return 'anthropic';
    }
  }

  private getDefaultModel(): string {
    if (this.defaultProvider === 'anthropic') {
      return process.env.AI_HANDOFF_MODEL ?? 'claude-haiku-4-5';
    } else if (this.defaultProvider === 'openai') {
      return process.env.AI_HANDOFF_OPENAI_MODEL ?? 'gpt-4o-mini';
    }
    return 'claude-haiku-4-5';
  }

  private createProvider(
    type?: ProviderType,
    apiKey?: string,
  ): HandoffLLMProvider {
    const providerType = type ?? this.defaultProvider;

    switch (providerType) {
      case 'anthropic':
        return new AnthropicProvider({ apiKey });
      case 'openai':
        return new OpenAIProvider({ apiKey });
      default:
        return new AnthropicProvider({ apiKey });
    }
  }

  /**
   * Generate an AI-powered handoff summary
   */
  async generate(
    state: Record<string, unknown>,
    options: AIHandoffOptions = {},
  ): Promise<AIHandoffResult> {
    const enabled = options.enabled ?? isAIHandoffEnabled();

    if (!enabled) {
      // Use rule-based fallback
      return this.generateRuleBased(state, options);
    }

    // Check cache first
    const cacheKey = this.cache.computeKey(state, {
      style: options.style ?? this.defaultStyle,
      includeReasoning: options.includeReasoning ?? true,
      includeOpenQuestions: options.includeOpenQuestions ?? true,
      maxTokens: options.maxTokens ?? 200,
    });

    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        metadata: { ...cached.metadata, fromCache: true },
      };
    }

    // Generate with LLM
    const startTime = Date.now();
    const model = options.model ?? this.defaultModel;
    const style = options.style ?? this.defaultStyle;
    const maxTokens = options.maxTokens ?? 200;

    try {
      const response = await this.callLLM(state, {
        ...options,
        model,
        style,
        maxTokens,
      });

      const result = this.buildResult(response, state, model, startTime);

      // Cache the result (fire and forget)
      this.cache.set(cacheKey, result).catch(() => {});

      return result;
    } catch (error) {
      console.error(
        'AI handoff generation failed, falling back to rule-based:',
        error,
      );
      return await this.generateRuleBased(state, options, startTime);
    }
  }

  /**
   * Generate a rule-based handoff as fallback
   */
  private async generateRuleBased(
    state: Record<string, unknown>,
    options: AIHandoffOptions,
    startTime?: number,
  ): Promise<AIHandoffResult> {
    const structured = await this.fallbackGenerator.generateStructured(state, {
      maxTokens: options.maxTokens ?? 200,
      priorityKeys: options.context
        ? this.extractPriorityKeys(options.context)
        : undefined,
    });

    return {
      summary: structured.summary,
      packet: structured.packet,
      metadata: {
        model: 'rule-based',
        tokensUsed: Math.ceil(structured.summary.length / 4),
        durationMs: startTime ? Date.now() - startTime : 0,
        fromCache: false,
      },
    };
  }

  /**
   * Extract priority keys from context hint
   */
  private extractPriorityKeys(context?: string): string[] {
    if (!context) return [];

    // Simple heuristic: extract quoted strings or key-like patterns
    const matches = context.matchAll(/(["'])([a-z_]+)\1/g);
    const keys: string[] = [];
    for (const match of matches) {
      keys.push(match[2]);
    }
    return keys;
  }

  /**
   * Call the LLM provider
   */
  private async callLLM(
    state: Record<string, unknown>,
    options: {
      model: string;
      style: HandoffStyle;
      maxTokens: number;
      includeReasoning?: boolean;
      includeOpenQuestions?: boolean;
      workflowDescription?: string;
      agentRole?: string;
    },
  ): Promise<LLMResponse> {
    const systemPrompt = SYSTEM_PROMPT.replace(
      '{maxTokens}',
      String(options.maxTokens),
    );
    const userPrompt = buildHandoffPrompt(state, {
      style: options.style,
      includeOpenQuestions: options.includeOpenQuestions ?? true,
      includeReasoning: options.includeReasoning ?? true,
      maxTokens: options.maxTokens,
      workflowDescription: options.workflowDescription,
      agentRole: options.agentRole,
    });

    return this.provider.generate({
      model: options.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      maxTokens: options.maxTokens,
      temperature: 0.3, // Low temperature for consistency
    });
  }

  /**
   * Build result from LLM response
   */
  private buildResult(
    response: LLMResponse,
    state: Record<string, unknown>,
    model: string,
    startTime: number,
  ): AIHandoffResult {
    const packet = this.parseStructuredPacket(response.content, state);

    return {
      summary: this.extractSummary(response.content),
      packet,
      metadata: {
        model: response.model ?? model,
        tokensUsed:
          (response.tokensUsed?.input ?? 0) +
          (response.tokensUsed?.output ?? 0),
        durationMs: Date.now() - startTime,
        fromCache: false,
      },
    };
  }

  /**
   * Extract the summary section from LLM response
   */
  private extractSummary(content: string): string {
    const match = content.match(
      /\*\*Summary:\*\*\s*\n?([\s\S]*?)(?=\*\*Key Facts:|$)/i,
    );
    if (match) {
      return match[1].trim();
    }
    return content.split('\n')[0]?.trim() ?? content;
  }

  /**
   * Parse structured packet from LLM response
   */
  private parseStructuredPacket(
    content: string,
    state: Record<string, unknown>,
  ): HandoffPacket {
    const facts: Record<string, unknown> = { ...state };
    const decisions: string[] = [];
    const openQuestions: string[] = [];
    const nextGoals: string[] = [];

    // Parse Key Facts
    const factsMatch = content.match(
      /\*\*Key Facts:\*\*\s*\n([\s\S]*?)(?=\*\*|$)/i,
    );
    if (factsMatch) {
      const factsText = factsMatch[1];
      const factMatches = factsText.matchAll(/^- (.+)/gm);
      for (const match of factMatches) {
        decisions.push(match[1]);
      }
    }

    // Parse Open Questions
    const questionsMatch = content.match(
      /\*\*Open Questions:\*\*\s*\n([\s\S]*?)(?=\*\*|$)/i,
    );
    if (questionsMatch && !questionsMatch[1].includes('None identified')) {
      const questionsText = questionsMatch[1];
      const questionMatches = questionsText.matchAll(/^- (.+)/gm);
      for (const match of questionMatches) {
        openQuestions.push(match[1]);
      }
    }

    // Parse Next Steps
    const nextStepsMatch = content.match(
      /\*\*Next Steps:\*\*\s*\n([\s\S]*?)$/i,
    );
    if (nextStepsMatch) {
      const stepsText = nextStepsMatch[1];
      const stepMatches = stepsText.matchAll(/^- (.+)/gm);
      for (const match of stepMatches) {
        nextGoals.push(match[1]);
      }
    }

    return { facts, decisions, openQuestions, nextGoals };
  }
}
