---
description: Scaffold a new SQL migration via the migration-writer subagent.
argument-hint: <one-line description of what the migration should do>
allowed-tools: Agent, Read, Bash
---

Invoke the `migration-writer` subagent with the user's description. The agent will write a single idempotent transactional migration file at `migrations/YYYYMMDD_<slug>.sql` following the imba-crm conventions.

User's description: $ARGUMENTS

Brief the subagent with the description above. After the subagent reports back:

1. Print the path of the new file.
2. Print the exact SSH+psql apply command (substituting the new file path). Do **not** run the apply command — wait for the user to confirm, then they can use `/apply <filename>` to run it.
3. Do not edit the file further. If the user wants changes, they'll ask.
