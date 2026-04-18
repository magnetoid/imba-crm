import { describe, expect, it } from 'vitest';
import { defaultPolicy, resolvePolicy } from '../src/policies/index.js';
import type { Policy, TaskType } from '../src/types.js';

describe('resolvePolicy', () => {
  it('returns anthropic chain for reasoning', () => {
    const chain = resolvePolicy('reasoning');
    expect(chain).toEqual([{ provider: 'anthropic', modelId: 'claude-opus-4-7' }]);
  });

  it('returns anthropic chain for drafting', () => {
    const chain = resolvePolicy('drafting');
    expect(chain).toEqual([{ provider: 'anthropic', modelId: 'claude-sonnet-4-6' }]);
  });

  it('returns anthropic chain for classification', () => {
    const chain = resolvePolicy('classification');
    expect(chain).toEqual([{ provider: 'anthropic', modelId: 'claude-haiku-4-5' }]);
  });

  it('returns anthropic chain for extraction', () => {
    const chain = resolvePolicy('extraction');
    expect(chain).toEqual([{ provider: 'anthropic', modelId: 'claude-sonnet-4-6' }]);
  });

  it('returns anthropic chain for vision', () => {
    const chain = resolvePolicy('vision');
    expect(chain).toEqual([{ provider: 'anthropic', modelId: 'claude-sonnet-4-6' }]);
  });

  it('returns empty chain for embedding', () => {
    expect(resolvePolicy('embedding')).toEqual([]);
  });

  it('returns empty chain for voice', () => {
    expect(resolvePolicy('voice')).toEqual([]);
  });

  it('returns empty chain for research', () => {
    expect(resolvePolicy('research')).toEqual([]);
  });

  it('override replaces the default chain', () => {
    const override: Partial<Policy> = {
      drafting: [{ provider: 'openai', modelId: 'gpt-4o' }],
    };
    const chain = resolvePolicy('drafting', override);
    expect(chain).toEqual([{ provider: 'openai', modelId: 'gpt-4o' }]);
  });

  it('override does not affect other task types', () => {
    const override: Partial<Policy> = {
      drafting: [{ provider: 'openai', modelId: 'gpt-4o' }],
    };
    const chain = resolvePolicy('reasoning', override);
    expect(chain).toEqual(defaultPolicy.reasoning);
  });

  it('all 8 task types are in the default policy', () => {
    const taskTypes: TaskType[] = [
      'reasoning',
      'drafting',
      'classification',
      'extraction',
      'embedding',
      'voice',
      'vision',
      'research',
    ];
    for (const t of taskTypes) {
      expect(defaultPolicy[t]).toBeDefined();
    }
  });
});
