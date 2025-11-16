import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { supabase } from './db.js';
import { config } from './config.js';
import { generateEmbedding, getRecordText } from './embeddings.js';
import fs from 'fs';
import path from 'path';
import { detectDateFields, normalizeRow } from './normalize.js';
import { createRecordFromUploadedFile } from './services/file_analysis.js';
import { generateRecordSummary } from './services/summary.js';
import { createLinkToken, exchangePublicToken, buildPlaidItemContext, isPlaidConfigured, normalizePlaidError } from './integrations/plaid/client.js';
import {
  listPlaidItems as listPlaidItemsFromStore,
  getPlaidItemById,
  getPlaidItemByItemId,
  syncPlaidItem,
  upsertPlaidItem as persistPlaidItem,
  redactPlaidItem,
  previewPlaidItemSync,
  type PlaidSyncSummary,
  type SanitizedPlaidItem,
  type PlaidPreviewSummary,
} from './services/plaid_sync.js';
import type { AccountBase } from 'plaid';

const app = express();
// Configure CSP to allow CDN scripts for the uploader and API connects
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://unpkg.com', 'https://cdn.plaid.com'],
      connectSrc: ["'self'", 'http:', 'https:'],
      imgSrc: ["'self'", 'data:'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
      objectSrc: ["'none'"],
      frameSrc: ["'self'", 'https://cdn.plaid.com'],
    },
  },
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// Serve static files from public/ at root
const publicDir = path.join(process.cwd(), 'public');
if (fs.existsSync(publicDir)) {
  app.use('/', express.static(publicDir));
  // Serve index.html for all non-API routes (SPA routing) - but only after auth middleware
  // This will be handled after auth middleware runs
}

// Serve static sandbox UI
const sandboxDir = path.join(process.cwd(), 'public', 'sandbox');
if (fs.existsSync(sandboxDir)) {
  app.use('/sandbox', express.static(sandboxDir));
}

// Favicon (no-auth) to avoid 401 noise when not present on disk
app.get('/favicon.ico', (_req, res) => res.status(204).end());

// Basic redaction helpers for safer debug logs
const SENSITIVE_FIELDS = new Set([
  'token',
  'access_token',
  'accessToken',
  'public_token',
  'publicToken',
  'bearer_token',
  'bearerToken',
  'password',
  'secret',
  'api_key',
  'apiKey',
  'client_secret',
  'clientSecret',
  'authorization',
  'Authorization',
]);

function redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const clone = { ...headers } as Record<string, unknown>;
  if (clone.authorization) clone.authorization = '[REDACTED]';
  if (clone.Authorization) clone.Authorization = '[REDACTED]';
  return clone;
}

function redactSensitiveFields(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveFields);
  }

  const redacted = { ...(obj as Record<string, unknown>) };
  for (const key in redacted) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.has(key) || SENSITIVE_FIELDS.has(lowerKey)) {
      redacted[key] = '[REDACTED]';
    } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
      redacted[key] = redactSensitiveFields(redacted[key]);
    }
  }
  return redacted;
}

function logDebug(event: string, req: express.Request, extra?: Record<string, unknown>): void {
  const safe = {
    method: req.method,
    path: req.path,
    query: redactSensitiveFields(req.query),
    headers: redactHeaders(req.headers as Record<string, unknown>),
    body: redactSensitiveFields(req.body),
    ...(extra ? redactSensitiveFields(extra) as Record<string, unknown> : {}),
  };
  // eslint-disable-next-line no-console
  console.debug(`[DEBUG] ${event}`, safe);
}

function logWarn(event: string, req: express.Request, extra?: Record<string, unknown>): void {
  const safe = {
    method: req.method,
    path: req.path,
    query: redactSensitiveFields(req.query),
    headers: redactHeaders(req.headers as Record<string, unknown>),
    body: redactSensitiveFields(req.body),
    ...(extra ? redactSensitiveFields(extra) as Record<string, unknown> : {}),
  };
  // eslint-disable-next-line no-console
  console.warn(`[WARN] ${event}`, safe);
}

function logError(event: string, req: express.Request, error: unknown, extra?: Record<string, unknown>): void {
  const payload = {
    method: req.method,
    path: req.path,
    query: redactSensitiveFields(req.query),
    headers: redactHeaders(req.headers as Record<string, unknown>),
    body: redactSensitiveFields(req.body),
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : redactSensitiveFields(error),
    ...(extra ? redactSensitiveFields(extra) as Record<string, unknown> : {}),
  };
  // eslint-disable-next-line no-console
  console.error(`[ERROR] ${event}`, payload);
}

function plaidConfiguredOrError(res: express.Response): boolean {
  if (isPlaidConfigured()) {
    return true;
  }
  res.status(500).json({ error: 'Plaid integration not configured on server' });
  return false;
}

function summarizePlaidAccount(account: AccountBase) {
  const balances = account.balances || {};
  return {
    account_id: account.account_id,
    name: account.name,
    official_name: account.official_name,
    mask: account.mask,
    type: account.type,
    subtype: account.subtype,
    balances: {
      available: balances.available ?? null,
      current: balances.current ?? null,
      iso_currency_code: balances.iso_currency_code ?? null,
      unofficial_currency_code: balances.unofficial_currency_code ?? null,
    },
  };
}

// Public health endpoint (no auth)
app.get('/health', (_req, res) => {
  return res.json({ ok: true });
});

// Simple bearer token auth middleware with bypass for openapi, health, and preflight
const AUTH_TOKEN = process.env.ACTIONS_BEARER_TOKEN || '';
app.use((req, res, next) => {
  if (
    req.method === 'OPTIONS' ||
    (req.method === 'GET' && (
      req.path === '/openapi.yaml' ||
      req.path === '/health' ||
      req.path === '/sandbox/config' ||
      req.path === '/import/plaid/link_demo' ||
      req.path === '/plaid/link_demo'
    ))
  ) {
    return next();
  }
  if (!AUTH_TOKEN) {
    logError('AuthConfigMissing', req, new Error('ACTIONS_BEARER_TOKEN missing'));
    return res.status(500).json({ error: 'Server not configured: ACTIONS_BEARER_TOKEN missing' });
  }

  const headerAuth = req.headers.authorization || '';

  if (headerAuth.startsWith('Bearer ')) {
    const token = headerAuth.slice('Bearer '.length);
    if (token !== AUTH_TOKEN) {
      logWarn('AuthInvalidToken', req);
      return res.status(403).json({ error: 'Invalid token' });
    }
    return next();
  }

  logWarn('AuthMissingBearer', req);
  return res.status(401).json({ error: 'Missing Bearer token' });
});

// Schemas
const StoreSchema = z.object({
  type: z.string(),
  properties: z.record(z.unknown()).default({}),
  file_urls: z.array(z.string()).optional(),
  embedding: z.array(z.number()).optional(),
});

const UpdateSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
  file_urls: z.array(z.string()).optional(),
  embedding: z.array(z.number()).optional(),
});

const RetrieveSchema = z.object({
  type: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
  limit: z.number().int().positive().max(500).optional(),
  search: z.array(z.string()).optional(),
  search_mode: z.enum(['semantic', 'keyword', 'both']).optional().default('both'),
    similarity_threshold: z.number().min(0).max(1).optional().default(0.3),
  query_embedding: z.array(z.number()).optional(),
});

const StoreRecordsSchema = z.object({
  records: z.array(StoreSchema).min(1).max(100),
});

const DeleteRecordsSchema = z.object({
  ids: z.array(z.string()).min(1).max(100),
});

// Endpoints
app.get('/types', async (req, res) => {
  const { data, error } = await supabase.from('records').select('type').limit(1000);
  if (error) {
    logError('SupabaseError:types', req, error);
    return res.status(500).json({ error: error.message });
  }
  const set = new Set<string>();
  (data || []).forEach((r: any) => { if (r.type) set.add(r.type); });
  return res.json({ types: Array.from(set).sort() });
});

app.post('/groom/preview', async (req, res) => {
  const schema = z.object({ rows: z.array(z.record(z.unknown())).min(1).max(2000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn('ValidationError:groom_preview', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { rows } = parsed.data as any;
  const { data: typeRows } = await supabase.from('records').select('type').limit(1000);
  const existingTypes = Array.from(new Set((typeRows || []).map((r: any) => r.type).filter(Boolean))).sort();

  const normalized = (rows as Array<Record<string, unknown>>).map((row: Record<string, unknown>) => normalizeRow(row, existingTypes));
  const allWarnings = normalized.flatMap(r => r.warnings);
  const dateFieldsSet = new Set<string>();
  rows.slice(0, 50).forEach((r: any) => detectDateFields(r).forEach(f => dateFieldsSet.add(f)));

  return res.json({ normalized, suggestions: { existingTypes, dateFields: Array.from(dateFieldsSet) }, warnings: allWarnings });
});

app.post('/groom/finalize', async (req, res) => {
  const parsed = StoreRecordsSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn('ValidationError:groom_finalize', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { records } = parsed.data;

  // Chunk into 25
  let total = 0;
  for (let i = 0; i < records.length; i += 25) {
    const slice = records.slice(i, i + 25);
    // Prepare embeddings conditionally (reuse store_records logic lightly)
    const prepared = await Promise.all(slice.map(async r => {
      let embedding: number[] | null = null;
      if (Array.isArray(r.embedding) && r.embedding.length > 0) {
        embedding = r.embedding;
      } else if (!r.embedding && config.openaiApiKey) {
        const text = getRecordText(r.type, r.properties);
        embedding = await generateEmbedding(text);
      }
      const out: any = { type: r.type, properties: r.properties, file_urls: r.file_urls || [] };
      if (embedding) out.embedding = embedding;
      return out;
    }));

    const { data, error } = await supabase.from('records').insert(prepared).select('id');
    if (error) {
      logError('SupabaseError:groom_finalize', req, error);
      return res.status(500).json({ error: error.message, saved: total });
    }
    total += data?.length || 0;
  }
  logDebug('Success:groom_finalize', req, { count: total });
  return res.json({ success: true, count: total });
});

// Lightweight assistant endpoint to help propose normalization guidance
app.post('/groom/assist', async (req, res) => {
  const schema = z.object({
    messages: z.array(z.object({ role: z.enum(['user','assistant','system']), content: z.string() })).min(1),
    sample: z.array(z.record(z.unknown())).optional(),
    existingTypes: z.array(z.string()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn('ValidationError:groom_assist', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  if (!config.openaiApiKey) {
    return res.status(400).json({ error: 'OPENAI_API_KEY not configured on server' });
  }
  const { messages, sample, existingTypes } = parsed.data;

  const sys = {
    role: 'system',
    content: [
      'You assist with normalizing CSV rows into Neotoma records.',
      'Tasks:',
      '- Infer or map types to an existing set when possible.',
      '- Propose field transforms, especially datetimes to ISO 8601 UTC.',
      '- Return concise, actionable suggestions.',
      '',
      'CRITICAL OUTPUT FORMAT:',
      'Respond with a short natural-language summary AND a machine-readable JSON block.',
      'JSON schema:',
      '{"actions":[{"type":"set_type","to":"note"},{"type":"map_type","mappings":[{"from":"Red band","to":"exercise"}]},{"type":"set_field","field":"Assistance","to":"${value}!"},{"type":"map_value","field":"Difficulty","mappings":[{"from":"Moderate","to":"Medium"}]},{"type":"append","field":"Assistance","suffix":"!"},{"type":"date_to_iso","field":"Created at"}]}',
      'Place the JSON inside a single fenced ```json code block. Keep within 2,000 tokens.',
    ].join('\n')
  } as const;

  const toolContext = {
    existingTypes: existingTypes || [],
    sample: (sample || []).slice(0, 25),
  };

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [sys, ...messages, { role: 'user', content: `Context: ${JSON.stringify(toolContext).slice(0, 6000)}` }],
        temperature: 0.2,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      logError('OpenAIError:groom_assist', req, text);
      return res.status(502).json({ error: 'Upstream model error' });
    }
    const data = await resp.json() as {
      choices?: Array<{
        message?: { content?: string };
      }>;
    };
    const content = data.choices?.[0]?.message?.content || '';
    return res.json({ message: { role: 'assistant', content } });
  } catch (e: any) {
    logError('Exception:groom_assist', req, e);
    return res.status(500).json({ error: 'Assistant failed' });
  }
});

// Transform endpoint: accepts staged rows and optional instruction, returns modified rows or downloadable file
app.post('/groom/transform', async (req, res) => {
  const schema = z.object({
    rows: z.array(z.record(z.unknown())).min(1).max(20000),
    instruction: z.string().optional(),
    return: z.enum(['json', 'file']).optional().default('json'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn('ValidationError:groom_transform', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { rows, instruction } = parsed.data;

  // Normalize input shape first
  let normalizedRows = rows.map((row) => {
    if (row && typeof row === 'object' && 'properties' in row && 'type' in row) {
      const withStructure = row as Record<string, unknown> & {
        type?: unknown;
        file_urls?: unknown;
        properties?: unknown;
      };
      return {
        type: String(withStructure.type ?? 'unknown'),
        properties:
          typeof withStructure.properties === 'object' && withStructure.properties !== null
            ? (withStructure.properties as Record<string, unknown>)
            : {},
        file_urls: Array.isArray(withStructure.file_urls) ? withStructure.file_urls : [],
      };
    }
    // Raw row → infer minimal structure
    return {
      type: String((row as { type?: unknown }).type ?? 'unknown'),
      properties: row,
      file_urls: [],
    };
  });

  // If instruction present and OpenAI configured, try LLM-based transform
  if (instruction && typeof instruction === 'string' && config.openaiApiKey) {
    const sys = {
      role: 'system',
      content: [
        'You transform staged CSV rows into Neotoma records.',
        'Return ONLY a single JSON object with this exact shape, with concrete values (no placeholders):',
        '{"rows":[{"type":"<string>","properties":{...},"file_urls":["/path"...]}]}',
        'Rules:',
        '- Preserve fields unless instructed to modify.',
        '- Convert any datetime-like strings to ISO 8601 UTC when instructed.',
        '- Ensure every item has a string "type" and object "properties".',
        '- Rows array length MUST equal input length; do not add/remove rows.',
        '- Do NOT include commentary, Markdown, or code fences. Output raw JSON only.',
      ].join('\n')
    } as const;
    const sanitizeRows = (rowsIn: Array<Record<string, unknown>>) => rowsIn.map((row) => {
      const candidate = row as {
        type?: unknown;
        file_urls?: unknown;
        properties?: Record<string, unknown>;
      };
      return {
        type: String(candidate?.type ?? 'unknown'),
        file_urls: Array.isArray(candidate?.file_urls) ? (candidate.file_urls as string[]) : [],
        properties: Object.fromEntries(
          Object.entries(candidate?.properties ?? {})
            .filter(([k]) => /day|date|created|updated|time|name|assistance/i.test(String(k)))
            .slice(0, 40)
            .map(([k, v]) => [k, typeof v === 'string' ? (v as string).slice(0, 200) : v])
        ),
      };
    });
    const safeRows = sanitizeRows(normalizedRows).slice(0, 200);
    const user = {
      role: 'user',
      content: JSON.stringify({ instruction, rows: safeRows }).slice(0, 120000)
    } as const;
    try {
      const ac = new AbortController();
      const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '120000', 10);
      const t0 = Date.now();
      const timeout = setTimeout(() => ac.abort(), LLM_TIMEOUT_MS);
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [sys, user],
        }),
        signal: ac.signal,
      });
      clearTimeout(timeout);
      logWarn('LLMTiming', req, { ms: Date.now() - t0, payload_bytes: JSON.stringify(user).length });
      if (resp.ok) {
        const data = await resp.json() as {
          choices?: Array<{
            message?: { content?: string };
          }>;
        };
        const content: string = data.choices?.[0]?.message?.content || '';
        const jsonText = content;
        try {
          const parsed = JSON.parse(jsonText);
          if (parsed && Array.isArray(parsed.rows)) {
            normalizedRows = parsed.rows.map((r: any) => ({
              type: String(r?.type ?? 'unknown'),
              properties: typeof r?.properties === 'object' && r?.properties !== null ? r.properties : {},
              file_urls: Array.isArray(r?.file_urls) ? r.file_urls : [],
            }));
          }
        } catch (e) {
          // ignore parse errors, fallback to normalizedRows
          logWarn('LLMTransformParseError', req, { message: (e as any)?.message });
        }
      } else {
        const text = await resp.text();
        logWarn('LLMTransformUpstreamError', req, { status: resp.status, text });
      }
    } catch (e: any) {
      logWarn('LLMTransformException', req, { message: e?.message, name: e?.name });
    }
  }

  if ((parsed.data as any).return === 'file') {
    const payload = JSON.stringify({ rows: normalizedRows });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="normalized.json"');
    return res.send(payload);
  }
  return res.json({ rows: normalizedRows });
});

// Expose only safe sandbox defaults for UI auto-fill
app.get('/sandbox/config', async (_req, res) => {
  const userId = config.plaid.linkDefaults?.userId || '';
  const clientName = config.plaid.linkDefaults?.clientName || '';
  return res.json({
    user_id_default: userId,
    client_name_default: clientName,
    products_default: (config.plaid.products || []).join(','),
    redirect_uri_default: config.plaid.redirectUri || '',
  });
});

app.post('/import/plaid/link_token', async (req, res) => {
  if (!plaidConfiguredOrError(res)) {
    return;
  }

  const schema = z.object({
    user_id: z.string().min(1).optional(),
    client_name: z.string().min(1).optional(),
    access_token: z.string().optional(),
    products: z.array(z.string()).min(1).optional(),
    redirect_uri: z.string().url().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn('ValidationError:plaid_link_token', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const response = await createLinkToken({
      userId: parsed.data.user_id || config.plaid.linkDefaults?.userId || '',
      clientName: parsed.data.client_name || config.plaid.linkDefaults?.clientName,
      accessToken: parsed.data.access_token,
      products: parsed.data.products,
      redirectUri: parsed.data.redirect_uri,
    });
    logDebug('Success:plaid_link_token', req, { request_id: response.request_id });
    return res.json(response);
  } catch (error) {
    logError('PlaidError:plaid_link_token', req, error as any);
    const normalized = normalizePlaidError(error) || {
      type: 'unknown_error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    return res.status(502).json({ error: normalized });
  }
});

app.post('/import/plaid/exchange_public_token', async (req, res) => {
  if (!plaidConfiguredOrError(res)) {
    return;
  }

  const schema = z.object({
    public_token: z.string().min(1),
    trigger_initial_sync: z.boolean().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn('ValidationError:plaid_exchange_public_token', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const exchangeResult = await exchangePublicToken(parsed.data.public_token);
    const context = await buildPlaidItemContext(exchangeResult.accessToken);

    const storedItem = await persistPlaidItem({
      itemId: exchangeResult.itemId,
      accessToken: exchangeResult.accessToken,
      environment: config.plaid.environment,
      products: config.plaid.products,
      countryCodes: config.plaid.countryCodes,
      institutionId: context.item.institution_id ?? null,
      institutionName: context.institution?.name ?? null,
      webhookStatus: context.item.webhook ?? null,
    });

    let syncSummary: PlaidSyncSummary | null = null;
    if (parsed.data.trigger_initial_sync) {
      syncSummary = await syncPlaidItem({
        plaidItemId: storedItem.id,
        forceFullSync: true,
      });
    }

    const response = {
      item: redactPlaidItem(storedItem),
      institution: context.institution
        ? {
            id: context.institution.institution_id,
            name: context.institution.name,
            url: context.institution.url,
            primary_color: context.institution.primary_color,
          }
        : context.item.institution_id
        ? {
            id: context.item.institution_id,
            name: storedItem.institution_name,
          }
        : null,
      accounts: context.accounts.map((account) => summarizePlaidAccount(account)),
      request_id: exchangeResult.requestId,
      initial_sync: syncSummary,
    };

    logDebug('Success:plaid_exchange_public_token', req, {
      item_id: storedItem.item_id,
      plaid_item_id: storedItem.id,
      trigger_initial_sync: Boolean(parsed.data.trigger_initial_sync),
    });

    return res.json(response);
  } catch (error) {
    logError('PlaidError:plaid_exchange_public_token', req, error as any);
    const normalized = normalizePlaidError(error) || {
      type: 'unknown_error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    return res.status(502).json({ error: normalized });
  }
});

app.post('/import/plaid/sync', async (req, res) => {
  if (!plaidConfiguredOrError(res)) {
    return;
  }

  const schema = z.object({
    plaid_item_id: z.string().uuid().optional(),
    item_id: z.string().optional(),
    sync_all: z.boolean().optional().default(false),
    force_full_sync: z.boolean().optional().default(false),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn('ValidationError:plaid_sync', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  if (parsed.data.sync_all && (parsed.data.plaid_item_id || parsed.data.item_id)) {
    return res
      .status(400)
      .json({ error: 'sync_all cannot be combined with plaid_item_id or item_id' });
  }

  try {
    const rawTargets = [];

    if (parsed.data.sync_all) {
      const items = await listPlaidItemsFromStore();
      rawTargets.push(...items);
    } else if (parsed.data.plaid_item_id) {
      const item = await getPlaidItemById(parsed.data.plaid_item_id);
      if (!item) {
        return res.status(404).json({ error: 'Plaid item not found' });
      }
      rawTargets.push(item);
    } else if (parsed.data.item_id) {
      const item = await getPlaidItemByItemId(parsed.data.item_id);
      if (!item) {
        return res.status(404).json({ error: 'Plaid item not found' });
      }
      rawTargets.push(item);
    } else {
      return res.status(400).json({ error: 'Provide plaid_item_id, item_id, or set sync_all to true' });
    }

    if (rawTargets.length === 0) {
      return res.status(404).json({ error: 'No Plaid items available to sync' });
    }

    const results: Array<{ item: SanitizedPlaidItem; summary: PlaidSyncSummary }> = [];
    for (const item of rawTargets) {
      const summary = await syncPlaidItem({
        plaidItemId: item.id,
        forceFullSync: parsed.data.force_full_sync,
      });
      const refreshed = (await getPlaidItemById(item.id)) ?? item;
      const sanitized = redactPlaidItem(refreshed);
      results.push({ item: sanitized, summary });
    }

    logDebug('Success:plaid_sync', req, {
      count: results.length,
      sync_all: parsed.data.sync_all,
      force_full_sync: parsed.data.force_full_sync,
    });

    return res.json({ results });
  } catch (error) {
    logError('PlaidError:plaid_sync', req, error as any);
    const normalized = normalizePlaidError(error) || {
      type: 'unknown_error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    return res.status(502).json({ error: normalized });
  }
});

app.get('/import/plaid/items', async (req, res) => {
  if (!plaidConfiguredOrError(res)) {
    return;
  }

  const schema = z.object({
    plaid_item_id: z.string().uuid().optional(),
    item_id: z.string().optional(),
  });

  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    logWarn('ValidationError:plaid_items', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    let items;
    if (parsed.data.plaid_item_id) {
      const item = await getPlaidItemById(parsed.data.plaid_item_id);
      if (!item) {
        return res.status(404).json({ error: 'Plaid item not found' });
      }
      items = [item];
    } else if (parsed.data.item_id) {
      const item = await getPlaidItemByItemId(parsed.data.item_id);
      if (!item) {
        return res.status(404).json({ error: 'Plaid item not found' });
      }
      items = [item];
    } else {
      items = await listPlaidItemsFromStore();
    }

    const sanitized = items.map((item) => redactPlaidItem(item));
    logDebug('Success:plaid_items', req, { count: sanitized.length });
    return res.json({ items: sanitized });
  } catch (error) {
    logError('PlaidError:plaid_items', req, error as any);
    const normalized = normalizePlaidError(error) || {
      type: 'unknown_error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    return res.status(502).json({ error: normalized });
  }
});

app.post('/import/plaid/preview_sync', async (req, res) => {
  if (!plaidConfiguredOrError(res)) {
    return;
  }

  const schema = z.object({
    plaid_item_id: z.string().uuid().optional(),
    item_id: z.string().optional(),
    all: z.boolean().optional().default(false),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn('ValidationError:plaid_preview_sync', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const targets: string[] = [];

    if (parsed.data.all) {
      const allItems = await listPlaidItemsFromStore();
      targets.push(...allItems.map((item) => item.id));
    } else if (parsed.data.plaid_item_id) {
      targets.push(parsed.data.plaid_item_id);
    } else if (parsed.data.item_id) {
      const item = await getPlaidItemByItemId(parsed.data.item_id);
      if (!item) {
        return res.status(404).json({ error: 'Plaid item not found' });
      }
      targets.push(item.id);
    } else {
      return res.status(400).json({ error: 'Provide plaid_item_id, item_id, or set all=true' });
    }

    const previews: PlaidPreviewSummary[] = [];
    for (const id of targets) {
      const preview = await previewPlaidItemSync(id);
      previews.push(preview);
    }

    logDebug('Success:plaid_preview_sync', req, { count: previews.length });
    return res.json({ previews, count: previews.length });
  } catch (error) {
    logError('PlaidError:plaid_preview_sync', req, error as any);
    const normalized = normalizePlaidError(error) || {
      type: 'unknown_error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    return res.status(502).json({ error: normalized });
  }
});

app.post('/store_record', async (req, res) => {
  const parsed = StoreSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn('ValidationError:store_record', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { type, properties, file_urls, embedding: providedEmbedding } = parsed.data;

  // Generate embedding if not provided and OpenAI is configured
  // Filter out empty arrays - they're invalid for PostgreSQL vector type
  let embedding: number[] | null = null;
  if (providedEmbedding && Array.isArray(providedEmbedding) && providedEmbedding.length > 0) {
    embedding = providedEmbedding;
  } else if (!providedEmbedding && config.openaiApiKey) {
    const recordText = getRecordText(type, properties);
    embedding = await generateEmbedding(recordText);
  }

  // Generate summary
  const summary = await generateRecordSummary(type, properties, file_urls || []);

  const insertData: Record<string, unknown> = {
    type,
    properties,
    file_urls: file_urls || [],
  };
  if (embedding) {
    insertData.embedding = embedding;
  }
  if (summary) {
    insertData.summary = summary;
  }

  const { data, error } = await supabase
    .from('records')
    .insert(insertData)
    .select()
    .single();
  if (error) {
    logError('SupabaseError:store_record', req, error, { code: (error as any).code, details: (error as any).details, hint: (error as any).hint });
    return res.status(500).json({ error: (error as any).message || 'Database error' });
  }
  logDebug('Success:store_record', req, { id: data?.id });
  return res.json(data);
});

app.post('/store_records', async (req, res) => {
  const parsed = StoreRecordsSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn('ValidationError:store_records', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { records } = parsed.data;

  // Generate embeddings and summaries for records that don't have them
  const insertDataPromises = records.map(async ({ type, properties, file_urls, embedding: providedEmbedding }) => {
    // Filter out empty arrays - they're invalid for PostgreSQL vector type
    let embedding: number[] | null = null;
    if (providedEmbedding && Array.isArray(providedEmbedding) && providedEmbedding.length > 0) {
      embedding = providedEmbedding;
    } else if (!providedEmbedding && config.openaiApiKey) {
      const recordText = getRecordText(type, properties);
      embedding = await generateEmbedding(recordText);
    }

    // Generate summary
    const summary = await generateRecordSummary(type, properties, file_urls || []);

    const recordData: Record<string, unknown> = {
      type,
      properties,
      file_urls: file_urls || [],
    };
    if (embedding) {
      recordData.embedding = embedding;
    }
    if (summary) {
      recordData.summary = summary;
    }
    return recordData;
  });

  const insertData = await Promise.all(insertDataPromises);

  const { data, error } = await supabase
    .from('records')
    .insert(insertData)
    .select('id, type, created_at');

  if (error) {
    logError('SupabaseError:store_records', req, error, { code: (error as any).code, details: (error as any).details, hint: (error as any).hint });
    return res.status(500).json({ error: (error as any).message || 'Database error' });
  }
  
  // Return summary to avoid ResponseTooLargeError with embeddings
  const summary = {
    success: true,
    count: data?.length || 0,
    records: (data || []).map((rec: any) => ({
      id: rec.id,
      type: rec.type,
      created_at: rec.created_at,
    })),
  };
  
  logDebug('Success:store_records', req, { count: summary.count });
  return res.json(summary);
});

app.post('/update_record', async (req, res) => {
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn('ValidationError:update_record', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { id, type, properties, file_urls, embedding: providedEmbedding } = parsed.data;

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Fetch existing record to determine if we need to regenerate embedding and summary
  const { data: existing } = await supabase
    .from('records')
    .select('type, properties, embedding, file_urls')
    .eq('id', id)
    .single();

  if (type !== undefined) {
    updateData.type = type;
  }

  // Generate new embedding if:
  // 1. Embedding is explicitly provided (non-empty array), OR
  // 2. Properties or type changed and no embedding was provided, OR
  // 3. Existing record has no embedding and OpenAI is configured
  if (providedEmbedding !== undefined) {
    // Filter out empty arrays - they're invalid for PostgreSQL vector type
    if (Array.isArray(providedEmbedding) && providedEmbedding.length > 0) {
      updateData.embedding = providedEmbedding;
    } else {
      // Explicitly set to null to clear embedding
      updateData.embedding = null;
    }
  } else if ((properties !== undefined || type !== undefined) && config.openaiApiKey) {
    const newType = type !== undefined ? type : existing?.type || '';
    const newProperties = properties !== undefined ? properties : existing?.properties || {};
    const recordText = getRecordText(newType, newProperties as Record<string, unknown>);
    const generatedEmbedding = await generateEmbedding(recordText);
    if (generatedEmbedding) {
      updateData.embedding = generatedEmbedding;
    }
  }

  if (properties !== undefined) {
    const { data: existing, error: fetchError } = await supabase
      .from('records')
      .select('properties')
      .eq('id', id)
      .single();
    if (fetchError) {
      logError('SupabaseError:update_record:fetch', req, fetchError);
      return res.status(500).json({ error: fetchError.message });
    }
    updateData.properties = { ...(existing?.properties as object), ...properties };
  }

  if (file_urls !== undefined) {
    updateData.file_urls = file_urls;
  }

  // Regenerate summary when type, properties, or file_urls change (similar to embedding logic)
  if ((type !== undefined || properties !== undefined || file_urls !== undefined) && config.openaiApiKey) {
    const newType = type !== undefined ? type : existing?.type || '';
    // Use merged properties if properties were updated, otherwise use existing
    const newProperties = properties !== undefined 
      ? (updateData.properties as Record<string, unknown> || (existing?.properties as Record<string, unknown> || {}))
      : (existing?.properties as Record<string, unknown> || {});
    const newFileUrls = file_urls !== undefined ? file_urls : (existing?.file_urls as string[] || []);
    const generatedSummary = await generateRecordSummary(newType, newProperties, newFileUrls);
    if (generatedSummary) {
      updateData.summary = generatedSummary;
    }
  }

  const { data, error } = await supabase
    .from('records')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    logError('SupabaseError:update_record:update', req, error, { code: (error as any).code });
    return res.status(500).json({ error: error.message });
  }
  if (!data) {
    logWarn('NotFound:update_record', req, { id });
    return res.status(404).json({ error: 'Not found' });
  }
  logDebug('Success:update_record', req, { id: data.id });
  return res.json(data);
});

app.post('/retrieve_records', async (req, res) => {
  const parsed = RetrieveSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn('ValidationError:retrieve_records', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { type, properties, limit, search, search_mode, similarity_threshold, query_embedding: providedQueryEmbedding } = parsed.data;

  let results: any[] = [];
  const finalLimit = limit ?? 100;

  // Semantic search (vector similarity)
  if (search && (search_mode === 'semantic' || search_mode === 'both')) {
    // Generate query_embedding from search terms if not provided
    let query_embedding: number[] | undefined = providedQueryEmbedding;
    if (!query_embedding && config.openaiApiKey) {
      const searchText = search.join(' ');
      const generated = await generateEmbedding(searchText);
      query_embedding = generated || undefined;
      if (!query_embedding) {
        logWarn('EmbeddingGeneration:retrieve_records', req, { message: 'Failed to generate query embedding' });
        // Fall back to keyword search only
        if (search_mode === 'semantic') {
          // Switch to keyword mode if semantic was required
          const keywordQuery = supabase.from('records').select('*');
          if (type) keywordQuery.eq('type', type);
          const { data: keywordCandidates } = await keywordQuery.limit(finalLimit * 2);
          const searchTextLower = search.join(' ').toLowerCase();
          const keywordMatches = (keywordCandidates || []).filter((rec: any) => {
            const typeMatch = rec.type?.toLowerCase().includes(searchTextLower);
            const propsText = JSON.stringify(rec.properties || {}).toLowerCase();
            return typeMatch || propsText.includes(searchTextLower);
          }).slice(0, finalLimit);
          logDebug('Success:retrieve_records', req, { count: keywordMatches.length, search_mode: 'keyword (fallback)' });
          return res.json(keywordMatches);
        }
      }
    }

    if (!query_embedding) {
      if (search_mode === 'semantic') {
        logWarn('ValidationError:retrieve_records:no_embedding', req, { message: 'query_embedding required for semantic search or OPENAI_API_KEY must be configured' });
        return res.status(400).json({ error: 'query_embedding required for semantic search, or configure OPENAI_API_KEY for automatic generation' });
      }
      // If both mode, just skip semantic and do keyword only
    } else if (query_embedding.length !== 1536) {
      logWarn('ValidationError:retrieve_records:embedding_dim', req, { received: query_embedding.length });
      return res.status(400).json({ error: 'query_embedding must be 1536-dimensional (OpenAI text-embedding-3-small)' });
    }

    if (query_embedding) {
      // Fetch records with embeddings for similarity calculation
      // Note: For better performance at scale, create a PostgreSQL function using pgvector operators
      let embeddingQuery = supabase.from('records').select('*').not('embedding', 'is', null);
      
      if (type) {
        embeddingQuery = embeddingQuery.eq('type', type);
      }

      // Fetch more candidates than limit to filter by similarity
      const { data: candidates, error: fetchError } = await embeddingQuery.limit(finalLimit * 10);

      if (fetchError) {
        logError('SupabaseError:retrieve_records:semantic:fetch', req, fetchError);
      } else if (candidates) {
        // Debug: Check embedding format of first candidate
        const sampleEmbedding = candidates[0]?.embedding;
        const embeddingInfo = sampleEmbedding ? {
          type: typeof sampleEmbedding,
          isArray: Array.isArray(sampleEmbedding),
          length: Array.isArray(sampleEmbedding) ? sampleEmbedding.length : 'N/A',
          preview: typeof sampleEmbedding === 'string' ? sampleEmbedding.substring(0, 50) : 
                  Array.isArray(sampleEmbedding) ? `[${sampleEmbedding.slice(0, 3).join(', ')}, ...]` : 
                  JSON.stringify(sampleEmbedding).substring(0, 50)
        } : null;
        
        logDebug('SemanticSearch:retrieve_records', req, { 
          candidates_count: candidates.length, 
          similarity_threshold,
          type_filter: type || 'all',
          sample_embedding: embeddingInfo
        });
        
        // Calculate cosine similarity for each record
        const queryNorm = Math.sqrt(query_embedding.reduce((sum, val) => sum + val * val, 0));
        
        const scoredCandidates = candidates
          .map((rec: any) => {
            let recEmbedding = rec.embedding;
            
            // Handle Supabase vector format - it might be stored as string or array
            if (!recEmbedding) {
              return null;
            }
            
            // Convert string to array if needed (Supabase might return JSON string)
            if (typeof recEmbedding === 'string') {
              try {
                recEmbedding = JSON.parse(recEmbedding);
              } catch (e) {
                logWarn('SemanticSearch:embedding_parse_error', req, { rec_id: rec.id?.substring(0, 8), error: e });
                return null;
              }
            }
            
            // Ensure it's an array with correct dimensions
            if (!Array.isArray(recEmbedding) || recEmbedding.length !== 1536) {
              logWarn('SemanticSearch:embedding_format_error', req, { 
                rec_id: rec.id?.substring(0, 8),
                embedding_type: typeof recEmbedding,
                embedding_length: Array.isArray(recEmbedding) ? recEmbedding.length : 'not-array'
              });
              return null;
            }
            
            const dotProduct = query_embedding.reduce((sum, val, i) => sum + val * recEmbedding[i], 0);
            const recNorm = Math.sqrt(recEmbedding.reduce((sum: number, val: number) => sum + val * val, 0));
            const similarity = dotProduct / (queryNorm * recNorm);
            
            return { ...rec, similarity };
          })
          .filter((rec: any) => rec !== null)
          .sort((a: any, b: any) => b.similarity - a.similarity);
        
        // Log top 5 similarity scores for debugging
        const topScores = scoredCandidates.slice(0, 5).map((rec: any) => ({
          id: rec.id?.substring(0, 8),
          type: rec.type,
          similarity: rec.similarity?.toFixed(4)
        }));
        
        logDebug('SemanticSearch:similarity_scores', req, { 
          top_5_scores: topScores,
          threshold: similarity_threshold,
          candidates_scored: scoredCandidates.length
        });
        
        const semanticMatches = scoredCandidates
          .filter((rec: any) => rec.similarity >= similarity_threshold)
          .slice(0, finalLimit);
        
        logDebug('SemanticSearch:results', req, { 
          matches_count: semanticMatches.length,
          top_similarity: scoredCandidates[0]?.similarity?.toFixed(4) || 'N/A',
          threshold: similarity_threshold
        });

        if (search_mode === 'semantic') {
          results = semanticMatches;
        } else {
          // Will merge with keyword results below
          results = semanticMatches;
        }
      }
    }
  }

  // Keyword search (ILIKE pattern matching)
  if (search && (search_mode === 'keyword' || search_mode === 'both')) {
    let keywordQuery = supabase.from('records').select('*');
    
    if (type) {
      keywordQuery = keywordQuery.eq('type', type);
    }

    // Fetch candidates and filter by keyword match
    const { data: keywordCandidates, error: keywordError } = await keywordQuery.limit(finalLimit * 2);
    
    if (keywordError) {
      logError('SupabaseError:retrieve_records:keyword', req, keywordError);
    } else if (keywordCandidates) {
      const searchText = search.join(' ').toLowerCase();
      const keywordMatches = keywordCandidates.filter((rec: any) => {
        const typeMatch = rec.type?.toLowerCase().includes(searchText);
        const propsText = JSON.stringify(rec.properties || {}).toLowerCase();
        const propsMatch = propsText.includes(searchText);
        return typeMatch || propsMatch;
      }).slice(0, finalLimit);

      if (search_mode === 'keyword') {
        results = keywordMatches;
      } else {
        // Merge semantic and keyword results, deduplicate by ID
        const resultMap = new Map();
        results.forEach((r: any) => resultMap.set(r.id, r));
        keywordMatches.forEach((r: any) => {
          if (!resultMap.has(r.id)) {
            resultMap.set(r.id, r);
          }
        });
        results = Array.from(resultMap.values()).slice(0, finalLimit);
      }
    }
  }

  // No search mode: use existing logic
  if (!search) {
    let query = supabase.from('records').select('*');
    if (type) query = query.eq('type', type);
    query = query.order('created_at', { ascending: false }).limit(finalLimit);

    const { data, error } = await query;
    if (error) {
      logError('SupabaseError:retrieve_records', req, error, { code: (error as any).code });
      return res.status(500).json({ error: error.message });
    }
    results = data || [];
  }

  // Filter by exact property matches (if specified)
  if (properties) {
    results = results.filter((rec: any) => {
      return Object.entries(properties).every(([key, value]) => {
        const recValue = (rec.properties as Record<string, unknown>)?.[key];
        return recValue === value;
      });
    });
  }

  // Remove embeddings from response to reduce size (ChatGPT Actions has response size limits)
  const resultsWithoutEmbeddings = results.map((rec: any) => {
    const { embedding, ...rest } = rec;
    void embedding;
    return rest;
  });
  
  logDebug('Success:retrieve_records', req, { count: resultsWithoutEmbeddings.length, search_mode, has_search: !!search });
  return res.json(resultsWithoutEmbeddings);
});

app.post('/delete_record', async (req, res) => {
  const schema = z.object({ id: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn('ValidationError:delete_record', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { id } = parsed.data;

  const { error } = await supabase.from('records').delete().eq('id', id);
  if (error) {
    logError('SupabaseError:delete_record', req, error, { code: (error as any).code });
    return res.status(500).json({ error: error.message });
  }
  logDebug('Success:delete_record', req, { id });
  return res.json({ success: true, deleted_id: id });
});

app.post('/delete_records', async (req, res) => {
  const parsed = DeleteRecordsSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn('ValidationError:delete_records', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { ids } = parsed.data;
  const { error } = await supabase.from('records').delete().in('id', ids);

  if (error) {
    logError('SupabaseError:delete_records', req, error, { code: (error as any).code });
    return res.status(500).json({ error: error.message });
  }

  logDebug('Success:delete_records', req, { count: ids.length });
  return res.json({ success: true, deleted_ids: ids, count: ids.length });
});

// File endpoints
const upload = multer({ dest: '/tmp' });
app.post('/upload_file', upload.single('file'), async (req, res) => {
  const schema = z.object({
    record_id: z.string().uuid().optional(),
    bucket: z.string().optional(),
    properties: z.union([z.string(), z.record(z.unknown())]).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn('ValidationError:upload_file', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { record_id, bucket, properties } = parsed.data;

  let overrideProperties: Record<string, unknown> | undefined;
  if (typeof properties === 'string') {
    if (properties.trim().length === 0) {
      logWarn('ValidationError:upload_file:properties_empty', req);
      return res.status(400).json({ error: 'properties must be valid JSON object when provided' });
    }
    try {
      const parsedProperties = JSON.parse(properties);
      if (!parsedProperties || typeof parsedProperties !== 'object' || Array.isArray(parsedProperties)) {
        logWarn('ValidationError:upload_file:properties_shape', req, { properties: parsedProperties });
        return res.status(400).json({ error: 'properties must be a JSON object' });
      }
      overrideProperties = parsedProperties as Record<string, unknown>;
    } catch (error) {
      logWarn('ValidationError:upload_file:properties_parse', req, { error: error instanceof Error ? error.message : String(error) });
      return res.status(400).json({ error: 'properties must be valid JSON' });
    }
  } else if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
    overrideProperties = properties as Record<string, unknown>;
  }

  let existingFileUrls: string[] = [];

  const bucketName = bucket || 'files';
  const tmpPath = req.file?.path;
  if (!tmpPath) {
    logWarn('ValidationError:upload_file:missing_file', req);
    return res.status(400).json({ error: 'Missing file' });
  }

  const fileBuffer = fs.readFileSync(tmpPath);
  fs.unlinkSync(tmpPath);

  const originalName = req.file?.originalname || 'upload.bin';
  const mimeType = req.file?.mimetype || 'application/octet-stream';
  const fileSize = req.file?.size ?? fileBuffer.length;

  const recordId = record_id ?? randomUUID();

  const safeBase = path.basename(originalName).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 100) || 'file';
  const ext = path.extname(safeBase) || '.bin';
  const baseName = safeBase.endsWith(ext) ? safeBase.slice(0, safeBase.length - ext.length) : safeBase;
  const fileName = `${recordId}/${Date.now()}-${baseName.replace(/\.+/g, '-')}${ext}`;

  if (record_id) {
    const { data: recordData, error: fetchError } = await supabase
      .from('records')
      .select('file_urls')
      .eq('id', record_id)
      .single();
    if (fetchError || !recordData) {
      logWarn('NotFound:upload_file', req, { record_id, fetchError });
      return res.status(404).json({ error: 'Record not found' });
    }
    existingFileUrls = Array.isArray(recordData.file_urls) ? (recordData.file_urls as string[]) : [];
  }

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(fileName, fileBuffer, { upsert: false });

  if (uploadError) {
    logError('SupabaseStorageError:upload_file', req, uploadError, { bucket: bucketName, fileName });
    return res.status(500).json({ error: uploadError.message });
  }

  const filePath = uploadData.path;

  if (record_id) {
    const updatedFileUrls = [...existingFileUrls, filePath];

    const { data: updated, error: updateError } = await supabase
      .from('records')
      .update({ file_urls: updatedFileUrls })
      .eq('id', record_id)
      .select()
      .single();

    if (updateError) {
      logError('SupabaseError:upload_file:update_row', req, updateError);
      return res.status(500).json({ error: updateError.message });
    }

    logDebug('Success:upload_file', req, { record_id, filePath });
    return res.json(updated);
  }

  try {
    const created = await createRecordFromUploadedFile({
      recordId,
      buffer: fileBuffer,
      fileName: originalName,
      mimeType,
      fileSize,
      fileUrl: filePath,
      overrideProperties,
    });
    logDebug('Success:upload_file:create', req, { record_id: created.id, filePath });
    return res.status(201).json(created);
  } catch (error) {
    logError('SupabaseError:upload_file:create_record', req, error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create record from file' });
  }
});

app.get('/get_file_url', async (req, res) => {
  const schema = z.object({ file_path: z.string(), expires_in: z.coerce.number().optional() });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    logWarn('ValidationError:get_file_url', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { file_path, expires_in } = parsed.data;

  const parts = file_path.split('/');
  const bucket = parts[0];
  const path = parts.slice(1).join('/');

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expires_in || 3600);
  if (error) {
    logError('SupabaseStorageError:get_file_url', req, error, { bucket, path });
    return res.status(500).json({ error: error.message });
  }

  logDebug('Success:get_file_url', req, { path: file_path });
  return res.json({ url: data.signedUrl });
});

// Helper function to execute retrieve_records logic (reusable for chat endpoint)
async function executeRetrieveRecords(params: {
  type?: string;
  properties?: Record<string, unknown>;
  limit?: number;
  search?: string[];
  search_mode?: 'semantic' | 'keyword' | 'both';
  similarity_threshold?: number;
  query_embedding?: number[];
}): Promise<any[]> {
  const { type, properties, limit, search, search_mode = 'both', similarity_threshold = 0.3, query_embedding: providedQueryEmbedding } = params;

  let results: any[] = [];
  const finalLimit = limit ?? 100;

  // Semantic search (vector similarity)
  if (search && (search_mode === 'semantic' || search_mode === 'both')) {
    let query_embedding: number[] | undefined = providedQueryEmbedding;
    if (!query_embedding && config.openaiApiKey) {
      const searchText = search.join(' ');
      const generated = await generateEmbedding(searchText);
      query_embedding = generated || undefined;
    }

    if (query_embedding && query_embedding.length === 1536) {
      let embeddingQuery = supabase.from('records').select('*').not('embedding', 'is', null);
      
      if (type) {
        embeddingQuery = embeddingQuery.eq('type', type);
      }

      const { data: candidates, error: fetchError } = await embeddingQuery.limit(finalLimit * 10);

      if (!fetchError && candidates) {
        const queryNorm = Math.sqrt(query_embedding.reduce((sum, val) => sum + val * val, 0));
        
        const scoredCandidates = candidates
          .map((rec: any) => {
            let recEmbedding = rec.embedding;
            
            if (!recEmbedding) return null;
            
            if (typeof recEmbedding === 'string') {
              try {
                recEmbedding = JSON.parse(recEmbedding);
              } catch {
                return null;
              }
            }
            
            if (!Array.isArray(recEmbedding) || recEmbedding.length !== 1536) {
              return null;
            }
            
            const dotProduct = query_embedding.reduce((sum, val, i) => sum + val * recEmbedding[i], 0);
            const recNorm = Math.sqrt(recEmbedding.reduce((sum: number, val: number) => sum + val * val, 0));
            const similarity = dotProduct / (queryNorm * recNorm);
            
            return { ...rec, similarity };
          })
          .filter((rec: any) => rec !== null)
          .sort((a: any, b: any) => b.similarity - a.similarity);
        
        const semanticMatches = scoredCandidates
          .filter((rec: any) => rec.similarity >= similarity_threshold)
          .slice(0, finalLimit);

        if (search_mode === 'semantic') {
          results = semanticMatches;
        } else {
          results = semanticMatches;
        }
      }
    }
  }

  // Keyword search
  if (search && (search_mode === 'keyword' || search_mode === 'both')) {
    let keywordQuery = supabase.from('records').select('*');
    
    if (type) {
      keywordQuery = keywordQuery.eq('type', type);
    }

    const { data: keywordCandidates, error: keywordError } = await keywordQuery.limit(finalLimit * 2);
    
    if (!keywordError && keywordCandidates) {
      const searchText = search.join(' ').toLowerCase();
      const keywordMatches = keywordCandidates.filter((rec: any) => {
        const typeMatch = rec.type?.toLowerCase().includes(searchText);
        const propsText = JSON.stringify(rec.properties || {}).toLowerCase();
        const propsMatch = propsText.includes(searchText);
        return typeMatch || propsMatch;
      }).slice(0, finalLimit);

      if (search_mode === 'keyword') {
        results = keywordMatches;
      } else {
        const resultMap = new Map();
        results.forEach((r: any) => resultMap.set(r.id, r));
        keywordMatches.forEach((r: any) => {
          if (!resultMap.has(r.id)) {
            resultMap.set(r.id, r);
          }
        });
        results = Array.from(resultMap.values()).slice(0, finalLimit);
      }
    }
  }

  // No search mode
  if (!search) {
    let query = supabase.from('records').select('*');
    if (type) query = query.eq('type', type);
    query = query.order('created_at', { ascending: false }).limit(finalLimit);

    const { data, error } = await query;
    if (!error) {
      results = data || [];
    }
  }

  // Filter by exact property matches
  if (properties) {
    results = results.filter((rec: any) => {
      return Object.entries(properties).every(([key, value]) => {
        const recValue = (rec.properties as Record<string, unknown>)?.[key];
        return recValue === value;
      });
    });
  }

  // Remove embeddings from response
  return results.map((rec: any) => {
    const { embedding, ...rest } = rec;
    void embedding;
    return rest;
  });
}

app.post('/chat', async (req, res) => {
  const schema = z.object({
    messages: z.array(z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
    })).min(1),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn('ValidationError:chat', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  if (!config.openaiApiKey) {
    return res.status(400).json({ error: 'OPENAI_API_KEY not configured on server' });
  }

  const { messages, model = 'gpt-4o-mini', temperature = 0.7 } = parsed.data;

  const systemMessage = {
    role: 'system' as const,
    content: `You are a helpful assistant for the Neotoma database system. You help users query and understand their stored records.

When a user asks about records, data, or information that might be stored in the database, use the retrieve_records function to fetch relevant records. Then provide a helpful response based on the retrieved data.

Guidelines:
- Use retrieve_records when the user asks about stored data, records, or information
- Extract search terms from the user's query for semantic/keyword search
- If the user mentions a specific record type, use the type parameter
- Provide clear, concise answers based on the retrieved records
- If no records are found, let the user know
- Be conversational and helpful`,
  };

  const retrieveRecordsFunction = {
    name: 'retrieve_records',
    description: 'Query records from the Neotoma database by type, properties, or semantic/keyword search',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Filter by record type (e.g., "transaction", "note", "exercise")',
        },
        properties: {
          type: 'object',
          description: 'Filter by exact property value matches',
          additionalProperties: true,
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 10, max: 50 for chat)',
          minimum: 1,
          maximum: 50,
        },
        search: {
          type: 'array',
          items: { type: 'string' },
          description: 'Search terms for semantic/keyword matching',
        },
        search_mode: {
          type: 'string',
          enum: ['semantic', 'keyword', 'both'],
          description: 'Search mode: semantic (vector similarity), keyword (text matching), or both (default: both)',
        },
        similarity_threshold: {
          type: 'number',
          description: 'Minimum similarity score for semantic search (0-1, default: 0.3)',
          minimum: 0,
          maximum: 1,
        },
      },
      required: [],
    },
  };

  try {
    // Use a more flexible message type for OpenAI API
    type ChatMessage = {
      role: 'system' | 'user' | 'assistant' | 'function';
      content: string;
      name?: string;
    };

    const chatMessages: ChatMessage[] = [systemMessage, ...messages];
    const functionCalls: Array<{ name: string; arguments: string; result?: any }> = [];
    const recordsQueried: any[] = [];
    const maxIterations = 5;
    let iteration = 0;

    while (iteration < maxIterations) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openaiApiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: chatMessages.filter(m => m.role !== 'function').map(m => ({
            role: m.role,
            content: m.content,
          })),
          functions: [retrieveRecordsFunction],
          function_call: 'auto',
          temperature,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        logError('OpenAIError:chat', req, text);
        return res.status(502).json({ error: 'Upstream model error' });
      }

      const data = await response.json() as {
        choices?: Array<{
          message?: {
            role?: string;
            content?: string | null;
            function_call?: {
              name?: string;
              arguments?: string;
            };
          };
        }>;
      };

      const choice = data.choices?.[0];
      if (!choice?.message) {
        return res.status(502).json({ error: 'Invalid response from model' });
      }

      const message = choice.message;
      if (message.role && message.content !== null && message.content !== undefined) {
        chatMessages.push({
          role: message.role as 'assistant' | 'user' | 'system',
          content: message.content || '',
        });
      }

      // If function call, execute it
      if (message.function_call?.name && message.function_call?.arguments) {
        const functionName = message.function_call.name;
        const functionArgs = message.function_call.arguments;

        if (functionName === 'retrieve_records') {
          try {
            const args = JSON.parse(functionArgs);
            const records = await executeRetrieveRecords({
              type: args.type,
              properties: args.properties,
              limit: Math.min(args.limit || 10, 50), // Cap at 50 for chat
              search: args.search,
              search_mode: args.search_mode || 'both',
              similarity_threshold: args.similarity_threshold || 0.3,
            });

            recordsQueried.push(...records);

            functionCalls.push({
              name: functionName,
              arguments: functionArgs,
              result: records,
            });

            // Add function result to conversation
            chatMessages.push({
              role: 'function',
              name: functionName,
              content: JSON.stringify(records),
            });

            iteration++;
            continue; // Continue to next iteration to get final response
          } catch (error) {
            logError('FunctionExecutionError:chat', req, error);
            chatMessages.push({
              role: 'function',
              name: functionName,
              content: JSON.stringify({ error: 'Failed to retrieve records' }),
            });
            iteration++;
            continue;
          }
        }
      }

      // If no function call, we have the final response
      const assistantMessage = {
        role: 'assistant' as const,
        content: message.content || '',
      };

      return res.json({
        message: assistantMessage,
        records_queried: recordsQueried.length > 0 ? recordsQueried : undefined,
        function_calls: functionCalls.length > 0 ? functionCalls.map(fc => ({
          name: fc.name,
          arguments: JSON.parse(fc.arguments),
        })) : undefined,
      });
    }

    // If we've exhausted iterations, return the last message
    const lastMessage = chatMessages[chatMessages.length - 1];
    return res.json({
      message: {
        role: 'assistant',
        content: typeof lastMessage.content === 'string' ? lastMessage.content : 'Unable to complete request',
      },
      records_queried: recordsQueried.length > 0 ? recordsQueried : undefined,
      function_calls: functionCalls.length > 0 ? functionCalls.map(fc => ({
        name: fc.name,
        arguments: JSON.parse(fc.arguments),
      })) : undefined,
    });
  } catch (error) {
    logError('Exception:chat', req, error);
    return res.status(500).json({ error: 'Chat failed' });
  }
});

app.get('/openapi.yaml', (req, res) => {
  res.type('text/yaml');
  res.sendFile(process.cwd() + '/openapi.yaml');
});

app.get('/import/plaid/link_demo', async (req, res) => {
  if (!plaidConfiguredOrError(res)) {
    return;
  }
  const userId = config.plaid.linkDefaults?.userId;
  if (!userId) {
    return res.status(500).send('PLAID_LINK_USER_ID is required to use the demo');
  }

  try {
    const linkToken = await createLinkToken({
      userId,
      clientName: config.plaid.linkDefaults?.clientName,
    });

    const tokenJson = JSON.stringify(linkToken.link_token);

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Plaid Link Demo</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0b0d10; color: #e6e6e6; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #11161d; padding: 32px; border-radius: 12px; max-width: 520px; box-shadow: 0 12px 40px rgba(0,0,0,0.35); }
    h1 { margin-top: 0; font-size: 24px; }
    p { color: #9ca3af; }
    button { background: #1f6feb; border: none; border-radius: 8px; color: #fff; padding: 10px 18px; font-size: 15px; cursor: pointer; }
    button:hover { background: #2c7ce6; }
    pre { margin-top: 16px; background: #0b1020; padding: 12px; border-radius: 8px; color: #c7d2fe; overflow-x: auto; }
    .notice { font-size: 13px; margin-top: 12px; color: #9ca3af; }
    .actions { margin-top: 16px; display: grid; gap: 8px; }
    .actions button.secondary { background: #2563eb; }
  </style>
  <script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
</head>
<body>
  <div class="card">
    <h1>Connect a bank account</h1>
    <p>This demo uses the Plaid sandbox. Click the button to launch Plaid Link. After approval, the public token is automatically exchanged with the server.</p>
    <label style="display:block;margin:16px 0 0 0;font-size:13px;color:#9ca3af;">
      Bearer token (optional)
      <input id="token-input" type="password" placeholder="ACTIONS_BEARER_TOKEN" style="width:100%;margin-top:6px;padding:8px;border-radius:8px;border:1px solid #1f2937;background:#0b1020;color:#e6e6e6;" />
    </label>
    <button id="link-button">Launch Plaid Link</button>
    <div class="notice" id="auth-notice"></div>
    <div class="notice" id="cache-info" hidden></div>
    <div class="actions" id="item-actions" hidden>
      <strong>Server actions for this item:</strong>
      <button id="preview-btn" class="secondary">Preview upcoming sync</button>
      <button id="sync-btn" class="secondary">Trigger sync</button>
      <button id="clear-cache" class="secondary">Clear cached connection</button>
    </div>
    <pre id="exchange-result" hidden></pre>
  </div>
  <script>
    const SANDBOX_BEARER_KEY = 'sandbox_bearer';
    const tokenInput = document.getElementById('token-input');
    const noticeEl = document.getElementById('auth-notice');
    const urlToken = new URLSearchParams(window.location.search).get('token') || '';
    let bearerToken = urlToken;

    if (!bearerToken) {
      try {
        const cachedToken = localStorage.getItem(SANDBOX_BEARER_KEY);
        if (cachedToken) bearerToken = cachedToken;
      } catch (err) {
        console.warn('Failed to read cached bearer token', err);
      }
    }

    if (tokenInput) {
      tokenInput.value = bearerToken;
    }

    if (bearerToken) {
      try {
        localStorage.setItem(SANDBOX_BEARER_KEY, bearerToken);
      } catch (err) {
        console.warn('Failed to persist bearer token', err);
      }
    }

    function normalizedToken() {
      return (bearerToken || '').trim();
    }
    function hasBearer() {
      return normalizedToken().length > 0;
    }

    const storageKey = 'plaid_demo_last_item';
    const resultEl = document.getElementById('exchange-result');
    const actionsEl = document.getElementById('item-actions');
    const cacheInfoEl = document.getElementById('cache-info');
    const previewBtn = document.getElementById('preview-btn');
    const syncBtn = document.getElementById('sync-btn');
    const clearBtn = document.getElementById('clear-cache');
    let lastItemId = null;

    function updateAuthNotice() {
      if (hasBearer()) {
        noticeEl.textContent = 'Bearer token loaded. Server requests will include authorization automatically.';
      } else {
        noticeEl.textContent = 'Provide a bearer token to enable automatic exchange and server actions. (This should match the sandbox API token.)';
      }
    }

    function updateActionsVisibility() {
      if (!actionsEl) return;
      actionsEl.hidden = !(lastItemId && hasBearer());
    }

    updateAuthNotice();
    updateActionsVisibility();

    function updateCacheInfo(payload) {
      if (!payload) {
        cacheInfoEl.hidden = true;
        cacheInfoEl.textContent = '';
        return;
      }
      const lastConnected = new Date(payload.timestamp || Date.now()).toLocaleString();
      cacheInfoEl.hidden = false;
      cacheInfoEl.textContent = 'Cached Plaid item ' + (payload.itemId || '(unknown)') + ' from ' + lastConnected;
    }

    function showActions(itemId) {
      lastItemId = itemId;
      updateActionsVisibility();
    }

    function persistCache(data) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(data));
        updateCacheInfo(data);
      } catch (err) {
        console.warn('Failed to persist cache', err);
      }
    }

    (function hydrateCache() {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed?.itemId) {
          showActions(parsed.itemId);
          updateCacheInfo(parsed);
          if (parsed.response) {
            resultEl.hidden = false;
            resultEl.textContent = JSON.stringify(parsed.response, null, 2);
          }
        }
      } catch (err) {
        console.warn('Failed to read cache', err);
      }
    })();

    async function callServerEndpoint(path) {
      const authToken = normalizedToken();
      if (!lastItemId || !authToken) return;
      resultEl.hidden = false;
      resultEl.textContent = 'Calling ' + path + '...';
      try {
        const resp = await fetch(path, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + authToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ plaid_item_id: lastItemId }),
        });
        const text = await resp.text();
        let payload;
        try { payload = JSON.parse(text); } catch { payload = text; }
        resultEl.textContent = JSON.stringify({ status: resp.status, response: payload }, null, 2);
      } catch (err) {
        resultEl.textContent = 'Request failed: ' + err.message;
      }
    }

    previewBtn?.addEventListener('click', () => callServerEndpoint('/import/plaid/preview_sync'));
    syncBtn?.addEventListener('click', () => callServerEndpoint('/import/plaid/sync'));
    clearBtn?.addEventListener('click', () => {
      localStorage.removeItem(storageKey);
      lastItemId = null;
      updateActionsVisibility();
      updateCacheInfo(null);
      resultEl.hidden = true;
      resultEl.textContent = '';
    });

    const handler = Plaid.create({
      token: ${tokenJson},
      onSuccess(public_token, metadata) {
        resultEl.hidden = false;
        resultEl.textContent = 'Exchanging public token...';
        if (!hasBearer()) {
          const payload = { public_token, metadata };
          resultEl.textContent = JSON.stringify(payload, null, 2);
          persistCache({ timestamp: Date.now(), itemId: metadata?.item?.item_id, response: payload });
          return;
        }
        const authToken = normalizedToken();
        fetch('/import/plaid/exchange_public_token', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + authToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ public_token }),
        }).then(async (resp) => {
          const text = await resp.text();
          let payload;
          try { payload = JSON.parse(text); } catch { payload = text; }
          const responseWrapper = { status: resp.status, response: payload };
          resultEl.textContent = JSON.stringify(responseWrapper, null, 2);
          const itemId = payload?.item?.id || payload?.item?.plaidItemId || payload?.plaidItemId || metadata?.item?.item_id;
          if (itemId) {
            persistCache({ timestamp: Date.now(), itemId, response: responseWrapper });
            showActions(itemId);
          }
        }).catch((err) => {
          resultEl.textContent = 'Exchange failed: ' + err.message;
        });
      },
      onExit(err) {
        if (err) {
          console.error('Plaid Link errored', err);
          alert('Plaid Link exited with error: ' + (err.display_message || err.error_message || err.error_code));
        }
      }
    });
    document.getElementById('link-button').addEventListener('click', () => handler.open());

    if (tokenInput) {
      tokenInput.addEventListener('input', () => {
        bearerToken = tokenInput.value.trim();
        try {
          if (bearerToken) {
            localStorage.setItem(SANDBOX_BEARER_KEY, bearerToken);
          } else {
            localStorage.removeItem(SANDBOX_BEARER_KEY);
          }
        } catch (err) {
          console.warn('Failed to persist bearer token', err);
        }
        updateAuthNotice();
        updateActionsVisibility();
      });
    }
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (error) {
    logError('PlaidError:plaid_link_demo', req, error as any);
    const normalized = normalizePlaidError(error) || {
      type: 'unknown_error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    return res.status(502).json({ error: normalized });
  }
});

app.get('/plaid/link_demo', (req, res) => {
  const token = typeof req.query.token === 'string' ? `?token=${encodeURIComponent(req.query.token)}` : '';
  return res.redirect(302, `/import/plaid/link_demo${token}`);
});

// SPA fallback - serve index.html for non-API routes (must be after all API routes)
app.get('*', (req, res, next) => {
  // Skip if it's an API route, sandbox, or import route
  if (
    req.path.startsWith('/api') ||
    req.path.startsWith('/sandbox') ||
    req.path.startsWith('/import') ||
    req.path.startsWith('/plaid') ||
    req.path.startsWith('/retrieve_records') ||
    req.path.startsWith('/store_record') ||
    req.path.startsWith('/store_records') ||
    req.path.startsWith('/update_record') ||
    req.path.startsWith('/delete_record') ||
    req.path.startsWith('/delete_records') ||
    req.path.startsWith('/upload_file') ||
    req.path.startsWith('/get_file_url') ||
    req.path.startsWith('/chat') ||
    req.path.startsWith('/types') ||
    req.path.startsWith('/groom') ||
    req.path.startsWith('/openapi.yaml') ||
    req.path.startsWith('/health')
  ) {
    return next();
  }
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    next();
  }
});

const httpPort = process.env.HTTP_PORT ? parseInt(process.env.HTTP_PORT, 10) : (config.port || 3000);
app.listen(httpPort, () => {
  // eslint-disable-next-line no-console
  console.log(`HTTP Actions listening on :${httpPort}`);
});
