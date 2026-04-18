import { RouterError } from '../errors.js';
import type {
  ContentBlock,
  Message,
  ModelProvider,
  ProviderConfig,
  ProviderResponse,
  TaskInput,
} from '../types.js';
import { validateConfig } from './base.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_TIMEOUT = 60_000;

const SUPPORTED_TASKS = new Set([
  'reasoning',
  'drafting',
  'classification',
  'extraction',
  'vision',
]);

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  source?: {
    type: string;
    media_type?: string;
    data?: string;
    url?: string;
  };
}

function toAnthropicMessages(messages: Message[]): AnthropicMessage[] {
  return messages.map((msg) => {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content };
    }
    return {
      role: msg.role,
      content: msg.content.map((block: ContentBlock) => {
        if (block.type === 'image' && block.source) {
          return {
            type: 'image' as const,
            source: block.source,
          };
        }
        return { type: 'text' as const, text: block.text ?? '' };
      }),
    };
  });
}

function getMessages(task: TaskInput): Message[] {
  if ('messages' in task) {
    return task.messages;
  }
  throw new RouterError('INVALID_TASK', `Task type "${task.type}" does not have messages`);
}

function getSystemPrompt(task: TaskInput): string | undefined {
  if ('systemPrompt' in task) {
    return task.systemPrompt;
  }
  return undefined;
}

export function createAnthropicProvider(): ModelProvider {
  return {
    name: 'anthropic',

    async execute(task: TaskInput, config: ProviderConfig): Promise<ProviderResponse> {
      validateConfig(config);

      if (!SUPPORTED_TASKS.has(task.type)) {
        throw new RouterError(
          'UNSUPPORTED_TASK',
          `Anthropic does not support task type "${task.type}"`,
        );
      }

      const model = config.modelId ?? DEFAULT_MODEL;
      const baseUrl = config.baseUrl ?? ANTHROPIC_API_URL;
      const timeout = config.timeout ?? DEFAULT_TIMEOUT;
      const messages = toAnthropicMessages(getMessages(task));
      const systemPrompt = getSystemPrompt(task);

      const body: Record<string, unknown> = {
        model,
        messages,
        max_tokens: 4096,
      };

      if (systemPrompt) {
        body.system = systemPrompt;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorBody = await response.text();

          if (response.status === 401) {
            throw new RouterError(
              'AUTHENTICATION_FAILED',
              `Anthropic authentication failed: ${errorBody}`,
            );
          }
          if (response.status === 429) {
            throw new RouterError('RATE_LIMITED', `Anthropic rate limited: ${errorBody}`);
          }
          throw new RouterError(
            'PROVIDER_ERROR',
            `Anthropic API error ${response.status}: ${errorBody}`,
          );
        }

        const data = await response.json();
        const content =
          data.content
            ?.filter((block: { type: string }) => block.type === 'text')
            .map((block: { text: string }) => block.text)
            .join('') ?? '';

        return {
          content,
          tokensIn: data.usage?.input_tokens ?? 0,
          tokensOut: data.usage?.output_tokens ?? 0,
          model: data.model ?? model,
          raw: data,
        };
      } catch (error) {
        if (error instanceof RouterError) {
          throw error;
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new RouterError('TIMEOUT', `Anthropic request timed out after ${timeout}ms`);
        }
        throw new RouterError(
          'PROVIDER_ERROR',
          `Anthropic request failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
