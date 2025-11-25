import { test as base } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  buildFrontendEnv,
  getBranchPorts,
  waitForHttp,
  repoRoot,
  startMockApiServer,
} from '../utils/servers.js';
import type { MockApiServer } from '../utils/servers.js';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

type RunningServers = {
  frontend: ChildProcessWithoutNullStreams;
  mockApi: MockApiServer;
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
  const branchPortDir = mkdtempSync(`${tmpdir()}/neotoma-playwright-`);
  const branchPortsFile = `${branchPortDir}/ports.json`;
  writeFileSync(
    branchPortsFile,
    JSON.stringify(
      {
        pid: process.pid,
        createdAt: Date.now(),
        ports,
      },
      null,
      2,
    ),
  );

  const mockApi = await startMockApiServer(ports.httpPort);
  const effectiveHttpPort = Number(new URL(mockApi.origin).port);
  const apiBaseUrl = `${mockApi.origin}/api`;

  const sharedEnv = {
    BRANCH_PORTS_FILE: branchPortsFile,
    HTTP_PORT: String(effectiveHttpPort),
    VITE_PORT: String(ports.vitePort),
    WS_PORT: String(ports.wsPort),
    VITE_API_BASE_URL: apiBaseUrl,
    VITE_PROXY_REWRITE_API: 'false',
    MOCK_API_VERBOSE: process.env.MOCK_API_VERBOSE ?? '0',
    VITE_DISABLE_CHAT_ENCRYPTION: 'true',
  };

  const frontendEnv = {
    ...buildFrontendEnv(ports.vitePort, ports.httpPort),
    ...sharedEnv,
  };

  const frontend = spawn(
    npmCommand,
    ['run', 'dev:ui', '--', '--host', '127.0.0.1', '--strictPort'],
    {
      cwd: repoRoot,
      env: frontendEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  drainStream(frontend, 'frontend');

  await waitForHttp(`http://127.0.0.1:${ports.vitePort}`);

  const apiUrl = apiBaseUrl;
  const uiUrl = `http://127.0.0.1:${ports.vitePort}`;

  const cleanupPortsFile = () => {
    try {
      rmSync(branchPortDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  };

  frontend.once('exit', cleanupPortsFile);

  return {
    mockApi,
    frontend,
    apiUrl,
    uiUrl,
    bearerToken: 'mock-e2e-bearer',
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
        await servers.mockApi.close();
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

