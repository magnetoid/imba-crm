import { calculateCost } from './cost.js';
import { RouterError } from './errors.js';
import { type EventEmitter, noopEmitter } from './events.js';
import { resolvePolicy } from './policies/index.js';
import { getProvider } from './providers/index.js';
import type {
  AICallEvent,
  ProviderConfig,
  RouteOptions,
  RouteResult,
  TaskInput,
  TaskOutput,
  TaskType,
} from './types.js';
import { TaskTypeSchema } from './types.js';

let globalEmitter: EventEmitter = noopEmitter;
let globalProviderConfigs: Record<string, ProviderConfig> = {};

export function configure(opts: {
  emitter?: EventEmitter;
  providerConfigs?: Record<string, ProviderConfig>;
}): void {
  if (opts.emitter) {
    globalEmitter = opts.emitter;
  }
  if (opts.providerConfigs) {
    globalProviderConfigs = opts.providerConfigs;
  }
}

function getProviderConfig(providerName: string, opts?: RouteOptions): ProviderConfig {
  const config = opts?.providerConfigs?.[providerName] ?? globalProviderConfigs[providerName];

  if (!config) {
    const envKey = `${providerName.toUpperCase()}_API_KEY`;
    const apiKey = process.env[envKey];
    if (apiKey) {
      return { apiKey };
    }
    throw new RouterError(
      'AUTHENTICATION_FAILED',
      `No config found for provider "${providerName}". Set ${envKey} or pass providerConfigs.`,
    );
  }
  return config;
}

export async function route<T extends TaskType>(
  task: TaskInput & { type: T },
  opts?: RouteOptions,
): Promise<RouteResult<TaskOutput & { type: T }>> {
  const parseResult = TaskTypeSchema.safeParse(task.type);
  if (!parseResult.success) {
    const event: AICallEvent = {
      taskType: task.type,
      provider: 'none',
      model: 'none',
      tokensIn: 0,
      tokensOut: 0,
      costCents: 0,
      durationMs: 0,
      success: false,
      error: `Invalid task type: ${task.type}`,
    };
    globalEmitter.emit(event);
    return {
      ok: false,
      error: {
        code: 'INVALID_TASK',
        message: `Invalid task type: ${task.type}`,
        attempts: [event],
      },
      event,
    };
  }

  const chain = resolvePolicy(task.type, opts?.policyOverride);

  if (chain.length === 0) {
    const event: AICallEvent = {
      taskType: task.type,
      provider: 'none',
      model: 'none',
      tokensIn: 0,
      tokensOut: 0,
      costCents: 0,
      durationMs: 0,
      success: false,
      error: `No providers configured for task type "${task.type}"`,
    };
    globalEmitter.emit(event);
    return {
      ok: false,
      error: {
        code: 'ALL_FALLBACKS_FAILED',
        message: `No providers configured for task type "${task.type}"`,
        attempts: [event],
      },
      event,
    };
  }

  const attempts: AICallEvent[] = [];

  for (const entry of chain) {
    const start = Date.now();
    let event: AICallEvent;

    try {
      const provider = getProvider(entry.provider);
      const config = getProviderConfig(entry.provider, opts);
      const configWithModel: ProviderConfig = {
        ...config,
        modelId: entry.modelId,
      };

      const response = await provider.execute(task, configWithModel);
      const costCents = calculateCost(entry.modelId, response.tokensIn, response.tokensOut);
      const durationMs = Date.now() - start;

      event = {
        taskType: task.type,
        provider: entry.provider,
        model: response.model,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
        costCents,
        durationMs,
        success: true,
      };

      globalEmitter.emit(event);
      attempts.push(event);

      let output: TaskOutput;
      if (task.type === 'embedding') {
        output = { type: 'embedding', embeddings: response.embeddings ?? [] } as unknown as TaskOutput & { type: T };
      } else {
        output = { type: task.type, content: response.content } as unknown as TaskOutput & { type: T };
      }
      return { ok: true, data: output as TaskOutput & { type: T }, event };
    } catch (error) {
      const durationMs = Date.now() - start;
      const errMsg = error instanceof Error ? error.message : String(error);
      const errCode = error instanceof RouterError ? error.code : 'PROVIDER_ERROR';

      event = {
        taskType: task.type,
        provider: entry.provider,
        model: entry.modelId,
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
        durationMs,
        success: false,
        error: errMsg,
      };

      globalEmitter.emit(event);
      attempts.push(event);

      // If it's an unsupported task, don't try other providers with same limitation
      if (errCode === 'UNSUPPORTED_TASK') {
        return {
          ok: false,
          error: {
            code: errCode,
            message: errMsg,
            attempts,
          },
          event,
        };
      }
    }
  }

  const lastAttempt = attempts[attempts.length - 1] as AICallEvent;
  return {
    ok: false,
    error: {
      code: 'ALL_FALLBACKS_FAILED',
      message: `All ${attempts.length} provider(s) failed for task type "${task.type}"`,
      attempts,
    },
    event: lastAttempt,
  };
}

export async function* stream<T extends TaskType>(
  task: TaskInput & { type: T },
  opts?: RouteOptions,
): AsyncGenerator<string, void, unknown> {
  const parseResult = TaskTypeSchema.safeParse(task.type);
  if (!parseResult.success) {
    throw new RouterError('INVALID_TASK', `Invalid task type: ${task.type}`);
  }

  if (task.type === 'embedding' || task.type === 'voice' || task.type === 'research') {
    throw new RouterError('UNSUPPORTED_TASK', `Streaming is out of scope for task type "${task.type}"`);
  }

  const chain = resolvePolicy(task.type, opts?.policyOverride);

  if (chain.length === 0) {
    throw new RouterError('ALL_FALLBACKS_FAILED', `No providers configured for task type "${task.type}"`);
  }

  for (const entry of chain) {
    try {
      const provider = getProvider(entry.provider);
      const config = getProviderConfig(entry.provider, opts);
      const configWithModel: ProviderConfig = {
        ...config,
        modelId: entry.modelId,
      };

      if (!provider.stream) {
        throw new RouterError('UNSUPPORTED_TASK', `Provider ${entry.provider} does not support streaming`);
      }

      yield* provider.stream(task, configWithModel);
      return;
    } catch (error) {
      const errCode = error instanceof RouterError ? error.code : 'PROVIDER_ERROR';
      if (errCode === 'UNSUPPORTED_TASK') {
        throw error;
      }
      continue;
    }
  }

  throw new RouterError('ALL_FALLBACKS_FAILED', `All provider(s) failed for stream task type "${task.type}"`);
}
