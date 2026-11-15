---
description: "Rules for managing environment files when working in git worktrees, especially Cursor worktrees. Load when in a worktree or configuring .env across branches."
alwaysApply: false
---

<!-- Source: docs/developer/worktree_env.mdc -->


# Worktree Environment Rules

When working in a git worktree:

1. Worktrees do not automatically receive an env file. By default, set up a local development environment from the committed `.env.example` file.
2. Copying a main repository env file is an explicit opt-in: run `NEOTOMA_WORKTREE_COPY_ENV=1 npm run copy:env` in the destination worktree. Running `npm run copy:env` without that variable copies nothing.
3. `npm run setup:env-hook` installs a post-checkout hook, but the hook copies only when `NEOTOMA_WORKTREE_COPY_ENV=1` is set for that checkout.
4. The copy script checks `.env.dev`, `.env`, then `.env.development` in the main repository, with a user config fallback. It refuses a source selecting `NEOTOMA_ENV=production`, a `NEOTOMA_DATA_DIR` that resolves outside the destination worktree (including `~` paths and `..` escapes), or a `NEOTOMA_BASE_URL` whose host is not loopback (`localhost`, `127.0.0.1`, or `::1`). Remove or relocate an unsafe key in the source, or use `.env.example` to set up the worktree.
5. An allowed source is copied to `.env.development` only if the destination is missing or older. Env files are gitignored and must not be committed.

Agents should suggest the `.env.example` development setup when worktree variables are missing. Only suggest the copy command after explaining the opt-in and refusal conditions.
