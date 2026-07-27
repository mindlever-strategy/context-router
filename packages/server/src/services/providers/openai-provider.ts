/**
 * OpenAI LLM Provider for AI-Powered Handoffs
 *
 * Implements the HandoffLLMProvider interface using OpenAI's Chat Completions API.
 * Uses gpt-4o-mini as the default model for cost-effective handoff generation.
 */

import type {
  HandoffLLMProvider,
  LLMRequest,
  LLMResponse,
  ProviderConfig,
} from '../llm-provider.js';

export interface OpenAIConfig extends ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
}

export class OpenAIProvider implements HandoffLLMProvider {
  readonly name = 'openai';
  readonly defaultModel = 'gpt-4o-mini';
  readonly supportsStreaming = false;

  private apiKey: string;
  private baseUrl: string;

  constructor(config?: OpenAIConfig) {
    this.apiKey = config?.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.baseUrl = config?.baseUrl ?? 'https://api.openai.com/v1';
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const systemMessage = request.messages.find(m => m.role === 'system');
    const nonSystemMessages = request.messages.filter(m => m.role !== 'system');

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model || this.defaultModel,
        max_tokens: request.maxTokens ?? 200,
        messages: [
          ...(systemMessage ? [{ role: 'system', content: systemMessage.content }] : []),
          ...nonSystemMessages.map(m => ({ role: m.role, content: m.content })),
        ],
        temperature: request.temperature ?? 0.3,
        stop: request.stop,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as {
      choices: Array<{
        message: { content: string | null };
        finish_reason: string;
      }>;
      model: string;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    const choice = data.choices[0];

    return {
      content: choice?.message.content ?? '',
      model: data.model,
      tokensUsed: {
        input: data.usage.prompt_tokens,
        output: data.usage.completion_tokens,
      },
      finishReason: (choice?.finish_reason as LLMResponse['finishReason']) ?? 'stop',
    };
  }
}
