import { execFile } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildSampleRecords } from '../../frontend/src/sample-data/sample-records.js';
import type { LocalRecord } from '../../frontend/src/store/types';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const encoder = new TextEncoder();

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
  options: { apiBaseOverride?: string } = {},
): NodeJS.ProcessEnv {
  const apiBase =
    options.apiBaseOverride ||
    process.env.VITE_API_BASE_URL ||
    `http://127.0.0.1:${apiPort}`;

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
    summary: overrides.summary ?? 'Mock record generated during tests',
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
  const startServer = async (desiredPort: number): Promise<MockApiServer> => {
    const origin = `http://127.0.0.1:${desiredPort}`;
    const recordStore = new Map<string, LocalRecord>();

    const seedRecords = (records: LocalRecord[] = buildSampleRecords()) => {
      recordStore.clear();
      for (const record of records) {
        recordStore.set(record.id, record);
      }
    };

    const clearRecords = () => {
      recordStore.clear();
    };

    const listRecords = () => Array.from(recordStore.values());

    seedRecords(options.initialRecords);

    const server = createServer(async (req, res) => {
      if (!req.url) {
        respondJson(res, 400, { error: 'Missing URL' });
        return;
      }
      const requestUrl = new URL(req.url, origin);
      if (req.method === 'GET' && requestUrl.pathname === '/health') {
        respondJson(res, 200, { status: 'ok' });
        return;
      }

    if (req.method === 'GET' && requestUrl.pathname === '/api/types') {
      const types = Array.from(new Set(listRecords().map((record) => record.type))).sort();
      respondJson(res, 200, { types });
      return;
    }

    if (req.method === 'POST' && requestUrl.pathname === '/api/retrieve_records') {
      const payload = await parseJsonBody(req);
      respondJson(res, 200, filterRecords(listRecords(), payload));
      return;
    }

    if (req.method === 'POST' && requestUrl.pathname === '/api/chat') {
      const payload = await parseJsonBody(req);
      if (process.env.MOCK_API_VERBOSE === '1') {
        console.log('[MockApi] /api/chat', { messages: payload?.messages?.length ?? 0 });
      }
      const latestRecord = listRecords()[0];
      const assistantMessage = latestRecord
        ? `Mock response referencing record ${latestRecord.summary ?? latestRecord.id}`
        : 'Mock response with no records available';
      const invoiceRecords = filterRecords(listRecords(), { type: 'invoice' }).filter(
        (record) => typeof record.properties?.amount_due === 'number',
      );
      const visualization =
        invoiceRecords.length > 0
          ? {
              graphType: 'bar',
              justification: 'Mock invoice totals by vendor',
              datasetLabel: 'Sample invoices',
              recordIds: invoiceRecords.slice(0, 3).map((record) => record.id),
              dimensionField: { key: 'vendor', label: 'Vendor', kind: 'category' },
              measureFields: [{ key: 'amount_due', label: 'Amount Due' }],
            }
          : undefined;
      respondJson(res, 200, {
        message: { content: assistantMessage },
        records_queried: filterRecords(listRecords(), { limit: 3 }),
        visualization,
        echo: payload?.messages ?? [],
      });
      if (process.env.MOCK_API_VERBOSE === '1') {
        console.log('[MockApi] /api/chat response', { assistantMessage });
      }
      return;
    }

    if (req.method === 'POST' && requestUrl.pathname === '/api/upload_file') {
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

    if (req.method === 'POST' && requestUrl.pathname === '/api/analyze_file') {
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

      if (req.method === 'GET' && requestUrl.pathname === '/api/get_file_url') {
        const filePath = requestUrl.searchParams.get('file_path') ?? '';
        respondJson(res, 200, {
          url: `${origin}/${filePath.replace(/^\/+/, '')}`,
        });
        return;
      }

      respondJson(res, 404, { error: 'Not Found' });
    });

    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(desiredPort, '127.0.0.1', resolve);
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      server.close();
      if (code === 'EADDRINUSE') {
        return startServer(desiredPort + 1);
      }
      throw error;
    }

    return {
      origin,
      seedRecords,
      clearRecords,
      listRecords,
      close: () =>
        new Promise<void>((resolve, reject) => {
          server.close((err) => {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          });
        }),
    };
  };

  return startServer(port);
}

export { repoRoot };



