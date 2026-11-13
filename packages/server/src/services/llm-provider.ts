/**
 * LLM Provider Abstraction Layer for AI-Powered Handoffs
 *
 * Provides a unified interface for multiple LLM providers (Anthropic, OpenAI, Bedrock)
 * to enable AI-powered handoff summaries with semantic understanding.
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  stop?: string[];
}

export interface LLMResponse {
  content: string;
  model: string;
  tokensUsed?: {
    input: number;
    output: number;
  };
  finishReason?: 'stop' | 'length' | 'content_filter' | 'error';
}

export interface HandoffLLMProvider {
  /**
   * Generate a completion from the LLM
   */
  generate(request: LLMRequest): Promise<LLMResponse>;

  /**
   * Provider name identifier
   */
  readonly name: string;

  /**
   * Default model for this provider
   */
  readonly defaultModel: string;

  /**
   * Whether this provider supports streaming
   */
  readonly supportsStreaming?: boolean;
}

export type ProviderType = 'anthropic' | 'openai' | 'bedrock';

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Factory function to create an LLM provider by type
 */
export function createProvider(
  type: ProviderType,
  config?: ProviderConfig,
): HandoffLLMProvider {
  switch (type) {
    case 'anthropic':
      return new (require('./providers/anthropic-provider.js').AnthropicProvider)(
        config,
      );
    case 'openai':
      return new (require('./providers/openai-provider.js').OpenAIProvider)(
        config,
      );
    case 'bedrock':
      // Bedrock provider can be added later
      throw new Error('Bedrock provider not yet implemented');
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

/**
 * Detect available provider from environment variables
 */
export function detectProvider(): ProviderType {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  throw new Error(
    'No LLM provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY',
  );
}

/**
 * Check if AI handoffs are enabled
 */
export function isAIHandoffEnabled(): boolean {
  return process.env.AI_HANDOFF_ENABLED === 'true';
}

/**
 * Get default AI handoff configuration from environment
 */
export function getDefaultAIConfig(): {
  provider: ProviderType;
  model: string;
  maxTokens: number;
} {
  return {
    provider: detectProvider(),
    model: process.env.AI_HANDOFF_MODEL ?? 'claude-haiku-4-5',
    maxTokens: parseInt(process.env.AI_HANDOFF_MAX_TOKENS ?? '200', 10),
  };
}
