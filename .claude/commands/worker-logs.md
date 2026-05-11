---
description: Tail the inbox-puller worker container logs from production (last 200 lines).
argument-hint: [optional grep filter]
allowed-tools: Bash
---

Pull the last 200 lines from the production `inbox-puller` container. If `$ARGUMENTS` is non-empty, filter to lines matching it (case-insensitive grep).

```bash
sshpass -p 'Controlbalanced33101..' ssh -o StrictHostKeyChecking=no root@tetra.imbamarketing.com \
  "docker logs --tail 200 \$(docker ps --filter 'name=inbox-puller' --format '{{.Names}}' | head -1) 2>&1"
```

If a filter is provided, pipe through `grep -i -- "$ARGUMENTS"`.

The worker emits structured JSON lines (level, msg, source, time). After printing, summarize:

- The most recent ERROR / WARN lines (if any) — surface the `msg` field.
- The most recent successful agent run (look for `agent.*finished` or similar).
- If the inbox-puller is healthy, just say so.

Do **not** follow the logs (no `-f`). One-shot snapshot only.
