#!/usr/bin/env node
/**
 * Write a minimal, non-secret `.env.development` into the current worktree.
 *
 * Usage: node scripts/write-worktree-dev-env.js [--force] [--print] [--help]
 */

import {
  WORKTREE_DEV_ENV_ALLOWLIST,
  buildWorktreeDevEnv,
  isNeotomaRepoRoot,
  writeWorktreeDevEnv,
} from './lib/worktree_dev_env.js';

const HELP = `Write a minimal, non-secret .env.development into the current worktree.

Usage: node scripts/write-worktree-dev-env.js [--force] [--print] [--help]
       npm run setup:worktree-env

What it does
  Writes only these keys, with safe defaults: ${WORKTREE_DEV_ENV_ALLOWLIST.map((e) => e.key).join(', ')}.
  It does not copy any env file, and it reads nothing outside this repository
  (not your home directory, not another checkout).

Credentials
  This script never writes credentials. If you need them in a worktree, set them
  yourself: export them in your shell, or create your own gitignored .env in this
  worktree. Do not copy a private config file into a worktree.

Options
  --force   Overwrite an existing .env.development (default: leave it untouched).
  --print   Print the generated contents to stdout instead of writing a file.
  --help    Show this message.
`;

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(HELP);
    return 0;
  }
  const repoRoot = process.cwd();
  if (!isNeotomaRepoRoot(repoRoot)) {
    console.error('[worktree-env] Run this from the root of a Neotoma checkout. Nothing written.');
    return 1;
  }
  if (argv.includes('--print')) {
    process.stdout.write(buildWorktreeDevEnv(repoRoot));
    return 0;
  }
  const result = writeWorktreeDevEnv(repoRoot, { force: argv.includes('--force') });
  if (result.status === 'written') {
    console.log(`[worktree-env] Wrote non-secret dev settings to ${result.destination}`);
  } else {
    console.log(`[worktree-env] ${result.destination} already exists; left untouched (use --force to regenerate).`);
    if (result.credentialNamedKeys > 0) {
      console.warn(
        `[worktree-env] Warning: it holds ${result.credentialNamedKeys} credential-named key(s). ` +
          'Remove them unless you set them on purpose.'
      );
    }
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
