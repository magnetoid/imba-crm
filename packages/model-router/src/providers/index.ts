import type { ModelProvider } from '../types.js';
import { createAnthropicProvider } from './anthropic.js';
import { createDeepgramProvider } from './deepgram.js';
import { createGoogleProvider } from './google.js';
import { createOllamaProvider } from './ollama.js';
import { createOpenAIProvider } from './openai.js';
import { createOpenRouterProvider } from './openrouter.js';
import { createPerplexityProvider } from './perplexity.js';

export type ProviderFactory = () => ModelProvider;

const registry: Record<string, ProviderFactory> = {
  anthropic: createAnthropicProvider,
  openai: createOpenAIProvider,
  openrouter: createOpenRouterProvider,
  google: createGoogleProvider,
  ollama: createOllamaProvider,
  deepgram: createDeepgramProvider,
  perplexity: createPerplexityProvider,
};

export function getProvider(name: string): ModelProvider {
  const factory = registry[name];
  if (!factory) {
    throw new Error(`Unknown provider: ${name}. Available: ${Object.keys(registry).join(', ')}`);
  }
  return factory();
}

export function registerProvider(name: string, factory: ProviderFactory): void {
  registry[name] = factory;
}

export { createAnthropicProvider };
