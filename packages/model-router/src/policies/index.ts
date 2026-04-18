import type { Policy, ProviderChain, TaskType } from '../types.js';
import { defaultPolicy } from './default.js';

export function resolvePolicy(taskType: TaskType, override?: Partial<Policy>): ProviderChain {
  if (override?.[taskType]) {
    return override[taskType];
  }
  return defaultPolicy[taskType];
}

export { defaultPolicy };
