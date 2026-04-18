import { RouterError } from '../errors.js';
import type { ModelProvider, ProviderConfig, ProviderResponse, TaskInput } from '../types.js';
import { validateConfig } from './base.js';

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';
const DEFAULT_MODEL = 'sonar-pro';
const DEFAULT_TIMEOUT = 60_000;

export function createPerplexityProvider(): ModelProvider {
  return {
    name: 'perplexity',

    async execute(task: TaskInput, config: ProviderConfig): Promise<ProviderResponse> {
      validateConfig(config);

      if (task.type !== 'research') {
        throw new RouterError(
          'UNSUPPORTED_TASK',
          `Perplexity only supports "research" task type, got "${task.type}"`,
        );
      }

      const model = config.modelId ?? DEFAULT_MODEL;
      const timeout = config.timeout ?? DEFAULT_TIMEOUT;
      const url = config.baseUrl ?? PERPLEXITY_API_URL;

      const messages = [];
      if (task.systemPrompt) {
        messages.push({ role: 'system', content: task.systemPrompt });
      }
      messages.push({ role: 'user', content: task.query });

      const body = {
        model,
        messages,
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorBody = await response.text();
          if (response.status === 401) {
            throw new RouterError(
              'AUTHENTICATION_FAILED',
              `Perplexity authentication failed: ${errorBody}`,
            );
          }
          if (response.status === 429) {
            throw new RouterError('RATE_LIMITED', `Perplexity rate limited: ${errorBody}`);
          }
          throw new RouterError(
            'PROVIDER_ERROR',
            `Perplexity API error ${response.status}: ${errorBody}`,
          );
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content ?? '';

        return {
          content,
          tokensIn: data.usage?.prompt_tokens ?? 0,
          tokensOut: data.usage?.completion_tokens ?? 0,
          model: data.model ?? model,
          raw: data,
        };
      } catch (error) {
        if (error instanceof RouterError) {
          throw error;
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new RouterError('TIMEOUT', `Perplexity request timed out after ${timeout}ms`);
        }
        throw new RouterError(
          'PROVIDER_ERROR',
          `Perplexity request failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}