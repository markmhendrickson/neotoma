# Worktree Environment Rules

When working in a git worktree (especially Cursor worktrees):

1. Environment files (`.env`, `.env.dev`, `.env.development`) live in the **main repo root**, not in each worktree.
2. Worktrees do **not** automatically get env files.
3. To copy env into the current worktree, run:
   - `npm run copy:env`
   - or `node scripts/copy-env-to-worktree.js`
4. To install the auto-copy hook (runs on `git checkout`):
   - `npm run setup:env-hook`
5. The copy script:
   - Detects if you are in a worktree and finds the main repo
   - Looks for env files in this order: `.env.dev`, `.env`, `.env.development`
   - Copies the first one found to `.env.development` in the worktree
   - Only overwrites if the source is newer or destination is missing
6. Env files are gitignored and MUST NOT be committed.

Agents should:
- Suggest `npm run copy:env` when encountering missing env variables in a worktree
- Never try to commit `.env*` files
- Prefer the hook (`npm run setup:env-hook`) for developer machines
