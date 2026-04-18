import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AICallEvent, DraftingInput, ProviderConfig } from '../src/types.js';
import { configure, route, stream } from '../src/router.js';
import { createEventEmitter } from '../src/events.js';
import { registerProvider } from '../src/providers/index.js';
import { RouterError } from '../src/errors.js';

function createMockProvider(name: string, response: { content: string; fail?: boolean; error?: RouterError; streamFail?: boolean }) {
  return {
    name,
    execute: vi.fn().mockImplementation(async () => {
      if (response.fail) {
        throw response.error ?? new RouterError('PROVIDER_ERROR', `${name} failed`);
      }
      return {
        content: response.content,
        tokensIn: 100,
        tokensOut: 50,
        model: 'test-model',
        raw: {},
      };
    }),
    stream: vi.fn().mockImplementation(async function* () {
      if (response.streamFail) {
        throw response.error ?? new RouterError('PROVIDER_ERROR', `${name} stream failed`);
      }
      yield response.content;
    }),
  };
}

const draftingTask: DraftingInput = {
  type: 'drafting',
  messages: [{ role: 'user', content: 'Hello' }],
};

const testConfig: ProviderConfig = { apiKey: 'test-key' };

describe('Router', () => {
  beforeEach(() => {
    configure({
      providerConfigs: { anthropic: testConfig, providerA: testConfig, providerB: testConfig },
    });
  });

  afterEach(() => {
    configure({ providerConfigs: {} });
  });

  it('primary succeeds: returns ok result', async () => {
    const mockProvider = createMockProvider('anthropic', { content: 'Success!' });
    registerProvider('anthropic', () => mockProvider);

    const result = await route(draftingTask);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.content).toBe('Success!');
      expect(result.data.type).toBe('drafting');
      expect(result.event.success).toBe(true);
      expect(result.event.tokensIn).toBe(100);
      expect(result.event.tokensOut).toBe(50);
      expect(result.event.costCents).toBeGreaterThan(0);
    }
  });

  it('primary fails, fallback succeeds', async () => {
    const failProvider = createMockProvider('providerA', { content: '', fail: true });
    const successProvider = createMockProvider('providerB', { content: 'Fallback worked!' });

    registerProvider('providerA', () => failProvider);
    registerProvider('providerB', () => successProvider);

    const result = await route(draftingTask, {
      policyOverride: {
        drafting: [
          { provider: 'providerA', modelId: 'model-a' },
          { provider: 'providerB', modelId: 'model-b' },
        ],
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.content).toBe('Fallback worked!');
    }
    expect(failProvider.execute).toHaveBeenCalledOnce();
    expect(successProvider.execute).toHaveBeenCalledOnce();
  });

  it('all providers fail → ALL_FALLBACKS_FAILED', async () => {
    const failA = createMockProvider('providerA', { content: '', fail: true });
    const failB = createMockProvider('providerB', { content: '', fail: true });

    registerProvider('providerA', () => failA);
    registerProvider('providerB', () => failB);

    const result = await route(draftingTask, {
      policyOverride: {
        drafting: [
          { provider: 'providerA', modelId: 'model-a' },
          { provider: 'providerB', modelId: 'model-b' },
        ],
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ALL_FALLBACKS_FAILED');
      expect(result.error.attempts).toHaveLength(2);
    }
  });

  it('invalid task type → INVALID_TASK', async () => {
    const result = await route({ type: 'nonexistent' as any, messages: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_TASK');
    }
  });

  it('empty chain (embedding) → ALL_FALLBACKS_FAILED', async () => {
    const result = await route({ type: 'embedding', input: 'test' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ALL_FALLBACKS_FAILED');
    }
  });

  it('emits events on success', async () => {
    const events: AICallEvent[] = [];
    configure({
      emitter: createEventEmitter((e) => events.push(e)),
      providerConfigs: { anthropic: testConfig },
    });

    const mockProvider = createMockProvider('anthropic', { content: 'Hello' });
    registerProvider('anthropic', () => mockProvider);

    await route(draftingTask);

    expect(events).toHaveLength(1);
    expect(events[0].success).toBe(true);
    expect(events[0].taskType).toBe('drafting');
    expect(events[0].provider).toBe('anthropic');
  });

  it('emits events on failure', async () => {
    const events: AICallEvent[] = [];
    configure({
      emitter: createEventEmitter((e) => events.push(e)),
      providerConfigs: { providerA: testConfig },
    });

    const failProvider = createMockProvider('providerA', { content: '', fail: true });
    registerProvider('providerA', () => failProvider);

    await route(draftingTask, {
      policyOverride: {
        drafting: [{ provider: 'providerA', modelId: 'model-a' }],
      },
    });

    expect(events.length).toBeGreaterThanOrEqual(1);
    const failEvent = events.find((e) => !e.success);
    expect(failEvent).toBeDefined();
    expect(failEvent?.error).toBeDefined();
  });

  it('UNSUPPORTED_TASK stops the chain immediately', async () => {
    const unsupportedProvider = createMockProvider('providerA', {
      content: '',
      fail: true,
      error: new RouterError('UNSUPPORTED_TASK', 'Not supported'),
    });
    const fallbackProvider = createMockProvider('providerB', { content: 'Fallback' });

    registerProvider('providerA', () => unsupportedProvider);
    registerProvider('providerB', () => fallbackProvider);

    const result = await route(draftingTask, {
      policyOverride: {
        drafting: [
          { provider: 'providerA', modelId: 'model-a' },
          { provider: 'providerB', modelId: 'model-b' },
        ],
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNSUPPORTED_TASK');
    }
    expect(fallbackProvider.execute).not.toHaveBeenCalled();
  });

  describe('stream', () => {
    beforeEach(() => {
      configure({
        providerConfigs: { providerA: testConfig, providerB: testConfig },
      });
    });

    it('yields chunks from provider', async () => {
      const mockProvider = createMockProvider('providerA', { content: 'chunk' });
      registerProvider('providerA', () => mockProvider);

      const generator = stream(draftingTask, {
        policyOverride: { drafting: [{ provider: 'providerA', modelId: 'model-a' }] },
      });

      const chunks = [];
      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['chunk']);
    });

    it('falls back on stream failure', async () => {
      const failProvider = createMockProvider('providerA', { content: '', streamFail: true });
      const successProvider = createMockProvider('providerB', { content: 'fallback chunk' });

      registerProvider('providerA', () => failProvider);
      registerProvider('providerB', () => successProvider);

      const generator = stream(draftingTask, {
        policyOverride: {
          drafting: [
            { provider: 'providerA', modelId: 'model-a' },
            { provider: 'providerB', modelId: 'model-b' },
          ],
        },
      });

      const chunks = [];
      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['fallback chunk']);
      expect(failProvider.stream).toHaveBeenCalledOnce();
      expect(successProvider.stream).toHaveBeenCalledOnce();
    });

    it('throws UNSUPPORTED_TASK for embedding', async () => {
      const promise = (async () => {
        for await (const _ of stream({ type: 'embedding', input: 'test' })) {
          // empty
        }
      })();

      await expect(promise).rejects.toMatchObject({ code: 'UNSUPPORTED_TASK' });
    });
  });
});
