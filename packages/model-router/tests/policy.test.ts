import { describe, expect, it } from 'vitest';
import { defaultPolicy } from '../src/policies/default.js';
import { resolvePolicy } from '../src/policies/index.js';
import type { Policy, TaskType } from '../src/types.js';

describe('resolvePolicy', () => {
  it('returns default chain for reasoning', () => {
    const chain = resolvePolicy('reasoning');
    expect(chain).toEqual(defaultPolicy.reasoning);
  });

  it('returns default chain for drafting', () => {
    const chain = resolvePolicy('drafting');
    expect(chain).toEqual(defaultPolicy.drafting);
  });

  it('returns default chain for classification', () => {
    const chain = resolvePolicy('classification');
    expect(chain).toEqual(defaultPolicy.classification);
  });

  it('returns default chain for extraction', () => {
    const chain = resolvePolicy('extraction');
    expect(chain).toEqual(defaultPolicy.extraction);
  });

  it('returns default chain for vision', () => {
    const chain = resolvePolicy('vision');
    expect(chain).toEqual(defaultPolicy.vision);
  });

  it('returns default chain for embedding', () => {
    expect(resolvePolicy('embedding')).toEqual(defaultPolicy.embedding);
  });

  it('returns default chain for voice', () => {
    expect(resolvePolicy('voice')).toEqual(defaultPolicy.voice);
  });

  it('returns default chain for research', () => {
    expect(resolvePolicy('research')).toEqual(defaultPolicy.research);
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
