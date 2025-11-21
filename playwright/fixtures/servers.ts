import { test as base } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  buildBackendEnv,
  buildFrontendEnv,
  getBranchPorts,
  waitForHttp,
  repoRoot,
} from '../utils/servers.js';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

type RunningServers = {
  backend: ChildProcessWithoutNullStreams;
  frontend: ChildProcessWithoutNullStreams;
  apiUrl: string;
  uiUrl: string;
  bearerToken: string;
};

function drainStream(child: ChildProcessWithoutNullStreams, label: string) {
  const verbose = process.env.PLAYWRIGHT_VERBOSE_SERVERS === '1';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    if (verbose) {
      process.stdout.write(`[${label}] ${chunk}`);
    }
  });
  child.stderr.on('data', (chunk: string) => {
    if (verbose) {
      process.stderr.write(`[${label}] ${chunk}`);
    }
  });
}

async function startServers(): Promise<RunningServers> {
  const ports = await getBranchPorts();
  const backendEnv = buildBackendEnv(ports.httpPort);
  const frontendEnv = buildFrontendEnv(ports.vitePort, ports.httpPort);

  const backend = spawn(npmCommand, ['run', 'dev:http'], {
    cwd: repoRoot,
    env: backendEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  drainStream(backend, 'backend');

  await waitForHttp(`http://127.0.0.1:${ports.httpPort}/health`);

  const frontend = spawn(npmCommand, ['run', 'dev:ui'], {
    cwd: repoRoot,
    env: frontendEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  drainStream(frontend, 'frontend');

  await waitForHttp(`http://127.0.0.1:${ports.vitePort}`);

  const apiUrl = `http://127.0.0.1:${ports.httpPort}/api`;
  const uiUrl = `http://127.0.0.1:${ports.vitePort}`;

  return {
    backend,
    frontend,
    apiUrl,
    uiUrl,
    bearerToken: backendEnv.ACTIONS_BEARER_TOKEN ?? '',
  };
}

function terminate(child?: ChildProcessWithoutNullStreams | null) {
  if (!child) {
    return;
  }
  if (child.exitCode !== null || child.killed) {
    return;
  }
  child.kill('SIGTERM');
  setTimeout(() => {
    if (child.exitCode === null && !child.killed) {
      child.kill('SIGKILL');
    }
  }, 2_000);
}

type ServersFixture = {
  apiBaseUrl: string;
  uiBaseUrl: string;
  bearerToken: string;
};

export const test = base.extend<
  ServersFixture & { servers: RunningServers }
>({
  servers: [
    async ({}, use) => {
      const servers = await startServers();
      process.env.PLAYWRIGHT_UI_BASE_URL = servers.uiUrl;
      process.env.PLAYWRIGHT_API_BASE_URL = servers.apiUrl;
      process.env.ACTIONS_BEARER_TOKEN = servers.bearerToken;

      try {
        await use(servers);
      } finally {
        terminate(servers.frontend);
        terminate(servers.backend);
      }
    },
    { scope: 'worker', auto: true },
  ],
  apiBaseUrl: [
    async ({ servers }, use) => {
      await use(servers.apiUrl);
    },
    { scope: 'worker' },
  ],
  uiBaseUrl: [
    async ({ servers }, use) => {
      await use(servers.uiUrl);
    },
    { scope: 'worker' },
  ],
  bearerToken: [
    async ({ servers }, use) => {
      await use(servers.bearerToken);
    },
    { scope: 'worker' },
  ],
});

export const expect = base.expect;

