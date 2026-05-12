// MCP (Model Context Protocol) server endpoint.
//
// Exposes imba-crm's Nomo tool registry to external MCP clients
// (Claude Desktop, Cursor, claude-code, etc) over the Streamable HTTP
// transport (POST /api/mcp + optional SSE).
//
// Protocol: JSON-RPC 2.0 per https://modelcontextprotocol.io.
// Methods supported:
//   - initialize             → server capabilities + protocol version
//   - notifications/initialized (no response)
//   - tools/list             → all NomoTool entries as MCP tools
//   - tools/call             → dispatches to the tool's run(input)
//   - ping                   → liveness check
//
// Auth: Bearer JWT. Only admin tokens may call write tools. Read tools
// (NomoTool.write !== true) are available to any valid JWT.
//
// Discovery: /.well-known/mcp/imba-crm.json advertises the endpoint
// + auth requirement for clients that auto-discover.

import type { Hono } from 'hono'
import { NOMO_TOOLS, findTool } from './nomo-tools.js'

const JWT_SECRET = process.env.JWT_SECRET || ''
const PROTOCOL_VERSION = '2024-11-05'   // current MCP spec version

function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, source: 'mcp', ...extra, time: new Date().toISOString() }))
}

function b64urlDecode(s: string) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
}

async function verifyJwt(authHeader: string | undefined): Promise<{ uid: string; isAdmin: boolean } | null> {
  if (!authHeader || !JWT_SECRET) return null
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const parts = m[1].split('.')
  if (parts.length !== 3) return null
  const crypto = await import('node:crypto')
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  if (expected !== parts[2]) return null
  try {
    const c = JSON.parse(b64urlDecode(parts[1])) as { sub?: string; exp?: number; app_metadata?: { role?: string }; user_metadata?: { role?: string } }
    if (typeof c.exp === 'number' && c.exp * 1000 < Date.now()) return null
    if (!c.sub) return null
    return { uid: c.sub, isAdmin: c.app_metadata?.role === 'admin' || c.user_metadata?.role === 'admin' }
  } catch (e) {
    log('warn', 'invalid jwt for mcp', { error: (e as Error).message })
    return null
  }
}

// JSON-RPC 2.0 envelope helpers.
interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: number | string | null
  method: string
  params?: unknown
}
interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number | string | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

function ok(id: JsonRpcRequest['id'], result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, result }
}
function err(id: JsonRpcRequest['id'], code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) } }
}

export function mountMCP(app: Hono) {
  // ── Discovery ──────────────────────────────────────────────────
  app.get('/.well-known/mcp/imba-crm.json', c => {
    return c.json({
      schemaVersion: 'mcp-discovery-1',
      name: 'imba-crm',
      description: 'Imba CRM — leads, inbox, agents. Exposes the Nomo tool registry over MCP.',
      transport: 'streamable-http',
      endpoint: `${c.req.url.replace(/\/\.well-known\/mcp\/imba-crm\.json.*$/, '')}/api/mcp`,
      auth: { type: 'bearer', description: 'Supabase JWT issued for the operator' },
      protocolVersion: PROTOCOL_VERSION,
    })
  })

  // ── JSON-RPC endpoint ──────────────────────────────────────────
  app.post('/api/mcp', async c => {
    const claims = await verifyJwt(c.req.header('authorization'))
    if (!claims) return c.json(err(null, -32001, 'unauthorized'), 401)

    const body = await c.req.json().catch(() => null) as JsonRpcRequest | JsonRpcRequest[] | null
    if (!body) return c.json(err(null, -32700, 'parse error'), 400)

    const reqs = Array.isArray(body) ? body : [body]
    const responses: JsonRpcResponse[] = []

    for (const req of reqs) {
      if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
        responses.push(err(req.id ?? null, -32600, 'invalid request'))
        continue
      }

      try {
        if (req.method === 'initialize') {
          responses.push(ok(req.id, {
            protocolVersion: PROTOCOL_VERSION,
            serverInfo: { name: 'imba-crm', version: '1.0.0' },
            capabilities: {
              tools: { listChanged: false },
              logging: {},
            },
          }))
          log('info', 'mcp initialized', { uid: claims.uid, isAdmin: claims.isAdmin })
          continue
        }

        if (req.method === 'notifications/initialized') {
          // No response per spec.
          continue
        }

        if (req.method === 'ping') {
          responses.push(ok(req.id, {}))
          continue
        }

        if (req.method === 'tools/list') {
          // Filter: read-only tools for all callers, write tools for admins.
          const visible = NOMO_TOOLS.filter(t => !t.write || claims.isAdmin)
          responses.push(ok(req.id, {
            tools: visible.map(t => ({
              name: t.name,
              description: t.description,
              inputSchema: t.input_schema,
              // MCP allows arbitrary metadata; flag write-tools so clients
              // can show a different confirmation UI.
              _meta: { write: !!t.write, admin_only: !!t.admin_only },
            })),
          }))
          continue
        }

        if (req.method === 'tools/call') {
          const params = req.params as { name?: string; arguments?: Record<string, unknown> } | undefined
          const toolName = params?.name
          const input = params?.arguments ?? {}
          if (!toolName) {
            responses.push(err(req.id, -32602, 'name required'))
            continue
          }
          const tool = findTool(toolName)
          if (!tool) {
            responses.push(err(req.id, -32601, `unknown tool: ${toolName}`))
            continue
          }
          if (tool.write && !claims.isAdmin) {
            responses.push(err(req.id, -32001, 'admin-only write tool'))
            continue
          }
          try {
            const result = await tool.run(input)
            log('info', 'mcp tool call', { tool: toolName, uid: claims.uid })
            responses.push(ok(req.id, {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
              isError: false,
            }))
          } catch (e) {
            const msg = (e as Error).message
            log('warn', 'mcp tool failed', { tool: toolName, error: msg })
            responses.push(ok(req.id, {
              content: [{ type: 'text', text: `Error: ${msg}` }],
              isError: true,
            }))
          }
          continue
        }

        responses.push(err(req.id ?? null, -32601, `method not found: ${req.method}`))
      } catch (e) {
        responses.push(err(req.id ?? null, -32603, `internal error: ${(e as Error).message}`))
      }
    }

    // Mirror request shape — batch in / batch out.
    if (Array.isArray(body)) return c.json(responses)
    return c.json(responses[0] ?? null)
  })

  // GET on the same path returns the server descriptor — convenient
  // for clients that probe before establishing a session.
  app.get('/api/mcp', c => c.json({
    protocol: 'mcp',
    transport: 'streamable-http',
    protocolVersion: PROTOCOL_VERSION,
    server: 'imba-crm',
    description: 'POST JSON-RPC 2.0 requests here. See /.well-known/mcp/imba-crm.json for discovery.',
  }))
}
