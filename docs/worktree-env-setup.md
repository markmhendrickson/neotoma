# Worktree Environment File Setup

This repository includes automation to copy `.env` files from the main repository to worktrees (especially Cursor worktrees).

## Automatic Setup

After cloning or setting up the repository, run:

```bash
npm run setup:env-hook
```

This installs a git `post-checkout` hook that automatically copies `.env` files to new worktrees when they're created.

## Manual Copy

If you need to manually copy the env file to your current worktree:

```bash
npm run copy:env
```

Or directly:

```bash
node scripts/copy-env-to-worktree.js
```

## How It Works

1. **Main Repository**: Keep your `.env`, `.env.dev`, or `.env.development` file in the main repository root.
2. **Worktree Detection**: The script detects if you're in a worktree and finds the main repository.
3. **File Copy**: It copies the env file from the main repo to the worktree as `.env.development`.
4. **Smart Updates**: The script only copies if the destination doesn't exist or if the source is newer.

## File Priority

The script looks for env files in this order:
1. `.env.dev`
2. `.env`
3. `.env.development`

The first one found in the main repository will be copied to `.env.development` in the worktree.

## Notes

- Env files are gitignored, so they're not automatically included in worktrees
- The hook runs automatically after `git checkout` operations
- The script is safe to run multiple times - it won't overwrite newer files
