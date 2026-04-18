import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterError } from '../../src/errors.js';
import { createAnthropicProvider } from '../../src/providers/anthropic.js';
import type { DraftingInput, ProviderConfig, VoiceInput } from '../../src/types.js';

const mockConfig: ProviderConfig = {
  apiKey: 'test-key-123',
  modelId: 'claude-sonnet-4-6',
};

const draftingTask: DraftingInput = {
  type: 'drafting',
  messages: [{ role: 'user', content: 'Write a haiku' }],
};

function mockFetchResponse(data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

describe('Anthropic Provider', () => {
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
      content: [{ type: 'text', text: 'A beautiful haiku' }],
      usage: { input_tokens: 10, output_tokens: 5 },
      model: 'claude-sonnet-4-6',
    };
    globalThis.fetch = mockFetchResponse(apiResponse);

    const provider = createAnthropicProvider();
    const result = await provider.execute(draftingTask, mockConfig);

    expect(result.content).toBe('A beautiful haiku');
    expect(result.tokensIn).toBe(10);
    expect(result.tokensOut).toBe(5);
    expect(result.model).toBe('claude-sonnet-4-6');
    expect(result.raw).toEqual(apiResponse);
  });

  it('sends correct headers and body', async () => {
    const fetchMock = mockFetchResponse({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
      model: 'claude-sonnet-4-6',
    });
    globalThis.fetch = fetchMock;

    const provider = createAnthropicProvider();
    await provider.execute(draftingTask, mockConfig);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('test-key-123');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');

    const body = JSON.parse(init.body);
    expect(body.model).toBe('claude-sonnet-4-6');
    expect(body.messages).toEqual([{ role: 'user', content: 'Write a haiku' }]);
  });

  it('throws AUTHENTICATION_FAILED on 401', async () => {
    globalThis.fetch = mockFetchResponse({ error: 'invalid_api_key' }, 401);

    const provider = createAnthropicProvider();
    await expect(provider.execute(draftingTask, mockConfig)).rejects.toThrow(RouterError);
    await expect(provider.execute(draftingTask, mockConfig)).rejects.toMatchObject({
      code: 'AUTHENTICATION_FAILED',
    });
  });

  it('throws RATE_LIMITED on 429', async () => {
    globalThis.fetch = mockFetchResponse({ error: 'rate_limited' }, 429);

    const provider = createAnthropicProvider();
    await expect(provider.execute(draftingTask, mockConfig)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('throws PROVIDER_ERROR on other HTTP errors', async () => {
    globalThis.fetch = mockFetchResponse({ error: 'server_error' }, 500);

    const provider = createAnthropicProvider();
    await expect(provider.execute(draftingTask, mockConfig)).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
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

    const provider = createAnthropicProvider();
    await expect(
      provider.execute(draftingTask, { ...mockConfig, timeout: 50 }),
    ).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('throws PROVIDER_ERROR on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    const provider = createAnthropicProvider();
    await expect(provider.execute(draftingTask, mockConfig)).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
    });
  });

  it('throws UNSUPPORTED_TASK for voice', async () => {
    const voiceTask: VoiceInput = {
      type: 'voice',
      audio: new ArrayBuffer(100),
    };

    const provider = createAnthropicProvider();
    await expect(provider.execute(voiceTask, mockConfig)).rejects.toMatchObject({
      code: 'UNSUPPORTED_TASK',
    });
  });

  it('throws UNSUPPORTED_TASK for embedding', async () => {
    const provider = createAnthropicProvider();
    await expect(
      provider.execute({ type: 'embedding', input: 'test' }, mockConfig),
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED_TASK',
    });
  });

  it('throws AUTHENTICATION_FAILED when no API key', async () => {
    const provider = createAnthropicProvider();
    await expect(
      provider.execute(draftingTask, { apiKey: '' }),
    ).rejects.toMatchObject({
      code: 'AUTHENTICATION_FAILED',
    });
  });
});
