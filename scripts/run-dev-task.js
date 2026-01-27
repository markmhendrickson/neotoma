#!/usr/bin/env node

/**
 * Wrapper script for dev tasks that ensures branch-based ports are assigned
 * exactly once. When running inside `with-branch-ports`, the environment
 * variable `BRANCH_PORTS_FILE` will already be set, so we execute the target
 * command directly. Otherwise we delegate to `with-branch-ports` to allocate
 * ports before running the command.
 */
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WITH_BRANCH_SCRIPT = path.join(__dirname, 'with-branch-ports.js');
const DEV_SERVE_SCRIPT = path.normalize(path.join('scripts', 'dev-serve.js'));
const DEV_SERVE_STATE_DIR = path.resolve(process.cwd(), '.dev-serve');

const [, , ...args] = process.argv;

if (args.length === 0) {
  console.error('Usage: node scripts/run-dev-task.js <command> [args...]');
  process.exit(1);
}

function getBranchName() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    return branch || 'main';
  } catch {
    return 'main';
  }
}

function getDevServeStateFile(branch) {
  return path.join(DEV_SERVE_STATE_DIR, `${branch}.json`);
}

function isProcessAlive(pid) {
  if (!pid || Number.isNaN(pid)) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') {
      return false;
    }
    throw error;
  }
}

function deleteStateFile(stateFile) {
  if (fs.existsSync(stateFile)) {
    fs.rmSync(stateFile, { force: true });
  }
}

function reportExistingDevServeIfRunning() {
  const branch = getBranchName();
  const stateFile = getDevServeStateFile(branch);
  if (!fs.existsSync(stateFile)) {
    return false;
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
  } catch {
    deleteStateFile(stateFile);
    return false;
  }

  const { pid, ports } = parsed || {};

  if (!pid || !ports || !isProcessAlive(pid)) {
    deleteStateFile(stateFile);
    return false;
  }

  const { http, vite, ws } = ports;
  console.log('[dev-serve] Existing dev stack already running for this worktree.');
  console.log(`[dev-serve] Branch ${parsed.branch || branch} pid ${pid}`);
  if (http) {
    console.log(`[dev-serve] HTTP Actions: http://localhost:${http}`);
  }
  if (vite) {
    console.log(`[dev-serve] Vite UI: http://localhost:${vite}`);
  }
  if (ws) {
    console.log(`[dev-serve] WebSocket bridge: ws://localhost:${ws}`);
  }
  if (parsed.startedAt) {
    console.log(`[dev-serve] Started ${new Date(parsed.startedAt).toISOString()}`);
  }

  return true;
}

// Check if ports are already explicitly set via environment variables
const hasExplicitPorts =
  typeof process.env.HTTP_PORT === 'string' && process.env.HTTP_PORT.length > 0;

const hasSharedPorts =
  hasExplicitPorts ||
  (typeof process.env.BRANCH_PORTS_FILE === 'string' &&
  process.env.BRANCH_PORTS_FILE.length > 0 &&
  fs.existsSync(process.env.BRANCH_PORTS_FILE));

const isDevServeInvocation =
  args[0] === 'node' &&
  typeof args[1] === 'string' &&
  path.normalize(args[1]) === DEV_SERVE_SCRIPT;

if (!hasSharedPorts && isDevServeInvocation && reportExistingDevServeIfRunning()) {
  process.exit(0);
}

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
