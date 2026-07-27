import type { ProvenanceMeta } from './provenance.js';
import { unwrapForHandoff } from './provenance.js';
import { AIHandoffService, type AIHandoffOptions, type AIHandoffResult } from './ai-handoff-service.js';

export type HandoffStyle = 'concise' | 'detailed' | 'technical';

export type HandoffOptions = {
  maxTokens?: number;
  priorityKeys?: string[];
  nextGoals?: string[];
  format?: 'text' | 'structured';
  // AI mode options
  aiEnabled?: boolean;
  aiStyle?: HandoffStyle;
  aiModel?: string;
  includeReasoning?: boolean;
  includeOpenQuestions?: boolean;
};

export type HandoffPacket = {
  facts: Record<string, unknown>;
  decisions: string[];
  openQuestions: string[];
  nextGoals: string[];
};

export type StructuredHandoff = {
  packet: HandoffPacket;
  summary: string;
  keysIncluded: string[];
  tokensEstimate: number;
  aiEnabled?: boolean;
};

export class HandoffGenerator {
  private aiService?: AIHandoffService;

  constructor() {
    // AI service is lazily initialized
  }

  private getAIService(): AIHandoffService {
    if (!this.aiService) {
      this.aiService = new AIHandoffService();
    }
    return this.aiService;
  }

  generate(
    state: Record<string, unknown>,
    options: HandoffOptions = {},
  ): string {
    // For synchronous call, use rule-based only
    if (!options.aiEnabled) {
      return this.generateStructuredRuleBased(state, options).summary;
    }
    // For AI-enabled, return a placeholder (async operation)
    // Use generateStructuredAsync for AI-powered handoffs
    return this.generateStructuredRuleBased(state, options).summary;
  }

  /**
   * Async version of generate that supports AI mode
   */
  async generateAsync(
    state: Record<string, unknown>,
    options: HandoffOptions = {},
  ): Promise<string> {
    const structured = await this.generateStructured(state, options);
    return structured.summary;
  }

  /**
   * Generate a structured handoff (synchronous, rule-based)
   */
  generateStructured(
    state: Record<string, unknown>,
    options: HandoffOptions = {},
  ): StructuredHandoff {
    // Always use rule-based for synchronous calls
    return this.generateStructuredRuleBased(state, options);
  }

  /**
   * Generate a structured handoff with optional AI enhancement (async)
   */
  async generateStructuredAI(
    state: Record<string, unknown>,
    options: HandoffOptions = {},
  ): Promise<StructuredHandoff> {
    // Use AI generation if enabled
    if (options.aiEnabled) {
      try {
        const aiService = this.getAIService();
        const result = await aiService.generate(state, {
          enabled: true,
          style: options.aiStyle ?? 'concise',
          model: options.aiModel,
          includeReasoning: options.includeReasoning ?? true,
          includeOpenQuestions: options.includeOpenQuestions ?? true,
          maxTokens: options.maxTokens,
        });

        return {
          packet: result.packet,
          summary: result.summary,
          keysIncluded: Object.keys(state),
          tokensEstimate: result.metadata.tokensUsed,
          aiEnabled: true,
        };
      } catch (error) {
        console.error('AI handoff failed, falling back to rule-based:', error);
        // Fall through to rule-based generation
      }
    }

    // Rule-based generation
    return this.generateStructuredRuleBased(state, options);
  }

  /**
   * Synchronous rule-based handoff generation
   */
  private generateStructuredRuleBased(
    state: Record<string, unknown>,
    options: HandoffOptions,
  ): StructuredHandoff {
    const maxTokens = options.maxTokens ?? 200;
    const priorityKeys = options.priorityKeys ?? [];
    const normalizedState = this.normalizeState(state);
    const orderedEntries = this.orderEntries(normalizedState, priorityKeys);
    const parts: string[] = [];

    for (const [key, value] of orderedEntries) {
      if (value === undefined || value === null) continue;
      const formattedKey = this.formatKey(key);
      const formattedValue = this.formatValue(value, key);
      if (formattedKey && formattedValue) {
        parts.push(`${formattedKey}: ${formattedValue}`);
      }
    }

    let summary = parts.join(', ');
    const maxChars = maxTokens * 4;
    if (summary.length > maxChars) {
      summary = this.truncateWithPriority(
        orderedEntries,
        priorityKeys,
        maxChars,
      );
    }

    const packet: HandoffPacket = {
      facts: Object.fromEntries(orderedEntries),
      decisions: this.extractDecisions(normalizedState),
      openQuestions: [],
      nextGoals: options.nextGoals ?? [],
    };

    return {
      packet,
      summary,
      keysIncluded: orderedEntries.map(([key]) => key),
      tokensEstimate: Math.ceil(summary.length / 4),
      aiEnabled: false,
    };
  }

  private normalizeState(
    state: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(state).map(([key, value]) => [
        key,
        unwrapForHandoff(value),
      ]),
    );
  }

  private orderEntries(
    state: Record<string, unknown>,
    priorityKeys: string[],
  ): Array<[string, unknown]> {
    const entries = Object.entries(state);
    if (priorityKeys.length === 0) return entries;

    const priority = new Set(priorityKeys);
    return [
      ...entries.filter(([key]) => priority.has(key)),
      ...entries.filter(([key]) => !priority.has(key)),
    ];
  }

  private truncateWithPriority(
    entries: Array<[string, unknown]>,
    priorityKeys: string[],
    maxChars: number,
  ): string {
    const priority = new Set(priorityKeys);
    const priorityParts: string[] = [];
    const regularParts: string[] = [];

    for (const [key, value] of entries) {
      const part = `${this.formatKey(key)}: ${this.formatValue(value, key)}`;
      if (priority.has(key)) priorityParts.push(part);
      else regularParts.push(part);
    }

    let summary = priorityParts.join(', ');
    for (const part of regularParts) {
      const candidate = summary.length === 0 ? part : `${summary}, ${part}`;
      if (candidate.length <= maxChars) summary = candidate;
      else break;
    }

    if (summary.length > maxChars) {
      summary = summary.substring(0, maxChars - 3) + '...';
    }
    return summary;
  }

  private extractDecisions(state: Record<string, unknown>): string[] {
    const decisions: string[] = [];
    for (const [key, value] of Object.entries(state)) {
      if (
        key.toLowerCase().includes('status') &&
        typeof value === 'string' &&
        value.length > 0
      ) {
        decisions.push(`${this.formatKey(key)}: ${value}`);
      }
    }
    return decisions;
  }

  formatKey(key: string): string {
    const words = key
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(' ')
      .filter((w) => w.length > 0);

    if (words.length === 0) return '';
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
    return words.join(' ');
  }

  formatValue(value: unknown, key?: string): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      return this.truncate(value);
    }

    if (typeof value === 'number') {
      return value.toString();
    }

    if (typeof value === 'boolean') {
      return value ? 'yes' : 'no';
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return 'empty';
      if (value.every((item) => typeof item === 'string')) {
        return value.slice(0, 3).join(', ') + (value.length > 3 ? '...' : '');
      }
      return `[${value.length} items]`;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) return '{}';
      const formatted = entries
        .slice(0, 2)
        .map(([k, v]) => `${this.formatKey(k)}: ${this.formatValue(v)}`)
        .join(', ');
      return `{${formatted}${entries.length > 2 ? '...' : ''}}`;
    }

    return String(value);
  }

  private truncate(str: string, maxLength: number = 50): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }
}
