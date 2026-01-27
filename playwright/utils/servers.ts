import { execFile, spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { x25519, ed25519 } from '@noble/curves/ed25519.js';
import { generateX25519KeyPair, generateEd25519KeyPair, deriveBearerToken } from '../../src/crypto/keys.js';
import { exportKeyPairs } from '../../src/crypto/export.js';
import type { KeyExport, X25519KeyPair, Ed25519KeyPair } from '../../src/crypto/types.js';
import type { LocalRecord } from '../../frontend/src/store/types';
import { buildSampleRecords } from '../../frontend/src/sample-data/sample-records';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const PLAYWRIGHT_PORT_FILE = path.join(repoRoot, '.branch-ports', 'playwright.json');

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

export type KeyExportBundle = {
  x25519: KeyExport;
  ed25519: KeyExport;
};

export type TestCredentials = {
  bearerToken: string;
  keyExports: KeyExportBundle;
};

function deriveDeterministicBytes(seed: string, context: string): Uint8Array {
  const digest = createHash('sha256').update(`${seed}:${context}`).digest();
  return new Uint8Array(digest);
}

function clampX25519PrivateKey(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes);
  copy[0] &= 248;
  copy[31] &= 127;
  copy[31] |= 64;
  return copy;
}

function createDeterministicX25519KeyPair(seed: string): X25519KeyPair {
  const privateKey = clampX25519PrivateKey(deriveDeterministicBytes(seed, 'x25519'));
  const publicKey = x25519.getPublicKey(privateKey);
  return { type: 'x25519', privateKey, publicKey };
}

function createDeterministicEd25519KeyPair(seed: string): Ed25519KeyPair {
  const privateKey = deriveDeterministicBytes(seed, 'ed25519');
  const publicKey = ed25519.getPublicKey(privateKey);
  return { type: 'ed25519', privateKey, publicKey };
}

export async function createTestCredentials(): Promise<TestCredentials> {
  const deterministicSeed = process.env.PLAYWRIGHT_TEST_SEED?.trim();
  const x25519 = deterministicSeed
    ? createDeterministicX25519KeyPair(deterministicSeed)
    : await generateX25519KeyPair();
  const ed25519 = deterministicSeed
    ? createDeterministicEd25519KeyPair(deterministicSeed)
    : await generateEd25519KeyPair();
  const keyExports = exportKeyPairs(x25519, ed25519);
  const bearerToken = deriveBearerToken(ed25519.publicKey);
  return { bearerToken, keyExports };
}

function ensureValue(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return '';
}

export function buildBackendEnv(
  port: number,
  options: { bearerToken: string; wsPort?: number },
): NodeJS.ProcessEnv {
  // Test environment: Prefer local Supabase if running, otherwise use remote
  // Check if local Supabase is running (default ports)
  const useLocalSupabase = process.env.USE_LOCAL_SUPABASE === '1' || 
    process.env.DEV_SUPABASE_URL?.includes('127.0.0.1') ||
    process.env.DEV_SUPABASE_URL?.includes('localhost');
  
  let supabaseUrl: string;
  let supabaseKey: string;
  
  if (useLocalSupabase) {
    // Force local Supabase so E2E never hits remote
    supabaseUrl = 'http://127.0.0.1:54321';
    supabaseKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'; // supabase start default service role key
  } else {
    // Remote Supabase (existing logic)
    const supabaseProjectId = process.env.DEV_SUPABASE_PROJECT_ID;
    supabaseUrl = supabaseProjectId
      ? `https://${supabaseProjectId}.supabase.co`
      : ensureValue(process.env.DEV_SUPABASE_URL) || 'https://example.supabase.co';
    supabaseKey = ensureValue(process.env.DEV_SUPABASE_SERVICE_KEY) || 'test-service-role-key';
  }
  const connectorSecret =
    ensureValue(
      process.env.DEV_CONNECTOR_SECRET_KEY,
      // Backward compatibility: support generic name during transition
      process.env.CONNECTOR_SECRET_KEY,
      process.env.CONNECTOR_SECRETS_KEY,
    ) || 'test-connector-secret-test-connector-secret';
  const bearer = options.bearerToken;
  const wsPort = options.wsPort;

  return {
    ...process.env,
    NODE_ENV: 'test',
    BRANCH_PORTS_FILE: PLAYWRIGHT_PORT_FILE,
    HTTP_PORT: String(port),
    PORT: String(port),
    ...(wsPort ? { WS_PORT: String(wsPort) } : {}),
    ACTIONS_BEARER_TOKEN: bearer,
    CONNECTOR_SECRET_KEY: connectorSecret,
    CONNECTOR_SECRETS_KEY: connectorSecret,
    DEV_SUPABASE_URL: supabaseUrl,
    DEV_SUPABASE_SERVICE_KEY: supabaseKey,
    NEOTOMA_ACTIONS_DISABLE_AUTOSTART: '0',
  };
}

export type BuildFrontendEnvOptions = {
  /** When true, always use local Supabase URL/keys (for E2E fixture so frontend never hits remote). */
  forceLocalSupabase?: boolean;
};

export function buildFrontendEnv(
  vitePort: number,
  apiPort: number,
  wsPort?: number,
  options: BuildFrontendEnvOptions = {},
): NodeJS.ProcessEnv {
  const useLocalSupabase =
    options.forceLocalSupabase === true ||
    process.env.USE_LOCAL_SUPABASE === '1' ||
    process.env.VITE_SUPABASE_URL?.includes('127.0.0.1') ||
    process.env.VITE_SUPABASE_URL?.includes('localhost');

  let supabaseUrl: string;
  let supabaseAnonKey: string;

  if (useLocalSupabase) {
    // Force local Supabase so E2E never hits remote (avoids 429 and test pollution)
    supabaseUrl = 'http://127.0.0.1:54321';
    supabaseAnonKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'; // supabase start default anon key
  } else {
    // Remote Supabase (existing logic)
    const supabaseProjectId = process.env.DEV_SUPABASE_PROJECT_ID;
    supabaseUrl = supabaseProjectId
      ? `https://${supabaseProjectId}.supabase.co`
      : ensureValue(process.env.VITE_SUPABASE_URL) || 'https://example.supabase.co';
    supabaseAnonKey = ensureValue(process.env.VITE_SUPABASE_ANON_KEY) || 'test-anon-key';
  }
  const apiBase =
    process.env.VITE_API_BASE_URL || `http://127.0.0.1:${apiPort}`;

  return {
    ...process.env,
    NODE_ENV: 'test',
    BRANCH_PORTS_FILE: PLAYWRIGHT_PORT_FILE,
    VITE_PORT: String(vitePort),
    PORT: String(vitePort),
    HTTP_PORT: String(apiPort),
    ...(wsPort ? { WS_PORT: String(wsPort) } : {}),
    VITE_API_BASE_URL: apiBase,
    VITE_SUPABASE_URL: supabaseUrl,
    VITE_SUPABASE_ANON_KEY: supabaseAnonKey,
    NEOTOMA_ACTIONS_DISABLE_AUTOSTART: '0',
  };
}

type WaitOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  expectedStatus?: number | ((status: number) => boolean);
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const LOCAL_SUPABASE_API_URL = 'http://127.0.0.1:54321';
const LOCAL_SUPABASE_START_TIMEOUT_MS = 120_000;
const LOCAL_SUPABASE_HEALTH_POLL_MS = 30_000;
const LOCAL_SUPABASE_HEALTH_CHECK_MS = 3_000;

/**
 * Returns true if local Supabase API (Kong at 54321) responds.
 */
async function isLocalSupabaseUp(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), LOCAL_SUPABASE_HEALTH_CHECK_MS);
    const res = await fetch(`${LOCAL_SUPABASE_API_URL}/`, {
      signal: controller.signal,
    });
    clearTimeout(id);
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

/**
 * When USE_LOCAL_SUPABASE=1 and PLAYWRIGHT_START_SUPABASE=1, ensures local
 * Supabase is running: if the API is not reachable, runs `supabase start` from
 * repo root and waits until the API responds. No-op otherwise. Call from
 * Playwright globalSetup so it runs once before workers.
 */
export async function ensureLocalSupabase(): Promise<void> {
  if (process.env.USE_LOCAL_SUPABASE !== '1' || process.env.PLAYWRIGHT_START_SUPABASE !== '1') {
    return;
  }
  if (await isLocalSupabaseUp()) {
    return;
  }
  const supabaseCmd = process.platform === 'win32' ? 'supabase.cmd' : 'supabase';
  await new Promise<void>((resolve, reject) => {
    const child = spawn(supabaseCmd, ['start'], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`supabase start timed out after ${LOCAL_SUPABASE_START_TIMEOUT_MS / 1000}s`));
    }, LOCAL_SUPABASE_START_TIMEOUT_MS);
    let stderr = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on('close', (code: number | null, signal: string | null) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `supabase start exited with code ${code}${signal ? ` signal ${signal}` : ''}. ${stderr.slice(-500)}`,
          ),
        );
      }
    });
  });
  await waitForHttp(`${LOCAL_SUPABASE_API_URL}/`, {
    timeoutMs: LOCAL_SUPABASE_HEALTH_POLL_MS,
    intervalMs: 2_000,
    expectedStatus: (s) => s === 200 || s === 404,
  });
}

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


type MockApiServerControls = {
  seedRecords: (records?: LocalRecord[]) => void;
  clearRecords: () => void;
  listRecords: () => LocalRecord[];
};

export type MockApiServer = MockApiServerControls & {
  origin: string;
  close: () => Promise<void>;
};

function respondJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function parseJsonBody(req: IncomingMessage): Promise<any> {
  try {
    const body = await readRequestBody(req);
    if (!body.length) {
      return {};
    }
    return JSON.parse(body.toString('utf8'));
  } catch {
    return {};
  }
}

function buildMockRecord(overrides: Partial<LocalRecord> = {}): LocalRecord {
  const timestamp = new Date().toISOString();
  return {
    id: overrides.id ?? randomUUID(),
    type: overrides.type ?? 'note',
    summary:
      overrides.summary ?? 'Mock record generated during Playwright tests',
    properties: overrides.properties ?? { source: 'mock-api' },
    file_urls: overrides.file_urls ?? [],
    embedding: overrides.embedding ?? null,
    created_at: overrides.created_at ?? timestamp,
    updated_at: overrides.updated_at ?? timestamp,
  };
}

function filterRecords(
  records: LocalRecord[],
  payload: { type?: string; search?: string[]; limit?: number } = {},
): LocalRecord[] {
  let results = [...records];
  if (payload.type) {
    results = results.filter((record) => record.type === payload.type);
  }
  if (Array.isArray(payload.search) && payload.search.length > 0) {
    const terms = payload.search.map((term) => String(term).toLowerCase());
    results = results.filter((record) => {
      const haystack = JSON.stringify(record).toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }
  if (typeof payload.limit === 'number' && Number.isFinite(payload.limit)) {
    results = results.slice(0, Math.max(0, payload.limit));
  }
  return results;
}

export async function startMockApiServer(
  port: number,
  options: { initialRecords?: LocalRecord[] } = {},
): Promise<MockApiServer> {
  let origin = `http://127.0.0.1:${port}`;
  const recordStore = new Map<string, LocalRecord>();

  const seedRecords = (records: LocalRecord[] = buildSampleRecords()) => {
    recordStore.clear();
    for (const record of records) {
      recordStore.set(record.id, record);
    }
  };

  const clearRecords = () => recordStore.clear();
  const listRecords = () => Array.from(recordStore.values());

  seedRecords(options.initialRecords);

  const matchesRoute = (pathname: string, route: string) => {
    if (pathname === route) {
      return true;
    }
    if (route.startsWith('/api')) {
      const trimmed = route.replace(/^\/api/, '') || '/';
      return pathname === trimmed;
    }
    return false;
  };

  const verboseMockApi = process.env.PLAYWRIGHT_VERBOSE_SERVERS === '1';

  const server = createServer(async (req, res) => {
    if (!req.url) {
      respondJson(res, 400, { error: 'Missing URL' });
      return;
    }

    const requestUrl = new URL(req.url, origin);
    if (verboseMockApi) {
      console.log(`[mock-api] ${req.method ?? 'UNKNOWN'} ${requestUrl.pathname}`);
    }

    if (req.method === 'GET' && matchesRoute(requestUrl.pathname, '/health')) {
      respondJson(res, 200, { status: 'ok' });
      return;
    }

    if (req.method === 'GET' && matchesRoute(requestUrl.pathname, '/api/types')) {
      const types = Array.from(
        new Set(listRecords().map((record) => record.type)),
      ).sort();
      respondJson(res, 200, { types });
      return;
    }

    if (req.method === 'POST' && matchesRoute(requestUrl.pathname, '/api/retrieve_records')) {
      const payload = await parseJsonBody(req);
      respondJson(res, 200, filterRecords(listRecords(), payload));
      return;
    }

    if (req.method === 'POST' && matchesRoute(requestUrl.pathname, '/api/chat')) {
      await parseJsonBody(req);
      const latestRecord = listRecords()[0];
      const assistantMessage = latestRecord
        ? `Mock response referencing record ${
            latestRecord.summary ?? latestRecord.id
          }`
        : 'Mock response with no records available';
      if (verboseMockApi) {
        console.log(`[mock-api] <- ${assistantMessage}`);
      }
      respondJson(res, 200, {
        message: { content: assistantMessage },
        records_queried: filterRecords(listRecords(), { limit: 3 }),
      });
      return;
    }

    if (req.method === 'POST' && matchesRoute(requestUrl.pathname, '/api/upload_file')) {
      const body = await readRequestBody(req);
      const created = buildMockRecord({
        type: 'file_asset',
        summary: `Uploaded file (${body.length} bytes)`,
        properties: {
          size_bytes: body.length,
          source: 'mock-upload',
        },
        file_urls: [`files/${randomUUID()}.bin`],
      });
      recordStore.set(created.id, created);
      respondJson(res, 200, created);
      return;
    }

    if (req.method === 'POST' && matchesRoute(requestUrl.pathname, '/api/analyze_file')) {
      const body = await readRequestBody(req);
      respondJson(res, 200, {
        type: 'analysis_result',
        properties: {
          bytes: body.length,
          analyzed_at: new Date().toISOString(),
        },
        summary: 'File analyzed via mock API',
      });
      return;
    }

    if (req.method === 'GET' && matchesRoute(requestUrl.pathname, '/api/get_file_url')) {
      const filePath = requestUrl.searchParams.get('file_path') ?? '';
      respondJson(res, 200, {
        url: `${origin}/${filePath.replace(/^\/+/, '')}`,
      });
      return;
    }

    respondJson(res, 404, { error: 'Not Found' });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, resolve);
  });
  const address = server.address();
  if (address && typeof address === 'object' && 'port' in address) {
    const addrPort = Number((address as { port: number }).port);
    if (Number.isFinite(addrPort)) {
      origin = `http://127.0.0.1:${addrPort}`;
    }
  }

  return {
    origin,
    seedRecords,
    clearRecords,
    listRecords,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

export { repoRoot };
