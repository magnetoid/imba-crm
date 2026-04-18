import type { Policy } from '../types.js';

export const defaultPolicy: Policy = {
  reasoning: [{ provider: 'anthropic', modelId: 'claude-opus-4-7' }],
  drafting: [{ provider: 'anthropic', modelId: 'claude-sonnet-4-6' }],
  classification: [{ provider: 'anthropic', modelId: 'claude-haiku-4-5' }],
  extraction: [{ provider: 'anthropic', modelId: 'claude-sonnet-4-6' }],
  vision: [{ provider: 'anthropic', modelId: 'claude-sonnet-4-6' }],

  // Not supported by Anthropic — will be filled in session 2
  embedding: [],
  voice: [],
  research: [],
};
