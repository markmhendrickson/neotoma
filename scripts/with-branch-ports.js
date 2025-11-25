#!/usr/bin/env node
/**
 * Wrapper script that sets branch-based ports and executes a command
 * Usage: node scripts/with-branch-ports.js <command> [args...]
 */

import { spawn } from 'child_process';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import net from 'net';
import path from 'path';

const BASE_HTTP_PORT = 8080;
const BASE_VITE_PORT = 5173;
const BASE_WS_PORT = 8081;
const OWNER_PID_ENV = 'BRANCH_PORTS_OWNER_PID';

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

const BRANCH = getGitBranch();
const STATE_DIR = path.resolve(process.cwd(), '.branch-ports');
const STATE_FILE = path.join(STATE_DIR, `${BRANCH}.json`);
const HTTP_BASE = hashBranchToPort(BRANCH, BASE_HTTP_PORT, 100);
const VITE_BASE = hashBranchToPort(BRANCH, BASE_VITE_PORT, 100);
const WS_BASE = hashBranchToPort(BRANCH, BASE_WS_PORT, 100);
const MAX_PORT_SCAN_STEPS = 30;
const TERMINATE_TIMEOUT_MS = 5000;
const TERMINATE_POLL_INTERVAL_MS = 150;

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

function readStateFile() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStateFile(data) {
  ensureStateDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
}

function clearStateFile() {
  if (fs.existsSync(STATE_FILE)) {
    fs.rmSync(STATE_FILE, { force: true });
  }
}

function isProcessAlive(pid) {
  if (!pid || Number.isNaN(pid)) return false;
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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForProcessExit(pid, timeoutMs = TERMINATE_TIMEOUT_MS) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isProcessAlive(pid)) {
      return true;
    }
    // eslint-disable-next-line no-await-in-loop
    await delay(TERMINATE_POLL_INTERVAL_MS);
  }
  return !isProcessAlive(pid);
}

async function terminateProcess(pid) {
  if (!pid || !isProcessAlive(pid)) return;
  console.log(`[with-branch-ports] Terminating existing process ${pid}...`);
  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') {
      throw error;
    }
  }

  if (!(await waitForProcessExit(pid))) {
    console.warn(`[with-branch-ports] Process ${pid} did not exit after SIGTERM; sending SIGKILL`);
    try {
      process.kill(pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') {
        throw error;
      }
    }
    await waitForProcessExit(pid);
  }
}

function listenOnHost(port, host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        resolve(false);
        return;
      }
      reject(err);
    });
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function isPortAvailable(port) {
  const ipv6 = await listenOnHost(port, '::');
  if (!ipv6) {
    return false;
  }
  return listenOnHost(port, '0.0.0.0');
}

async function findOpenPort(basePort, reserved = new Set()) {
  for (let offset = 0; offset < MAX_PORT_SCAN_STEPS; offset += 1) {
    const candidate = basePort + offset;
    if (reserved.has(candidate)) {
      // eslint-disable-next-line no-continue
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const available = await isPortAvailable(candidate);
    if (available) {
      return { port: candidate, offset };
    }
  }
  throw new Error(`No open port found near ${basePort}. Tried ${MAX_PORT_SCAN_STEPS} slots.`);
}

async function tryReusePorts(previousPorts, reserved) {
  if (!previousPorts) return null;
  const { http, vite, ws } = previousPorts;
  if ([http, vite, ws].some((port) => typeof port !== 'number')) {
    return null;
  }

  const availability = await Promise.all(
    [http, vite, ws].map((port) => isPortAvailable(port))
  );

  if (availability.every(Boolean)) {
    reserved.add(http);
    reserved.add(vite);
    reserved.add(ws);
    return {
      http: { port: http, offset: http - HTTP_BASE },
      vite: { port: vite, offset: vite - VITE_BASE },
      ws: { port: ws, offset: ws - WS_BASE },
    };
  }

  return null;
}

async function assignPorts(previousPorts) {
  const reserved = new Set();

  const reused = await tryReusePorts(previousPorts, reserved);
  if (reused) {
    console.log('[with-branch-ports] Reusing previously assigned ports');
    return reused;
  }

  const http = await findOpenPort(HTTP_BASE, reserved);
  reserved.add(http.port);

  const vite = await findOpenPort(VITE_BASE, reserved);
  reserved.add(vite.port);

  const ws = await findOpenPort(WS_BASE, reserved);
  reserved.add(ws.port);

  return { http, vite, ws };
}

const childSignalHandlers = new Set();

function registerChildProcess(child, ports) {
  if (!child || typeof child.pid !== 'number' || !ports) {
    return;
  }

  const payload = {
    pid: child.pid,
    branch: BRANCH,
    timestamp: Date.now(),
    ports: {
      http: ports.http.port,
      vite: ports.vite.port,
      ws: ports.ws.port,
    },
  };

  writeStateFile(payload);

  const cleanup = () => {
    clearStateFile();
  };

  child.on('exit', cleanup);
  child.on('error', cleanup);

  if (childSignalHandlers.size === 0) {
    ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((signal) => {
      const handler = () => {
        if (!child.killed) {
          try {
            child.kill(signal);
          } catch (error) {
            if (error.code !== 'ESRCH') {
              throw error;
            }
          }
        }
      };
      childSignalHandlers.add({ signal, handler });
      process.on(signal, handler);
    });
    process.on('exit', cleanup);
  }
}

function spawnCommand(command, commandArgs, ports, options = {}) {
  const { skipRegister = false } = options;
  const isNpxConcurrently = command === 'npx' && commandArgs[0] === 'concurrently';
  const isConcurrently = command === 'concurrently' || isNpxConcurrently;

  if (isConcurrently) {
    const actualCommand = command === 'npx' ? 'npx' : command;
    const actualArgs = command === 'npx' ? ['concurrently', ...commandArgs.slice(1)] : commandArgs;

    const child = spawn(actualCommand, actualArgs, {
      stdio: 'inherit',
      shell: false,
      env: { ...process.env },
    });

    if (!skipRegister) {
      registerChildProcess(child, ports);
    }

    child.on('exit', (code) => {
      process.exit(code || 0);
    });

    child.on('error', (error) => {
      // Ignore EPIPE errors - these can occur when child processes exit
      if (error.code === 'EPIPE') {
        return;
      }
      console.error('[with-branch-ports] Child process error:', error);
    });
    return;
  }

  const child = spawn(command, commandArgs, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env },
  });

  if (!skipRegister) {
    registerChildProcess(child, ports);
  }

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

function parsePortEnv(name, base) {
  const raw = process.env[name];
  if (!raw) {
    throw new Error(`[with-branch-ports] Missing ${name} in environment for nested invocation`);
  }
  const port = Number(raw);
  if (Number.isNaN(port)) {
    throw new Error(`[with-branch-ports] Invalid ${name} value "${raw}"`);
  }
  return { port, offset: port - base };
}

function buildPortsFromEnv() {
  return {
    http: parsePortEnv('HTTP_PORT', BASE_HTTP_PORT),
    vite: parsePortEnv('VITE_PORT', BASE_VITE_PORT),
    ws: parsePortEnv('WS_PORT', BASE_WS_PORT),
  };
}

async function main() {
  const [,, ...args] = process.argv;
  if (args.length === 0) {
    console.error('Usage: node scripts/with-branch-ports.js <command> [args...]');
    process.exit(1);
  }

  const ownerPid = Number(process.env[OWNER_PID_ENV]);
  const isReentrant = Number.isFinite(ownerPid) && ownerPid !== process.pid;

  if (isReentrant) {
    console.log('[with-branch-ports] Nested invocation detected; reusing assigned ports');
    const ports = buildPortsFromEnv();
    const [command, ...commandArgs] = args;
    spawnCommand(command, commandArgs, ports, { skipRegister: true });
    return;
  }

  const previousState = readStateFile();
  if (previousState?.pid && isProcessAlive(previousState.pid)) {
    await terminateProcess(previousState.pid);
  } else if (previousState?.pid) {
    console.log('[with-branch-ports] Removing stale port assignment');
  }
  if (previousState) {
    clearStateFile();
  }

  const { http, vite, ws } = await assignPorts(previousState?.ports);

  process.env.HTTP_PORT = String(http.port);
  process.env.VITE_PORT = String(vite.port);
  process.env.WS_PORT = String(ws.port);
  process.env.VITE_WS_PORT = String(ws.port); // Expose to Vite frontend
  process.env.PORT = String(vite.port);
  process.env.BRANCH_PORTS_FILE = STATE_FILE;
  process.env.BRANCH_NAME = BRANCH;
  process.env[OWNER_PID_ENV] = process.env[OWNER_PID_ENV] || String(process.pid);

  const describeOffset = ({ offset }) => (offset === 0 ? 'base' : `base+${offset}`);
  console.log(
    `[with-branch-ports] branch=${BRANCH} http=${http.port} (${describeOffset(http)}) ` +
    `vite=${vite.port} (${describeOffset(vite)}) ws=${ws.port} (${describeOffset(ws)})`,
  );

  const [command, ...commandArgs] = args;
  spawnCommand(command, commandArgs, { http, vite, ws });
}

main().catch((err) => {
  console.error('[with-branch-ports] Failed to acquire ports:', err);
  process.exit(1);
});

