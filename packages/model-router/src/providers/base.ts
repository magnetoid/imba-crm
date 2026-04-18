import { RouterError } from '../errors.js';
import type { ModelProvider, ProviderConfig } from '../types.js';

export type { ModelProvider };

export function validateConfig(config: ProviderConfig): void {
  if (!config.apiKey) {
    throw new RouterError('AUTHENTICATION_FAILED', 'API key is required');
  }
}

export type ProviderFactory = (config?: Partial<ProviderConfig>) => ModelProvider;
