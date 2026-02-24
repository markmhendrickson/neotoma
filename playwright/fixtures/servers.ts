import { test as base } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  buildBackendEnv,
  buildFrontendEnv,
  getBranchPorts,
  waitForHttp,
  repoRoot,
  createTestCredentials,
  startMockApiServer,
  type KeyExportBundle,
  type MockApiServer,
} from '../utils/servers.js';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

type RunningServers = {
  backend: ChildProcessWithoutNullStreams;
  frontend: ChildProcessWithoutNullStreams;
  apiUrl: string;
  uiUrl: string;
  bearerToken: string;
  keyExports: KeyExportBundle;
  mockApi?: MockApiServer;
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
  const useMockApi = process.env.PLAYWRIGHT_USE_MOCK_API !== '0';
  const ports = await getBranchPorts();
  const credentials = await createTestCredentials();
  const backendEnv = buildBackendEnv(ports.httpPort, {
    bearerToken: credentials.bearerToken,
    wsPort: ports.wsPort,
  });
  const frontendEnv = buildFrontendEnv(ports.vitePort, ports.httpPort, ports.wsPort);

  const backend = spawn(npmCommand, ['run', 'dev:server'], {
    cwd: repoRoot,
    env: backendEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  drainStream(backend, 'backend');
  await waitForHttp(`http://127.0.0.1:${ports.httpPort}/health`);

  let mockApi: MockApiServer | undefined;
  if (useMockApi) {
    mockApi = await startMockApiServer(0);
    await waitForHttp(`${mockApi.origin}/health`);
  }

  const frontend = spawn(npmCommand, ['run', 'dev:ui'], {
    cwd: repoRoot,
    env: frontendEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  drainStream(frontend, 'frontend');

  await waitForHttp(`http://localhost:${ports.vitePort}`);

  const apiUrl = `http://127.0.0.1:${ports.httpPort}/api`;
  const uiUrl = `http://localhost:${ports.vitePort}`;

  return {
    backend,
    frontend,
    apiUrl,
    uiUrl,
    bearerToken: credentials.bearerToken,
    keyExports: credentials.keyExports,
    mockApi,
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
  mcpBaseUrl: string;
  bearerToken: string;
  keyExports: KeyExportBundle;
  mockApi?: MockApiServer;
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
      process.env.NEOTOMA_TEST_KEY_EXPORTS = JSON.stringify(
        servers.keyExports,
      );

      try {
        await use(servers);
      } finally {
        terminate(servers.frontend);
        terminate(servers.backend);
        if (servers.mockApi) {
          await servers.mockApi.close();
        }
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
  keyExports: [
    async ({ servers }, use) => {
      await use(servers.keyExports);
    },
    { scope: 'worker' },
  ],
  mockApi: [
    async ({ servers }, use) => {
      await use(servers.mockApi);
    },
    { scope: 'worker' },
  ],
  mcpBaseUrl: [
    async ({ servers }, use) => {
      // MCP actions are exposed via HTTP API endpoints
      // Use the same base URL as apiBaseUrl
      await use(servers.apiUrl);
    },
    { scope: 'worker' },
  ],
});

export const expect = base.expect;

