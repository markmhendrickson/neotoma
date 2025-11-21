#!/usr/bin/env node

/**
 * Wrapper script for dev tasks that ensures branch-based ports are assigned
 * exactly once. When running inside `with-branch-ports`, the environment
 * variable `BRANCH_PORTS_FILE` will already be set, so we execute the target
 * command directly. Otherwise we delegate to `with-branch-ports` to allocate
 * ports before running the command.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WITH_BRANCH_SCRIPT = path.join(__dirname, 'with-branch-ports.js');

const [, , ...args] = process.argv;

if (args.length === 0) {
  console.error('Usage: node scripts/run-dev-task.js <command> [args...]');
  process.exit(1);
}

const hasSharedPorts =
  typeof process.env.BRANCH_PORTS_FILE === 'string' &&
  process.env.BRANCH_PORTS_FILE.length > 0 &&
  fs.existsSync(process.env.BRANCH_PORTS_FILE);

const command = hasSharedPorts ? args[0] : 'node';
const commandArgs = hasSharedPorts ? args.slice(1) : [WITH_BRANCH_SCRIPT, ...args];

const env = { ...process.env };
const localBin = path.resolve(__dirname, '..', 'node_modules', '.bin');
env.PATH = env.PATH ? `${localBin}${path.delimiter}${env.PATH}` : localBin;

const resolveLocalCommand = (cmd) => {
  if (!hasSharedPorts) {
    return cmd;
  }
  if (!cmd || cmd.includes('/') || cmd.includes('\\')) {
    return cmd;
  }
  const binName = process.platform === 'win32' ? `${cmd}.cmd` : cmd;
  const candidate = path.join(localBin, binName);
  return fs.existsSync(candidate) ? candidate : cmd;
};

const resolvedCommand = resolveLocalCommand(command);

const child = spawn(resolvedCommand, commandArgs, {
  stdio: 'inherit',
  shell: false,
  env,
});

child.on('exit', (code, signal) => {
  if (typeof code === 'number') {
    process.exit(code);
  }
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(0);
});
