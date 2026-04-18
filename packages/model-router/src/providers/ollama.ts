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

const DEFAULT_OLLAMA_URL = 'http://localhost:11434/api/chat';
const DEFAULT_EMBEDDING_URL = 'http://localhost:11434/api/embeddings';
const DEFAULT_MODEL = 'qwen-14b';
const DEFAULT_TIMEOUT = 120_000; // Local models might be slower

const SUPPORTED_TASKS = new Set([
  'reasoning',
  'drafting',
  'classification',
  'extraction',
  'vision',
  'embedding',
  'voice', // Whisper might be served locally differently, but keeping standard for now
]);

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[]; // base64 strings
}

function toOllamaMessages(messages: Message[], systemPrompt?: string): OllamaMessage[] {
  const result: OllamaMessage[] = [];
  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt });
  }

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role, content: msg.content });
      continue;
    }

    let textContent = '';
    const images: string[] = [];

    for (const block of msg.content as ContentBlock[]) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'image' && block.source?.data) {
        images.push(block.source.data);
      }
    }

    result.push({
      role: msg.role,
      content: textContent,
      ...(images.length > 0 ? { images } : {}),
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

export function createOllamaProvider(): ModelProvider {
  return {
    name: 'ollama',

    async execute(task: TaskInput, config: ProviderConfig): Promise<ProviderResponse> {
      // Ollama doesn't require an API key by default, but validateConfig does.
      // We might pass a dummy key if it's local.
      if (!config.apiKey && !config.baseUrl) {
         // It's local, we can skip API key validation or provide a dummy.
         config = { ...config, apiKey: config.apiKey || 'local' };
      }
      validateConfig(config);

      if (!SUPPORTED_TASKS.has(task.type)) {
        throw new RouterError(
          'UNSUPPORTED_TASK',
          `Ollama does not support task type "${task.type}"`,
        );
      }

      const model = config.modelId ?? DEFAULT_MODEL;
      const timeout = config.timeout ?? DEFAULT_TIMEOUT;

      let url = config.baseUrl ?? DEFAULT_OLLAMA_URL;
      let body: Record<string, unknown>;

      if (task.type === 'embedding') {
        // Replace /chat with /embeddings if using default
        if (url === DEFAULT_OLLAMA_URL) {
           url = DEFAULT_EMBEDDING_URL;
        }
        body = {
          model,
          prompt: task.input, // Ollama uses prompt for embeddings
        };
      } else {
        const systemPrompt = 'systemPrompt' in task ? task.systemPrompt : undefined;
        body = {
          model,
          messages: toOllamaMessages(getMessages(task), systemPrompt),
          stream: false,
        };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(config.apiKey !== 'local' ? { Authorization: `Bearer ${config.apiKey}` } : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new RouterError(
            'PROVIDER_ERROR',
            `Ollama API error ${response.status}: ${errorBody}`,
          );
        }

        const data = await response.json();

        if (task.type === 'embedding') {
          return {
            content: '',
            embeddings: [data.embedding ?? []],
            tokensIn: 0, // Ollama embedding doesn't return token usage in old API
            tokensOut: 0,
            model: data.model ?? model,
            raw: data,
          };
        }

        return {
          content: data.message?.content ?? '',
          tokensIn: data.prompt_eval_count ?? 0,
          tokensOut: data.eval_count ?? 0,
          model: data.model ?? model,
          raw: data,
        };
      } catch (error) {
        if (error instanceof RouterError) {
          throw error;
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new RouterError('TIMEOUT', `Ollama request timed out after ${timeout}ms`);
        }
        throw new RouterError(
          'PROVIDER_ERROR',
          `Ollama request failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}