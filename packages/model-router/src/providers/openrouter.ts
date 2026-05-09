// OpenRouter — OpenAI-compatible gateway giving access to 300+ models
// (Claude, GPT, Gemini, DeepSeek, Llama, …) behind a single key.
//
// The wire format is identical to OpenAI's /v1/chat/completions, so we
// reuse the same request/response shape; only differences:
//   - base URL is https://openrouter.ai/api/v1
//   - 'HTTP-Referer' + 'X-Title' headers are recommended (OpenRouter
//     uses them for billing attribution / app analytics — optional).
//
// Model IDs include a vendor prefix, e.g. "anthropic/claude-sonnet-4",
// "openai/gpt-4o", "deepseek/deepseek-r1". The CRM Settings UI lets the
// operator paste a model id directly or fetch the list via the API.

import { z } from 'zod';
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

const OpenRouterChatResponse = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable().optional() }).passthrough() }))
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
    })
    .optional(),
  model: z.string().optional(),
});

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4';
const DEFAULT_TIMEOUT = 60_000;

const SUPPORTED_TASKS = new Set([
  'reasoning',
  'drafting',
  'classification',
  'extraction',
  'vision',
]);

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | OpenAIContentBlock[];
}

interface OpenAIContentBlock {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

function toOpenRouterMessages(messages: Message[], systemPrompt?: string): OpenAIMessage[] {
  const result: OpenAIMessage[] = [];
  if (systemPrompt) result.push({ role: 'system', content: systemPrompt });
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
          return { type: 'image_url', image_url: { url } };
        }
        return { type: 'text', text: block.text ?? '' };
      }),
    });
  }
  return result;
}

function getMessages(task: TaskInput): Message[] {
  if ('messages' in task) return task.messages;
  throw new RouterError('INVALID_TASK', `Task type "${task.type}" does not have messages`);
}

export function createOpenRouterProvider(): ModelProvider {
  return {
    name: 'openrouter',

    async execute(task: TaskInput, config: ProviderConfig): Promise<ProviderResponse> {
      validateConfig(config);

      if (!SUPPORTED_TASKS.has(task.type)) {
        throw new RouterError(
          'UNSUPPORTED_TASK',
          `OpenRouter does not support task type "${task.type}"`,
        );
      }

      const model = config.modelId ?? DEFAULT_MODEL;
      const timeout = config.timeout ?? DEFAULT_TIMEOUT;
      const url = config.baseUrl ?? OPENROUTER_API_URL;
      const systemPrompt = 'systemPrompt' in task ? task.systemPrompt : undefined;

      const body = {
        model,
        messages: toOpenRouterMessages(getMessages(task), systemPrompt),
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      // Optional attribution headers — picked from config.extra so the
      // CRM operator can set them in the credentials extra jsonb.
      const referer = (config.extra as { http_referer?: string } | undefined)?.http_referer
        ?? 'https://crm.imbaproduction.com';
      const appTitle = (config.extra as { x_title?: string } | undefined)?.x_title
        ?? 'imba.crm';

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
            'HTTP-Referer': referer,
            'X-Title': appTitle,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorBody = await response.text();
          if (response.status === 401) {
            throw new RouterError('AUTHENTICATION_FAILED', `OpenRouter auth failed: ${errorBody}`);
          }
          if (response.status === 429) {
            throw new RouterError('RATE_LIMITED', `OpenRouter rate limited: ${errorBody}`);
          }
          throw new RouterError(
            'PROVIDER_ERROR',
            `OpenRouter API error ${response.status}: ${errorBody}`,
          );
        }

        const raw: unknown = await response.json();
        const parsed = OpenRouterChatResponse.safeParse(raw);
        if (!parsed.success) {
          throw new RouterError(
            'PROVIDER_ERROR',
            `OpenRouter chat response shape invalid: ${parsed.error.message}`,
          );
        }
        return {
          content: parsed.data.choices[0]?.message.content ?? '',
          tokensIn: parsed.data.usage?.prompt_tokens ?? 0,
          tokensOut: parsed.data.usage?.completion_tokens ?? 0,
          model: parsed.data.model ?? model,
          raw,
        };
      } catch (error) {
        if (error instanceof RouterError) throw error;
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new RouterError('TIMEOUT', `OpenRouter request timed out after ${timeout}ms`);
        }
        throw new RouterError(
          'PROVIDER_ERROR',
          `OpenRouter request failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
