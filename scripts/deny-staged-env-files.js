#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

function stagedPaths() {
  const output = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
    { encoding: 'utf8' }
  );
  return output.split('\0').filter(Boolean);
}

function isProtectedEnvPath(filePath) {
  const basename = filePath.split('/').pop() ?? '';
  return basename.startsWith('.env') && !basename.endsWith('.example');
}

const protectedPaths = stagedPaths().filter(isProtectedEnvPath);
if (protectedPaths.length > 0) {
  console.error(
    '[pre-commit] Refusing staged env files. Unstage these files and commit only *.example env templates:'
  );
  for (const filePath of protectedPaths) {
    console.error(`  ${filePath}`);
  }
  process.exitCode = 1;
}
