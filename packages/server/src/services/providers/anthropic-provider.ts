/**
 * Anthropic LLM Provider for AI-Powered Handoffs
 *
 * Implements the HandoffLLMProvider interface using Anthropic's Messages API.
 * Uses claude-haiku-4-5 as the default model for cost-effective handoff generation.
 */

import type {
  HandoffLLMProvider,
  LLMRequest,
  LLMResponse,
  ProviderConfig,
} from '../llm-provider.js';

export interface AnthropicConfig extends ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
}

export class AnthropicProvider implements HandoffLLMProvider {
  readonly name = 'anthropic';
  readonly defaultModel = 'claude-haiku-4-5';
  readonly supportsStreaming = false;

  private apiKey: string;
  private baseUrl: string;

  constructor(config?: AnthropicConfig) {
    this.apiKey = config?.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
    this.baseUrl = config?.baseUrl ?? 'https://api.anthropic.com';
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const systemMessage = request.messages.find((m) => m.role === 'system');
    const nonSystemMessages = request.messages.filter(
      (m) => m.role !== 'system',
    );

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: request.model || this.defaultModel,
        max_tokens: request.maxTokens ?? 200,
        system: systemMessage?.content,
        messages: nonSystemMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: request.temperature ?? 0.3,
        stop_sequences: request.stop,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string }>;
      model: string;
      usage: { input_tokens: number; output_tokens: number };
      stop_reason?: string;
    };

    const textContent = data.content.find((c) => c.type === 'text');

    return {
      content: textContent?.text ?? '',
      model: data.model,
      tokensUsed: {
        input: data.usage.input_tokens,
        output: data.usage.output_tokens,
      },
      finishReason: (data.stop_reason as LLMResponse['finishReason']) ?? 'stop',
    };
  }
}
