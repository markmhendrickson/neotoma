#!/usr/bin/env node
/**
 * Wrapper script that sets branch-based ports and executes a command
 * Usage: node scripts/with-branch-ports.js <command> [args...]
 */

import { spawn } from 'child_process';
import { execSync } from 'child_process';
import { createHash } from 'crypto';

const BASE_HTTP_PORT = 8080;
const BASE_VITE_PORT = 5173;
const BASE_WS_PORT = 8081;

function getGitBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim() || 'main';
  } catch {
    return 'main';
  }
}

function hashBranchToPort(branch, base, range) {
  const hash = createHash('sha256').update(branch).digest();
  const offset = hash.readUInt16BE(0) % range;
  return base + offset;
}

const branch = getGitBranch();
const httpPort = hashBranchToPort(branch, BASE_HTTP_PORT, 100);
const vitePort = hashBranchToPort(branch, BASE_VITE_PORT, 100);
const wsPort = hashBranchToPort(branch, BASE_WS_PORT, 100);

// Set environment variables
process.env.HTTP_PORT = String(httpPort);
process.env.VITE_PORT = String(vitePort);
process.env.WS_PORT = String(wsPort);
process.env.PORT = String(vitePort);

// Execute command with args
const [,, ...args] = process.argv;
if (args.length === 0) {
  console.error('Usage: node scripts/with-branch-ports.js <command> [args...]');
  process.exit(1);
}

const [command, ...commandArgs] = args;
const child = spawn(command, commandArgs, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env },
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

