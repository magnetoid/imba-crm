#!/bin/sh
set -eu

log() {
  printf '%s {"kind":"start_script","msg":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1"
}

# Forward SIGTERM/SIGINT to children so Docker stop is clean.
shutdown() {
  log "shutdown requested"
  if [ -n "${ROUTER_PID:-}" ]; then kill -TERM "$ROUTER_PID" 2>/dev/null || true; fi
  if [ -n "${NGINX_PID:-}" ]; then kill -QUIT "$NGINX_PID" 2>/dev/null || true; fi
  wait 2>/dev/null || true
  exit 0
}
trap shutdown TERM INT

log "starting model-router backend on :3000"
node /app/packages/model-router/dist/server.js &
ROUTER_PID=$!

log "starting nginx"
nginx -g 'daemon off;' &
NGINX_PID=$!

# If either process exits, bring the whole container down so Docker restarts us
# (better than a silently half-alive container).
set +e
wait -n "$ROUTER_PID" "$NGINX_PID"
EXIT_CODE=$?
log "child exited with code $EXIT_CODE; shutting down siblings"
shutdown
exit $EXIT_CODE
