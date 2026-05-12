// Centralised error sink. Every async failure that doesn't already
// bubble up to the operator goes here so:
//   1. It shows up in the browser console with a structured payload.
//   2. A friendly toast appears (unless silent=true) with an actionable
//      suggestion based on the error category.
//
// Usage:
//   .catch(err => logError(err, { where: 'autoScoreLead', leadId }))
//   .catch(err => logError(err, { where: 'autoSaveDraft' }, { silent: true }))
//
// Replaces the previous .catch(() => {}) anti-pattern that hid real
// failures from the operator.

import toast from 'react-hot-toast'

type Category = 'auth' | 'config' | 'cost' | 'network' | 'db' | 'unknown'

interface LogErrorContext {
  where: string
  [key: string]: unknown
}

interface LogErrorOptions {
  silent?: boolean        // suppress the toast (still logs to console)
  category?: Category     // override auto-detection
  retry?: () => void      // attach a Retry button to the toast
}

function detectCategory(err: unknown): Category {
  const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase()
  if (/unauthor|invalid (jwt|token)|jwt expired|forbidden|permission/.test(msg)) return 'auth'
  if (/cost cap|over (the )?cap|monthly limit|spend ceiling/.test(msg))            return 'cost'
  if (/network|fetch failed|timeout|econn|abort/.test(msg))                        return 'network'
  if (/not configured|missing (api )?key|no credential|invalid host/.test(msg))    return 'config'
  if (/duplicate key|conflict|relation .* does not exist|violates/.test(msg))      return 'db'
  return 'unknown'
}

// Human-friendly toast copy per category. Each ends with the next-step
// the operator can take.
const TOAST_COPY: Record<Category, (msg: string) => string> = {
  auth:    (m) => `Auth failed — try re-saving credentials. (${m})`,
  cost:    () => `AI spend cap hit. Increase the cap in Settings → Cost & limits.`,
  network: (m) => `Network hiccup — retry in a moment. (${m})`,
  config:  (m) => `Configuration issue: ${m}. Check Settings → Integrations.`,
  db:      (m) => `Database error: ${m}. Refresh the page and try again.`,
  unknown: (m) => m || 'Something went wrong.',
}

export function logError(
  err: unknown,
  ctx: LogErrorContext,
  opts: LogErrorOptions = {},
): void {
  const category = opts.category ?? detectCategory(err)
  const msg = err instanceof Error ? err.message : String(err ?? 'unknown error')
  const payload = { level: 'error', category, msg, ...ctx, time: new Date().toISOString() }
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(payload), err)
  if (opts.silent) return
  const text = TOAST_COPY[category](msg)
  if (opts.retry) {
    toast((t) => {
      const fn = opts.retry as () => void
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{text}</span>
          <button
            onClick={() => { fn(); toast.dismiss(t.id) }}
            style={{ padding: '2px 8px', borderRadius: 4, background: '#000', color: '#fff', fontSize: 11 }}
          >
            Retry
          </button>
        </span>
      )
    }, { duration: 6000 })
  } else {
    toast.error(text, { duration: 5000 })
  }
}
