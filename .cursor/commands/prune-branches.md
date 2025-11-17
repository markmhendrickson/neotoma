# prune-branches
Delete all local branches fully merged into `dev`. Accept optional branch override via `TARGET_BRANCH` env or positional argument (`cursor command prune-branches main`).

## Procedure
1. Ensure clean working tree (`git status --porcelain` empty) to avoid data loss. Abort if dirty.
2. Run `npm run branches:prune -- <targetBranch?>`. Default target branch `dev`.
   - Script fetches refs (`git fetch --all --prune`) before evaluating merge status.
   - Branch list derived from `git branch --merged <target>`.
   - Protected branches: `target`, current branch, `main`, `master`.
3. Display deleted branches count. If none, report already clean.
4. If any deletion fails (e.g., unmerged commits), leave branch intact and show git error.

## Notes
- Set `TARGET_BRANCH` env to control default: `TARGET_BRANCH=main cursor command prune-branches`.
- Command uses `git branch -d`, so only fast-forwards after confirmed merged. Use manual cleanup for `-D` cases.
- Safe to run from worktrees; operates on shared repo metadata.

