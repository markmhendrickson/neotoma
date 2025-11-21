import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

type BranchPorts = {
  httpPort: number;
  vitePort: number;
  wsPort: number;
};

async function runGetBranchPorts(): Promise<BranchPorts> {
  const scriptPath = path.join(repoRoot, 'scripts', 'get-branch-ports.js');
  const { stdout } = await execFileAsync('node', [scriptPath], {
    cwd: repoRoot,
  });

  const ports: Partial<BranchPorts> = {};
  for (const line of stdout.trim().split('\n')) {
    const [key, value] = line.split('=');
    if (!key || !value) {
      continue;
    }
    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
      continue;
    }
    if (key === 'HTTP_PORT') {
      ports.httpPort = numeric;
    } else if (key === 'VITE_PORT') {
      ports.vitePort = numeric;
    } else if (key === 'WS_PORT') {
      ports.wsPort = numeric;
    }
  }

  if (
    typeof ports.httpPort !== 'number' ||
    typeof ports.vitePort !== 'number' ||
    typeof ports.wsPort !== 'number'
  ) {
    throw new Error(`Unable to parse branch ports from:\n${stdout}`);
  }

  return ports as BranchPorts;
}

export async function getBranchPorts(): Promise<BranchPorts> {
  return runGetBranchPorts();
}

function ensureValue(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return '';
}

export function buildBackendEnv(port: number): NodeJS.ProcessEnv {
  const supabaseUrl =
    ensureValue(process.env.DEV_SUPABASE_URL, process.env.SUPABASE_URL) ||
    'https://example.supabase.co';
  const supabaseKey =
    ensureValue(
      process.env.DEV_SUPABASE_SERVICE_KEY,
      process.env.SUPABASE_SERVICE_KEY,
    ) || 'test-service-role-key';
  const connectorSecret =
    ensureValue(
      process.env.CONNECTOR_SECRET_KEY,
      process.env.CONNECTOR_SECRETS_KEY,
    ) || 'test-connector-secret-test-connector-secret';
  const bearer =
    process.env.ACTIONS_BEARER_TOKEN ||
    randomBytes(32).toString('base64url');

  return {
    ...process.env,
    NODE_ENV: 'test',
    HTTP_PORT: String(port),
    PORT: String(port),
    ACTIONS_BEARER_TOKEN: bearer,
    CONNECTOR_SECRET_KEY: connectorSecret,
    CONNECTOR_SECRETS_KEY: connectorSecret,
    DEV_SUPABASE_URL: supabaseUrl,
    DEV_SUPABASE_SERVICE_KEY: supabaseKey,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_KEY: supabaseKey,
    NEOTOMA_ACTIONS_DISABLE_AUTOSTART: '0',
  };
}

export function buildFrontendEnv(
  vitePort: number,
  apiPort: number,
): NodeJS.ProcessEnv {
  const apiBase =
    process.env.VITE_API_BASE_URL || `http://127.0.0.1:${apiPort}`;

  return {
    ...process.env,
    NODE_ENV: 'test',
    VITE_PORT: String(vitePort),
    PORT: String(vitePort),
    VITE_API_BASE_URL: apiBase,
    NEOTOMA_ACTIONS_DISABLE_AUTOSTART: '0',
  };
}

type WaitOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  expectedStatus?: number | ((status: number) => boolean);
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForHttp(
  url: string,
  { timeoutMs = 60_000, intervalMs = 1_000, expectedStatus }: WaitOptions = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      const ok =
        typeof expectedStatus === 'function'
          ? expectedStatus(response.status)
          : expectedStatus
          ? response.status === expectedStatus
          : response.ok;
      if (ok) {
        return;
      }
      lastError = new Error(`Unexpected status ${response.status} for ${url}`);
    } catch (error) {
      lastError = error;
    }
    await delay(intervalMs);
  }

  const reason =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Timed out waiting for ${url}: ${reason}`);
}

export { repoRoot };



