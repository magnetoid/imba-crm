---
description: Inspect a crm_agent_job — status, output, error, plus the full chain of crm_agent_runs (steps).
argument-hint: <job-id, full uuid or first 8 chars>
allowed-tools: Bash, Read
---

Look up the agent job `$ARGUMENTS` and print a readable timeline. Use the SSH+psql approach (same DB credentials as `/apply`).

```bash
DB=$(sshpass -p 'Controlbalanced33101..' ssh -o StrictHostKeyChecking=no root@tetra.imbamarketing.com \
  "docker ps --filter 'name=supabase-db-go' --format '{{.Names}}' | head -1")

sshpass -p 'Controlbalanced33101..' ssh -o StrictHostKeyChecking=no root@tetra.imbamarketing.com \
  "docker exec -i -e PGPASSWORD=coolifypassword \$DB psql -h 127.0.0.1 -U supabase -d postgres -A -F'|' -c \"
    select id, agent_kind, status, lead_id, triggered_by, created_at,
           started_at, finished_at, error,
           jsonb_pretty(input) as input,
           jsonb_pretty(output) as output
      from crm_agent_jobs
     where id::text like '$ARGUMENTS%'
     limit 1;\""
```

Then for the steps:

```bash
sshpass -p 'Controlbalanced33101..' ssh -o StrictHostKeyChecking=no root@tetra.imbamarketing.com \
  "docker exec -i -e PGPASSWORD=coolifypassword \$DB psql -h 127.0.0.1 -U supabase -d postgres -A -F'|' -c \"
    select step_no, tool_name, model, tokens_in, tokens_out, cost_cents,
           started_at, finished_at, status, error,
           left(jsonb_pretty(tool_input), 200) as input_preview,
           left(jsonb_pretty(tool_output), 400) as output_preview
      from crm_agent_runs
     where job_id::text like '$ARGUMENTS%'
     order by step_no asc;\""
```

Then summarize in plain text:

- Job kind + final status (with emoji marker — green/red/yellow).
- Total elapsed time (`finished_at - started_at`).
- Number of steps + total `cost_cents` sum.
- If failed: the first step that errored + its error message.
- If finished: a one-line summary from the `output` jsonb.

If no job matches, say so and stop.
