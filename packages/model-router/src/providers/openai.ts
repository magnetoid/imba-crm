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

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_EMBEDDING_URL = 'https://api.openai.com/v1/embeddings';
const DEFAULT_MODEL = 'gpt-5-mini';
const DEFAULT_TIMEOUT = 60_000;

const SUPPORTED_TASKS = new Set([
  'reasoning',
  'drafting',
  'classification',
  'extraction',
  'vision',
  'embedding',
]);

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | OpenAIContentBlock[];
}

interface OpenAIContentBlock {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
  };
}

function toOpenAIMessages(messages: Message[], systemPrompt?: string): OpenAIMessage[] {
  const result: OpenAIMessage[] = [];
  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt });
  }

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role, content: msg.content });
      continue;
    }

    result.push({
      role: msg.role,
      content: msg.content.map((block: ContentBlock) => {
        if (block.type === 'image' && block.source) {
          const url =
            block.source.type === 'base64'
              ? `data:${block.source.media_type ?? 'image/jpeg'};base64,${block.source.data}`
              : block.source.url ?? '';
          return {
            type: 'image_url',
            image_url: { url },
          };
        }
        return { type: 'text', text: block.text ?? '' };
      }),
    });
  }

  return result;
}

function getMessages(task: TaskInput): Message[] {
  if ('messages' in task) {
    return task.messages;
  }
  throw new RouterError('INVALID_TASK', `Task type "${task.type}" does not have messages`);
}

export function createOpenAIProvider(): ModelProvider {
  return {
    name: 'openai',

    async execute(task: TaskInput, config: ProviderConfig): Promise<ProviderResponse> {
      validateConfig(config);

      if (!SUPPORTED_TASKS.has(task.type)) {
        throw new RouterError(
          'UNSUPPORTED_TASK',
          `OpenAI does not support task type "${task.type}"`,
        );
      }

      const model = config.modelId ?? DEFAULT_MODEL;
      const timeout = config.timeout ?? DEFAULT_TIMEOUT;

      let url = config.baseUrl ?? OPENAI_API_URL;
      let body: Record<string, unknown>;

      if (task.type === 'embedding') {
        url = config.baseUrl ?? OPENAI_EMBEDDING_URL;
        body = {
          model,
          input: task.input,
        };
      } else {
        const systemPrompt = 'systemPrompt' in task ? task.systemPrompt : undefined;
        body = {
          model,
          messages: toOpenAIMessages(getMessages(task), systemPrompt),
        };
      }

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
              `OpenAI authentication failed: ${errorBody}`,
            );
          }
          if (response.status === 429) {
            throw new RouterError('RATE_LIMITED', `OpenAI rate limited: ${errorBody}`);
          }
          throw new RouterError(
            'PROVIDER_ERROR',
            `OpenAI API error ${response.status}: ${errorBody}`,
          );
        }

        const data = await response.json();

        if (task.type === 'embedding') {
          return {
            content: '',
            embeddings: data.data?.map((d: any) => d.embedding) ?? [],
            tokensIn: data.usage?.prompt_tokens ?? 0,
            tokensOut: 0,
            model: data.model ?? model,
            raw: data,
          };
        }

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
          throw new RouterError('TIMEOUT', `OpenAI request timed out after ${timeout}ms`);
        }
        throw new RouterError(
          'PROVIDER_ERROR',
          `OpenAI request failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
