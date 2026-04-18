import { RouterError } from '../errors.js';
import type { ModelProvider, ProviderConfig, ProviderResponse, TaskInput } from '../types.js';
import { validateConfig } from './base.js';

const DEEPGRAM_API_URL = 'https://api.deepgram.com/v1/listen';
const DEFAULT_MODEL = 'nova-3';
const DEFAULT_TIMEOUT = 120_000;

export function createDeepgramProvider(): ModelProvider {
  return {
    name: 'deepgram',

    async execute(task: TaskInput, config: ProviderConfig): Promise<ProviderResponse> {
      validateConfig(config);

      if (task.type !== 'voice') {
        throw new RouterError(
          'UNSUPPORTED_TASK',
          `Deepgram only supports "voice" task type, got "${task.type}"`,
        );
      }

      const model = config.modelId ?? DEFAULT_MODEL;
      const timeout = config.timeout ?? DEFAULT_TIMEOUT;
      const baseUrl = config.baseUrl ?? DEEPGRAM_API_URL;
      const url = `${baseUrl}?model=${model}&smart_format=true`;

      let body: BodyInit;
      let contentType = 'audio/wav';

      if (typeof task.audio === 'string') {
        // Base64 or URL. If base64, we need to convert to Blob/Buffer
        // For simplicity in a Node/Edge env, we assume it's a URL if it starts with http,
        // else it's raw binary data or base64. Let's handle URL.
        if (task.audio.startsWith('http')) {
          body = JSON.stringify({ url: task.audio });
          contentType = 'application/json';
        } else {
          throw new RouterError('PROVIDER_ERROR', 'Deepgram string audio must be a valid URL');
        }
      } else {
        body = task.audio; // ArrayBuffer
        if (task.format) {
          contentType = `audio/${task.format}`;
        }
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': contentType,
            Authorization: `Token ${config.apiKey}`,
          },
          body,
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorBody = await response.text();
          if (response.status === 401 || response.status === 403) {
            throw new RouterError(
              'AUTHENTICATION_FAILED',
              `Deepgram authentication failed: ${errorBody}`,
            );
          }
          if (response.status === 429) {
            throw new RouterError('RATE_LIMITED', `Deepgram rate limited: ${errorBody}`);
          }
          throw new RouterError(
            'PROVIDER_ERROR',
            `Deepgram API error ${response.status}: ${errorBody}`,
          );
        }

        const data = await response.json();
        const content = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
        const duration = data.metadata?.duration ?? 0;

        return {
          content,
          tokensIn: duration, // We map duration to tokensIn for cost calculation
          tokensOut: 0,
          model: data.metadata?.model_info?.name ?? model,
          raw: data,
        };
      } catch (error) {
        if (error instanceof RouterError) {
          throw error;
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new RouterError('TIMEOUT', `Deepgram request timed out after ${timeout}ms`);
        }
        throw new RouterError(
          'PROVIDER_ERROR',
          `Deepgram request failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}