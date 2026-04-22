import type { Policy } from '../types.js';

export const defaultPolicy: Policy = {
  reasoning: [
    { provider: 'anthropic', modelId: 'claude-opus-4-7' },
    { provider: 'openai', modelId: 'gpt-5' },
  ],
  drafting: [
    { provider: 'anthropic', modelId: 'claude-sonnet-4-6' },
    { provider: 'openai', modelId: 'gpt-5-mini' },
    { provider: 'ollama', modelId: 'qwen-72b' },
  ],
  classification: [
    { provider: 'anthropic', modelId: 'claude-haiku-4-5' },
    { provider: 'google', modelId: 'gemini-flash' },
    { provider: 'ollama', modelId: 'qwen-14b' },
  ],
  extraction: [
    { provider: 'anthropic', modelId: 'claude-haiku-4-5' },
    { provider: 'openai', modelId: 'gpt-5-mini' },
    { provider: 'ollama', modelId: 'qwen-14b' },
  ],
  embedding: [
    { provider: 'openai', modelId: 'text-embedding-3-large' },
    { provider: 'ollama', modelId: 'bge-large' },
  ],
  research: [
    { provider: 'perplexity', modelId: 'sonar-pro' },
  ],
  voice: [
    { provider: 'deepgram', modelId: 'nova-3' },
    { provider: 'ollama', modelId: 'whisper' },
  ],
  vision: [
    { provider: 'anthropic', modelId: 'claude-sonnet-4-6 vision' },
    { provider: 'openai', modelId: 'gpt-5 vision' },
  ],
};
