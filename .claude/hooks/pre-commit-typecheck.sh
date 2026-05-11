#!/bin/bash
# Pre-commit typecheck — blocks `git commit` if either package fails to build.
# Wired as a PreToolUse(Bash) hook in .claude/settings.json.
#
# Receives the tool-call JSON on stdin. Decides via exit code:
#   - exit 0 : allow the tool call
#   - exit 2 + stderr message : block the tool call

set -u

# Read the tool-call JSON from stdin.
INPUT=$(cat)

# Only intercept `git commit …`. Use a permissive regex on the command field.
# (Anything else — git status, git log, ls, …  — is passed through immediately.)
if ! echo "$INPUT" | grep -qE '"command"[[:space:]]*:[[:space:]]*"[^"]*git commit'; then
  exit 0
fi

# Quick optimisation: if the staged diff contains no TS/TSX changes, skip the
# build. Sounds aggressive but: nothing else can break a TS build, and we
# don't want to wait 15s on a docs-only commit.
cd "$(dirname "$0")/../.." || exit 0
if ! git diff --cached --name-only | grep -qE '\.(ts|tsx|json|js|mjs|cjs)$'; then
  exit 0
fi

# Run the typechecks. Both packages must pass.
echo ">>> pre-commit hook: typechecking @imba/crm + @imba/inbox-puller" >&2

CRM_OUT=$(pnpm --filter @imba/crm build 2>&1)
CRM_RC=$?
if [ $CRM_RC -ne 0 ]; then
  echo "" >&2
  echo "❌ @imba/crm build failed — commit blocked." >&2
  echo "" >&2
  echo "$CRM_OUT" | tail -40 >&2
  exit 2
fi

WORKER_OUT=$(pnpm --filter @imba/inbox-puller build 2>&1)
WORKER_RC=$?
if [ $WORKER_RC -ne 0 ]; then
  echo "" >&2
  echo "❌ @imba/inbox-puller build failed — commit blocked." >&2
  echo "" >&2
  echo "$WORKER_OUT" | tail -40 >&2
  exit 2
fi

echo ">>> pre-commit hook: both builds green ✓" >&2
exit 0
