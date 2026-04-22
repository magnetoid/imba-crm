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

const GeminiResponse = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(z.object({ text: z.string().optional() }).passthrough())
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().optional(),
      candidatesTokenCount: z.number().optional(),
    })
    .optional(),
});

const DEFAULT_MODEL = 'gemini-flash';
const DEFAULT_TIMEOUT = 60_000;

const SUPPORTED_TASKS = new Set([
  'reasoning',
  'drafting',
  'classification',
  'extraction',
  'vision',
]);

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

function toGeminiContents(messages: Message[]): GeminiContent[] {
  return messages.map((msg) => {
    const role = msg.role === 'assistant' ? 'model' : 'user';

    if (typeof msg.content === 'string') {
      return { role, parts: [{ text: msg.content }] };
    }

    return {
      role,
      parts: msg.content.map((block: ContentBlock) => {
        if (block.type === 'image' && block.source) {
          // Gemini needs base64 without the data:image/jpeg;base64, prefix
          // But our type says data is base64 string.
          return {
            inlineData: {
              mimeType: block.source.media_type ?? 'image/jpeg',
              data: block.source.data ?? '',
            },
          };
        }
        return { text: block.text ?? '' };
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

export function createGoogleProvider(): ModelProvider {
  return {
    name: 'google',

    async execute(task: TaskInput, config: ProviderConfig): Promise<ProviderResponse> {
      validateConfig(config);

      if (!SUPPORTED_TASKS.has(task.type)) {
        throw new RouterError(
          'UNSUPPORTED_TASK',
          `Google does not support task type "${task.type}"`,
        );
      }

      const model = config.modelId ?? DEFAULT_MODEL;
      const timeout = config.timeout ?? DEFAULT_TIMEOUT;
      
      const baseUrl = config.baseUrl ?? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      // Google API expects the key as a query param, but we append it
      const url = baseUrl.includes('?') ? `${baseUrl}&key=${config.apiKey}` : `${baseUrl}?key=${config.apiKey}`;

      const contents = toGeminiContents(getMessages(task));
      const systemPrompt = 'systemPrompt' in task ? task.systemPrompt : undefined;

      const body: Record<string, unknown> = {
        contents,
      };

      if (systemPrompt) {
        body.systemInstruction = {
          parts: [{ text: systemPrompt }],
        };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorBody = await response.text();

          if (response.status === 401 || response.status === 403) {
            throw new RouterError(
              'AUTHENTICATION_FAILED',
              `Google authentication failed: ${errorBody}`,
            );
          }
          if (response.status === 429) {
            throw new RouterError('RATE_LIMITED', `Google rate limited: ${errorBody}`);
          }
          throw new RouterError(
            'PROVIDER_ERROR',
            `Google API error ${response.status}: ${errorBody}`,
          );
        }

        const raw: unknown = await response.json();
        const parsed = GeminiResponse.safeParse(raw);
        if (!parsed.success) {
          throw new RouterError(
            'PROVIDER_ERROR',
            `Google response shape invalid: ${parsed.error.message}`,
          );
        }

        const content =
          parsed.data.candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? '')
            .join('') ?? '';

        return {
          content,
          tokensIn: parsed.data.usageMetadata?.promptTokenCount ?? 0,
          tokensOut: parsed.data.usageMetadata?.candidatesTokenCount ?? 0,
          model,
          raw,
        };
      } catch (error) {
        if (error instanceof RouterError) {
          throw error;
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new RouterError('TIMEOUT', `Google request timed out after ${timeout}ms`);
        }
        throw new RouterError(
          'PROVIDER_ERROR',
          `Google request failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}