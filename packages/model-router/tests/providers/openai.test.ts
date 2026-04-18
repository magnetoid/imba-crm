import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterError } from '../../src/errors.js';
import { createOpenAIProvider } from '../../src/providers/openai.js';
import type { DraftingInput, EmbeddingInput, ProviderConfig, VoiceInput } from '../../src/types.js';

const mockConfig: ProviderConfig = {
  apiKey: 'test-key-123',
  modelId: 'gpt-5-mini',
};

const draftingTask: DraftingInput = {
  type: 'drafting',
  messages: [{ role: 'user', content: 'Write a haiku' }],
  systemPrompt: 'You are a poet',
};

const embeddingTask: EmbeddingInput = {
  type: 'embedding',
  input: 'hello world',
};

function mockFetchResponse(data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

describe('OpenAI Provider', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('happy path: returns parsed response', async () => {
    const apiResponse = {
      choices: [{ message: { content: 'A beautiful haiku' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
      model: 'gpt-5-mini',
    };
    globalThis.fetch = mockFetchResponse(apiResponse);

    const provider = createOpenAIProvider();
    const result = await provider.execute(draftingTask, mockConfig);

    expect(result.content).toBe('A beautiful haiku');
    expect(result.tokensIn).toBe(10);
    expect(result.tokensOut).toBe(5);
    expect(result.model).toBe('gpt-5-mini');
    expect(result.raw).toEqual(apiResponse);
  });

  it('happy path: embedding task', async () => {
    const apiResponse = {
      data: [{ embedding: [0.1, 0.2, 0.3] }],
      usage: { prompt_tokens: 4 },
      model: 'text-embedding-3-large',
    };
    globalThis.fetch = mockFetchResponse(apiResponse);

    const provider = createOpenAIProvider();
    const result = await provider.execute(embeddingTask, { ...mockConfig, modelId: 'text-embedding-3-large' });

    expect(result.content).toBe('');
    expect(result.embeddings).toEqual([[0.1, 0.2, 0.3]]);
    expect(result.tokensIn).toBe(4);
    expect(result.tokensOut).toBe(0);
    expect(result.model).toBe('text-embedding-3-large');
  });

  it('sends correct headers and body', async () => {
    const fetchMock = mockFetchResponse({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
      model: 'gpt-5-mini',
    });
    globalThis.fetch = fetchMock;

    const provider = createOpenAIProvider();
    await provider.execute(draftingTask, mockConfig);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers['Authorization']).toBe('Bearer test-key-123');

    const body = JSON.parse(init.body);
    expect(body.model).toBe('gpt-5-mini');
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are a poet' },
      { role: 'user', content: 'Write a haiku' },
    ]);
  });

  it('throws AUTHENTICATION_FAILED on 401', async () => {
    globalThis.fetch = mockFetchResponse({ error: 'invalid_api_key' }, 401);

    const provider = createOpenAIProvider();
    await expect(provider.execute(draftingTask, mockConfig)).rejects.toMatchObject({
      code: 'AUTHENTICATION_FAILED',
    });
  });

  it('throws RATE_LIMITED on 429', async () => {
    globalThis.fetch = mockFetchResponse({ error: 'rate_limited' }, 429);

    const provider = createOpenAIProvider();
    await expect(provider.execute(draftingTask, mockConfig)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('throws TIMEOUT on abort', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return new Promise((_, reject) => {
        setTimeout(() => {
          const err = new DOMException('The operation was aborted', 'AbortError');
          reject(err);
        }, 100);
      });
    });

    const provider = createOpenAIProvider();
    await expect(
      provider.execute(draftingTask, { ...mockConfig, timeout: 50 }),
    ).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('throws UNSUPPORTED_TASK for voice', async () => {
    const voiceTask: VoiceInput = {
      type: 'voice',
      audio: new ArrayBuffer(100),
    };

    const provider = createOpenAIProvider();
    await expect(provider.execute(voiceTask, mockConfig)).rejects.toMatchObject({
      code: 'UNSUPPORTED_TASK',
    });
  });
});