import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { configure, route, stream } from './router.js';
import { RouterError } from './errors.js';
import { createEventEmitter } from './events.js';
import { TaskTypeSchema, type ProviderConfig, type TaskInput, type Policy, type AICallEvent } from './types.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const AUTH_TOKEN = process.env.ROUTER_API_TOKEN;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const providerConfigs: Record<string, ProviderConfig> = {};
for (const provider of ['anthropic', 'openai', 'openrouter', 'google', 'ollama', 'deepgram', 'perplexity']) {
  const apiKey = process.env[`${provider.toUpperCase()}_API_KEY`];
  const baseUrl = process.env[`${provider.toUpperCase()}_BASE_URL`];
  if (apiKey || baseUrl) {
    providerConfigs[provider] = { apiKey: apiKey ?? '', ...(baseUrl ? { baseUrl } : {}) };
  }
}

configure({
  providerConfigs,
  emitter: createEventEmitter((event: AICallEvent) => {
    // Structured JSON line — pick this up from docker logs, ship to your logger later.
    process.stdout.write(`${JSON.stringify({ kind: 'ai_call', ...event })}\n`);
  }),
});

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new RouterError('INVALID_TASK', `Request body exceeds ${MAX_BODY_BYTES} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(new RouterError('INVALID_TASK', `Invalid JSON body: ${(error as Error).message}`));
      }
    });
    req.on('error', reject);
  });
}

function isAuthorized(req: IncomingMessage): boolean {
  if (!AUTH_TOKEN) return true;
  const header = req.headers.authorization;
  return header === `Bearer ${AUTH_TOKEN}`;
}

interface RouteBody {
  task?: unknown;
  policyOverride?: Partial<Policy>;
  providerConfigs?: Record<string, ProviderConfig>;
}

function extractTask(body: unknown): TaskInput {
  if (!body || typeof body !== 'object') {
    throw new RouterError('INVALID_TASK', 'Request body must be an object');
  }
  const { task } = body as RouteBody;
  if (!task || typeof task !== 'object') {
    throw new RouterError('INVALID_TASK', 'Missing "task" object in body');
  }
  const taskType = (task as { type?: unknown }).type;
  if (typeof taskType !== 'string' || !TaskTypeSchema.safeParse(taskType).success) {
    throw new RouterError('INVALID_TASK', `Invalid task.type: ${String(taskType)}`);
  }
  return task as TaskInput;
}

async function handleRoute(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = (await readJsonBody(req)) as RouteBody;
  const task = extractTask(body);
  const result = await route(task, {
    policyOverride: body.policyOverride,
    providerConfigs: body.providerConfigs,
  });
  sendJson(res, result.ok ? 200 : 502, result);
}

async function handleStream(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = (await readJsonBody(req)) as RouteBody;
  const task = extractTask(body);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    for await (const chunk of stream(task, {
      policyOverride: body.policyOverride,
      providerConfigs: body.providerConfigs,
    })) {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }
    res.write('event: done\ndata: {}\n\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof RouterError ? error.code : 'PROVIDER_ERROR';
    res.write(`event: error\ndata: ${JSON.stringify({ code, message })}\n\n`);
  } finally {
    res.end();
  }
}

const server = createServer(async (req, res) => {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  if (method === 'GET' && (url === '/health' || url === '/api/health')) {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (!isAuthorized(req)) {
    sendJson(res, 401, { ok: false, error: { code: 'AUTHENTICATION_FAILED', message: 'Missing or invalid bearer token' } });
    return;
  }

  try {
    if (method === 'POST' && url === '/api/ai/route') {
      await handleRoute(req, res);
      return;
    }
    if (method === 'POST' && url === '/api/ai/stream') {
      await handleStream(req, res);
      return;
    }
    sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: `No route for ${method} ${url}` } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof RouterError ? error.code : 'PROVIDER_ERROR';
    const status = code === 'INVALID_TASK' ? 400 : code === 'AUTHENTICATION_FAILED' ? 401 : 500;
    sendJson(res, status, { ok: false, error: { code, message } });
  }
});

server.listen(PORT, HOST, () => {
  const configured = Object.keys(providerConfigs);
  process.stdout.write(
    `${JSON.stringify({
      kind: 'server_start',
      host: HOST,
      port: PORT,
      providers: configured,
      authRequired: Boolean(AUTH_TOKEN),
    })}\n`,
  );
});

// Graceful shutdown so Docker stops us cleanly rather than SIGKILL after 10s.
function shutdown(signal: string): void {
  process.stdout.write(`${JSON.stringify({ kind: 'server_shutdown', signal })}\n`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
