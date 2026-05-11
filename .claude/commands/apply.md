---
description: Apply a migration file to the production Supabase Postgres via SSH+psql.
argument-hint: <migrations/YYYYMMDD_xxx.sql>
allowed-tools: Bash, Read
---

Apply the migration at the path the user provided to production. Before running:

1. Read the migration file. If it contains any of `drop table`, `drop column`, `truncate`, `delete from … where true`, `disable row level security`, **STOP** and confirm with the user before proceeding.
2. Confirm the file ends with `commit;` (not a partial in-progress file).

Then run the SSH+psql apply template (template lives in memory at `reference_deployment.md`):

```bash
DB=$(sshpass -p 'Controlbalanced33101..' ssh -o StrictHostKeyChecking=no root@tetra.imbamarketing.com \
  "docker ps --filter 'name=supabase-db-go' --format '{{.Names}}' | head -1") && \
sshpass -p 'Controlbalanced33101..' scp -o StrictHostKeyChecking=no $ARGUMENTS \
  root@tetra.imbamarketing.com:/tmp/$(basename $ARGUMENTS) && \
sshpass -p 'Controlbalanced33101..' ssh -o StrictHostKeyChecking=no root@tetra.imbamarketing.com \
  "docker exec -i -e PGPASSWORD=coolifypassword $DB psql -h 127.0.0.1 -U supabase -d postgres -v ON_ERROR_STOP=1 < /tmp/$(basename $ARGUMENTS)"
```

Use `$ARGUMENTS` as the migration path. After it completes, summarize: `BEGIN; … COMMIT;` lines, any rowcount output (INSERT/UPDATE/DELETE counts), any errors. Flag if `COMMIT` did not appear at the end — that means the transaction rolled back.

If the apply fails, do **not** retry blindly. Surface the error and ask the user how to proceed.
