#!/usr/bin/env node

import { spawn } from 'child_process';
import readline from 'readline';
import dotenv from 'dotenv';
import path from 'path';

const projectRoot = process.cwd();
const nodeEnv = process.env.NODE_ENV || 'development';

const envFiles =
  nodeEnv === 'production'
    ? [path.join(projectRoot, '.env.production'), path.join(projectRoot, '.env')]
    : [path.join(projectRoot, '.env.development'), path.join(projectRoot, '.env')];

envFiles.forEach((file) => {
  dotenv.config({ path: file });
});

const bootTimeoutMs = Number(process.env.DEV_SERVE_BOOT_TIMEOUT_MS || 60000);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const logHistoryLimit = 200;

const tasks = [
  {
    name: 'actions',
    description: 'HTTP Actions server',
    script: 'dev:http',
    readyPattern: /HTTP Actions listening on/i,
  },
  {
    name: 'ui',
    description: 'Vite dev server',
    script: 'dev:ui',
    readyPattern: /(VITE v|ready in|Local: http)/i,
  },
];

const diagnostics = [
  {
    test: /Missing Supabase configuration|Missing SUPABASE_URL|Missing SUPABASE_SERVICE_KEY/i,
    message:
      'Supabase environment missing. Populate .env.development with DEV_SUPABASE_URL and DEV_SUPABASE_SERVICE_KEY or provide SUPABASE_URL/SUPABASE_SERVICE_KEY.',
  },
  {
    test: /listen EADDRINUSE/i,
    message:
      'Port already in use. Terminate other dev servers or set HTTP_PORT/VITE_PORT before running npm run dev:serve.',
  },
  {
    test: /Cannot find module/i,
    message: 'Dependency missing. Run npm install to restore node_modules.',
  },
  {
    test: /failed to load config from/i,
    message: 'Vite failed to load its config. Inspect vite.config.ts for syntax problems.',
  },
];

const labelWidth = Math.max(...tasks.map((task) => task.name.length));
const taskState = new Map();
let bootTimer;
let shuttingDown = false;

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function ensureBaseEnv() {
  const urlKeys = ['DEV_SUPABASE_PROJECT_ID', 'DEV_SUPABASE_URL', 'SUPABASE_PROJECT_ID', 'SUPABASE_URL'];
  const keyKeys = ['DEV_SUPABASE_SERVICE_KEY', 'SUPABASE_SERVICE_KEY'];
  const missing = [];

  if (!urlKeys.some((key) => hasValue(process.env[key]))) {
    missing.push('Supabase URL or project id');
  }
  if (!keyKeys.some((key) => hasValue(process.env[key]))) {
    missing.push('Supabase service role key');
  }

  if (missing.length > 0) {
    console.error(`[dev-serve] Missing required environment values: ${missing.join(', ')}`);
    console.error(
      '[dev-serve] Create .env.development with DEV_SUPABASE_URL and DEV_SUPABASE_SERVICE_KEY or use SUPABASE_URL/SUPABASE_SERVICE_KEY.',
    );
    process.exit(1);
  }
}

function formatPrefix(name, stream) {
  const padded = name.padEnd(labelWidth);
  const suffix = stream === 'stderr' ? '!' : ' ';
  return `[${padded}${suffix}]`;
}

function recordLog(state, line, stream) {
  state.logs.push({ line, stream });
  if (state.logs.length > logHistoryLimit) {
    state.logs.shift();
  }
}

function printDiagnostics(state) {
  if (!state || state.logs.length === 0) {
    return;
  }
  const joined = state.logs.map((entry) => entry.line).join('\n');
  const match = diagnostics.find((diag) => diag.test.test(joined));
  if (match) {
    console.error(`[dev-serve] Diagnostic hint (${state.task.description}): ${match.message}`);
    return;
  }
  const excerpt = state.logs.slice(-8).map((entry) => `  ${entry.stream === 'stderr' ? '!' : '-'} ${entry.line}`).join('\n');
  if (excerpt) {
    console.error(`[dev-serve] Recent ${state.task.description} log lines:\n${excerpt}`);
  }
}

function checkAllReady() {
  if ([...taskState.values()].every((state) => state.ready)) {
    if (bootTimer) {
      clearTimeout(bootTimer);
    }
    console.log('[dev-serve] All dev services are ready. Press Ctrl+C to stop.');
  }
}

function handleLine(state, line, stream) {
  recordLog(state, line, stream);
  const prefix = formatPrefix(state.task.name, stream);
  const output = `${prefix} ${line}`;
  if (stream === 'stderr') {
    console.error(output);
  } else {
    console.log(output);
  }
  if (!state.ready && state.task.readyPattern?.test(line)) {
    state.ready = true;
    console.log(`[dev-serve] ${state.task.description} reported ready.`);
    checkAllReady();
  }
}

function attachStream(state, stream, streamName) {
  const rl = readline.createInterface({ input: stream });
  rl.on('line', (line) => handleLine(state, line, streamName));
  stream.on('error', (error) => {
    if (!shuttingDown) {
      console.error(`[dev-serve] Stream error for ${state.task.description}: ${error.message}`);
    }
  });
}

function terminateChild(child, signal = 'SIGTERM') {
  if (!child || child.killed || child.exitCode !== null) {
    return;
  }
  try {
    child.kill(signal);
  } catch {
    // ignore
  }
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  if (bootTimer) {
    clearTimeout(bootTimer);
  }
  for (const state of taskState.values()) {
    terminateChild(state.child, 'SIGTERM');
  }
  setTimeout(() => {
    for (const state of taskState.values()) {
      terminateChild(state.child, 'SIGKILL');
    }
    process.exit(code);
  }, 500);
}

function spawnTask(task) {
  const child = spawn(npmCommand, ['run', task.script], {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  const state = {
    task,
    child,
    ready: false,
    logs: [],
  };

  taskState.set(task.name, state);

  attachStream(state, child.stdout, 'stdout');
  attachStream(state, child.stderr, 'stderr');

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }
    const stage = state.ready ? 'runtime' : 'boot';
    const reason = typeof code === 'number' ? `code ${code}` : `signal ${signal || 'unknown'}`;
    console.error(`[dev-serve] ${state.task.description} exited during ${stage} with ${reason}.`);
    printDiagnostics(state);
    shutdown(typeof code === 'number' ? code : 1);
  });

  child.on('error', (error) => {
    if (shuttingDown) {
      return;
    }
    console.error(`[dev-serve] Failed to start ${state.task.description}: ${error.message}`);
    recordLog(state, error.stack || error.message, 'stderr');
    printDiagnostics(state);
    shutdown(1);
  });
}

function scheduleBootWatchdog() {
  if (bootTimeoutMs <= 0) {
    return;
  }
  bootTimer = setTimeout(() => {
    for (const state of taskState.values()) {
      if (!state.ready) {
        console.error(
          `[dev-serve] ${state.task.description} has not reported ready after ${Math.round(bootTimeoutMs / 1000)}s.`,
        );
        printDiagnostics(state);
      }
    }
  }, bootTimeoutMs);
}

ensureBaseEnv();

console.log('[dev-serve] Starting full dev stack (HTTP + UI) with diagnostics.');

tasks.forEach((task) => spawnTask(task));
scheduleBootWatchdog();

['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((signal) => {
  process.on(signal, () => shutdown(0));
});

process.on('uncaughtException', (error) => {
  console.error('[dev-serve] Uncaught exception:', error);
  shutdown(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[dev-serve] Unhandled promise rejection:', reason);
  shutdown(1);
});


