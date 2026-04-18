import type { ModelProvider } from '../types.js';
import { createAnthropicProvider } from './anthropic.js';

export type ProviderFactory = () => ModelProvider;

const registry: Record<string, ProviderFactory> = {
  anthropic: createAnthropicProvider,
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
