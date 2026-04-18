import type { AICallEvent } from './types.js';

export interface EventEmitter {
  emit(event: AICallEvent): void;
}

export const noopEmitter: EventEmitter = {
  emit() {},
};

export function createEventEmitter(handler: (event: AICallEvent) => void): EventEmitter {
  return { emit: handler };
}
