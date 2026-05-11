---
description: Typecheck both packages, commit staged changes, push to main. Coolify auto-deploys.
argument-hint: <commit message — conventional-commit subject + optional body>
allowed-tools: Bash, Read
---

Ship the current staged changes to production. Order:

1. **Pre-flight checks**:
   - `git status` — confirm there are changes to commit. If clean, stop and tell the user.
   - `git diff --cached --stat` — show the user what's being shipped. If nothing is staged but there are unstaged changes, stage everything with `git add -A` and warn that all unstaged files were staged.
   - Look at the file list for anything suspicious (`.env`, credentials.*, large binaries). If found, **stop** and ask.

2. **Typecheck both packages** (in parallel):
   ```bash
   pnpm --filter @imba/crm build
   pnpm --filter @imba/inbox-puller build
   ```
   If either fails, stop and report the offending file + first error. **Do not commit.**

3. **Commit + push**:
   ```bash
   git commit -m "$(cat <<'EOF'
   $ARGUMENTS

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   git push
   ```

4. **Verify the push** with `git status` (should show `Your branch is up to date with 'origin/main'`).

5. **Report**:
   - The commit SHA.
   - The URL Coolify will redeploy to (`https://crm.imbaproduction.com` and the worker container).
   - Note that deploy lands in ~2-3 minutes.

If the user passed `$ARGUMENTS` without a conventional-commit prefix (`feat(`, `fix(`, `chore(`, `docs(`, `refactor(`, `perf(`, `test(`), warn but proceed.
