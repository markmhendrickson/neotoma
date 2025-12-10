import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import multer from "multer";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { supabase } from "./db.js";
import { config } from "./config.js";
import {
  listCanonicalRecordTypes,
  normalizeRecordType,
} from "./config/record_types.js";
import { generateEmbedding, getRecordText } from "./embeddings.js";
import fs from "fs";
import path from "path";
import { normalizeRow } from "./normalize.js";
import { createRecordFromUploadedFile } from "./services/file_analysis.js";
import { generateRecordSummary } from "./services/summary.js";
import { generateRecordComparisonInsight } from "./services/record_comparison.js";
import {
  createLinkToken,
  exchangePublicToken,
  buildPlaidItemContext,
  isPlaidConfigured,
  normalizePlaidError,
} from "./integrations/plaid/client.js";
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
} from "./services/plaid_sync.js";
import {
  providerCatalog,
  getProviderDefinition,
} from "./integrations/providers/index.js";
import {
  createConnector,
  listConnectors as listExternalConnectors,
  type ExternalConnector,
  type ConnectorSecrets,
} from "./services/connectors.js";
import {
  runConnectorSync,
  runAllConnectorSyncs,
} from "./services/importers.js";
import {
  ensurePublicKeyRegistered,
  getPublicKey,
  isBearerTokenValid,
} from "./services/public_key_registry.js";
import { verifyRequest, parseAuthHeader } from "./crypto/auth.js";
import { encryptResponseMiddleware } from "./middleware/encrypt_response.js";
import { initServerKeys } from "./services/encryption_service.js";
import type { AccountBase } from "plaid";
import { isCsvLike, parseCsvRows } from "./utils/csv.js";
import {
  serializeChatMessagesForOpenAI,
  type ChatMessage,
} from "./utils/chat.js";
import {
  emitRecordCreated,
  emitRecordUpdated,
  emitRecordDeleted,
} from "./events/event_emitter.js";
import { getEventsByRecordId } from "./events/event_log.js";
import { getRecordAtTimestamp } from "./events/replay.js";
import {
  rankSearchResults,
  sortRecordsDeterministically,
} from "./services/search.js";
import { createObservationsFromRecord } from "./services/observation_ingestion.js";

export const app = express();
// Configure CSP to allow CDN scripts for the uploader and API connects
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://unpkg.com",
          "https://cdn.plaid.com",
        ],
        connectSrc: ["'self'", "http:", "https:"],
        imgSrc: ["'self'", "data:"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
        objectSrc: ["'none'"],
        frameSrc: ["'self'", "https://cdn.plaid.com"],
      },
    },
  })
);
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

// Favicon (no-auth) to avoid 401 noise when not present on disk
app.get("/favicon.ico", (_req, res) => res.status(204).end());

// Basic redaction helpers for safer debug logs
const SENSITIVE_FIELDS = new Set([
  "token",
  "access_token",
  "accessToken",
  "public_token",
  "publicToken",
  "bearer_token",
  "bearerToken",
  "password",
  "secret",
  "api_key",
  "apiKey",
  "client_secret",
  "clientSecret",
  "authorization",
  "Authorization",
]);

const CANONICAL_RECORD_TYPES = listCanonicalRecordTypes();
const CANONICAL_RECORD_TYPE_IDS = CANONICAL_RECORD_TYPES.map((def) => def.id);

function redactHeaders(
  headers: Record<string, unknown>
): Record<string, unknown> {
  const clone = { ...headers } as Record<string, unknown>;
  if (clone.authorization) clone.authorization = "[REDACTED]";
  if (clone.Authorization) clone.Authorization = "[REDACTED]";
  return clone;
}

function redactSensitiveFields(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveFields);
  }

  const redacted = { ...(obj as Record<string, unknown>) };
  for (const key in redacted) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.has(key) || SENSITIVE_FIELDS.has(lowerKey)) {
      redacted[key] = "[REDACTED]";
    } else if (typeof redacted[key] === "object" && redacted[key] !== null) {
      redacted[key] = redactSensitiveFields(redacted[key]);
    }
  }
  return redacted;
}

function logDebug(
  event: string,
  req: express.Request,
  extra?: Record<string, unknown>
): void {
  const safe = {
    method: req.method,
    path: req.path,
    query: redactSensitiveFields(req.query),
    headers: redactHeaders(req.headers as Record<string, unknown>),
    body: redactSensitiveFields(req.body),
    ...(extra ? (redactSensitiveFields(extra) as Record<string, unknown>) : {}),
  };
  // eslint-disable-next-line no-console
  console.debug(`[DEBUG] ${event}`, safe);
}

function logWarn(
  event: string,
  req: express.Request,
  extra?: Record<string, unknown>
): void {
  const safe = {
    method: req.method,
    path: req.path,
    query: redactSensitiveFields(req.query),
    headers: redactHeaders(req.headers as Record<string, unknown>),
    body: redactSensitiveFields(req.body),
    ...(extra ? (redactSensitiveFields(extra) as Record<string, unknown>) : {}),
  };
  // eslint-disable-next-line no-console
  console.warn(`[WARN] ${event}`, safe);
}

function logError(
  event: string,
  req: express.Request,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  const payload = {
    method: req.method,
    path: req.path,
    query: redactSensitiveFields(req.query),
    headers: redactHeaders(req.headers as Record<string, unknown>),
    body: redactSensitiveFields(req.body),
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : redactSensitiveFields(error),
    ...(extra ? (redactSensitiveFields(extra) as Record<string, unknown>) : {}),
  };
  // eslint-disable-next-line no-console
  console.error(`[ERROR] ${event}`, payload);
}

function sanitizeConnector(connector: ExternalConnector) {
  const { secretsEnvelope, ...rest } = connector;
  void secretsEnvelope;
  return rest;
}

function plaidConfiguredOrError(res: express.Response): boolean {
  if (isPlaidConfigured()) {
    return true;
  }
  res.status(500).json({ error: "Plaid integration not configured on server" });
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
app.get("/health", (_req, res) => {
  return res.json({ ok: true });
});

// Public key-based authentication middleware
app.use(async (req, res, next) => {
  // Bypass auth for public endpoints
  if (
    req.method === "OPTIONS" ||
    (req.method === "GET" &&
      (req.path === "/openapi.yaml" ||
        req.path === "/health" ||
        req.path === "/import/plaid/link_demo" ||
        req.path === "/plaid/link_demo"))
  ) {
    return next();
  }

  const headerAuth = req.headers.authorization || "";

  if (!headerAuth.startsWith("Bearer ")) {
    logWarn("AuthMissingBearer", req);
    return res.status(401).json({ error: "Missing Bearer token" });
  }

  const bearerToken = headerAuth.slice("Bearer ".length).trim();

  // Bearer token is now base64url-encoded Ed25519 public key
  // Auto-register if not exists (first-time user)
  const registered = ensurePublicKeyRegistered(bearerToken);
  if (!registered) {
    logWarn("AuthInvalidTokenFormat", req, {
      bearerTokenLength: bearerToken.length,
    });
    return res.status(403).json({
      error:
        "Invalid bearer token format (must be base64url-encoded Ed25519 public key)",
    });
  }

  if (!isBearerTokenValid(bearerToken)) {
    logWarn("AuthInvalidToken", req);
    return res.status(403).json({ error: "Invalid bearer token (public key)" });
  }

  // Optional: Verify signature if provided
  const { signature } = parseAuthHeader(headerAuth);
  if (signature && req.body) {
    const bodyString =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    const isValid = verifyRequest(bodyString, signature, bearerToken);
    if (!isValid) {
      logWarn("AuthInvalidSignature", req);
      return res.status(403).json({ error: "Invalid request signature" });
    }
  }

  // Attach public key to request for encryption service
  (req as any).publicKey = getPublicKey(bearerToken);
  (req as any).bearerToken = bearerToken;

  return next();
});

// Response encryption middleware (applies to all authenticated routes)
app.use(encryptResponseMiddleware);

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
  search_mode: z
    .enum(["semantic", "keyword", "both"])
    .optional()
    .default("both"),
  similarity_threshold: z.number().min(0).max(1).optional().default(0.3),
  query_embedding: z.array(z.number()).optional(),
  ids: z.array(z.string().uuid()).min(1).max(100).optional(),
  include_total_count: z.boolean().optional(),
});

const StoreRecordsSchema = z.object({
  records: z.array(StoreSchema).min(1).max(100),
});

const DeleteRecordsSchema = z.object({
  ids: z.array(z.string()).min(1).max(100),
});

const ProviderLinkSchema = z.object({
  account_identifier: z.string().min(1).optional(),
  account_label: z.string().min(1).optional(),
  provider_type: z.enum(["social", "productivity"]).optional(),
  capabilities: z.array(z.string()).optional(),
  oauth_scopes: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  secrets: z.record(z.unknown()).optional(),
});

const ProviderSyncSchema = z.object({
  connector_id: z.string().uuid().optional(),
  sync_type: z.enum(["initial", "incremental"]).optional(),
  limit: z.number().int().positive().max(500).optional(),
  max_pages: z.number().int().positive().max(50).optional(),
});

// Endpoints
app.get("/types", async (req, res) => {
  const { data, error } = await supabase
    .from("records")
    .select("type")
    .limit(1000);
  if (error) {
    logError("SupabaseError:types", req, error);
    return res.status(500).json({ error: error.message });
  }
  const set = new Set<string>();
  (data || []).forEach((r: any) => {
    if (r.type) set.add(r.type);
  });
  const custom = Array.from(set)
    .filter((type) => !CANONICAL_RECORD_TYPE_IDS.includes(type))
    .sort();
  return res.json({
    types: [...CANONICAL_RECORD_TYPE_IDS, ...custom],
    canonical: CANONICAL_RECORD_TYPES,
    custom,
  });
});

app.get("/import/providers", (_req, res) => {
  return res.json({ providers: providerCatalog });
});

app.get("/connectors", async (req, res) => {
  try {
    const connectors = await listExternalConnectors();
    return res.json({
      connectors: connectors.map(sanitizeConnector),
    });
  } catch (error) {
    logError("ConnectorError:list", req, error);
    const message =
      error instanceof Error ? error.message : "Failed to list connectors";
    const status = message.includes("Supabase client not initialized")
      ? 503
      : 500;
    return res.status(status).json({ error: message });
  }
});

app.post("/import/:provider/link", async (req, res) => {
  const providerId = req.params.provider;
  const definition = getProviderDefinition(providerId);
  if (!definition) {
    return res.status(404).json({ error: `Unknown provider: ${providerId}` });
  }

  const parsed = ProviderLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:connector_link", req, {
      issues: parsed.error.issues,
      provider: providerId,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const connector = await createConnector({
      provider: providerId,
      providerType: parsed.data.provider_type ?? definition.providerType,
      capabilities: parsed.data.capabilities ?? definition.capabilities,
      oauthScopes: parsed.data.oauth_scopes ?? definition.oauthScopes ?? [],
      accountIdentifier: parsed.data.account_identifier ?? null,
      accountLabel: parsed.data.account_label ?? definition.displayName,
      metadata: parsed.data.metadata ?? {},
      secrets: (parsed.data.secrets as ConnectorSecrets | undefined) ?? null,
    });
    logDebug("Success:connector_link", req, {
      connector_id: connector.id,
      provider: providerId,
    });
    return res.status(201).json({
      connector: sanitizeConnector(connector),
      provider: definition,
    });
  } catch (error) {
    logError("ConnectorError:link", req, error);
    return res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to create connector",
    });
  }
});

app.post("/import/:provider/sync", async (req, res) => {
  const providerId = req.params.provider;
  const definition = getProviderDefinition(providerId);
  if (!definition) {
    return res.status(404).json({ error: `Unknown provider: ${providerId}` });
  }

  const parsed = ProviderSyncSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:connector_sync", req, {
      issues: parsed.error.issues,
      provider: providerId,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    if (parsed.data.connector_id) {
      const result = await runConnectorSync({
        connectorId: parsed.data.connector_id,
        syncType: parsed.data.sync_type,
        limit: parsed.data.limit,
        maxPages: parsed.data.max_pages,
      });
      return res.json({ provider: definition, results: [result] });
    }

    const results = await runAllConnectorSyncs({
      provider: providerId,
      limitPerConnector: parsed.data.limit,
      maxPages: parsed.data.max_pages,
    });
    return res.json({ provider: definition, results });
  } catch (error) {
    logError("ConnectorError:sync", req, error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to sync provider",
    });
  }
});

app.post("/import/:provider/webhook", async (req, res) => {
  const providerId = req.params.provider;
  logDebug("ConnectorWebhook", req, { provider: providerId });
  return res.status(202).json({ ok: true });
});

app.post("/import/plaid/link_token", async (req, res) => {
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
    logWarn("ValidationError:plaid_link_token", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const response = await createLinkToken({
      userId: parsed.data.user_id || config.plaid.linkDefaults?.userId || "",
      clientName:
        parsed.data.client_name || config.plaid.linkDefaults?.clientName,
      accessToken: parsed.data.access_token,
      products: parsed.data.products,
      redirectUri: parsed.data.redirect_uri,
    });
    logDebug("Success:plaid_link_token", req, {
      request_id: response.request_id,
    });
    return res.json(response);
  } catch (error) {
    logError("PlaidError:plaid_link_token", req, error as any);
    const normalized = normalizePlaidError(error) || {
      type: "unknown_error",
      message: error instanceof Error ? error.message : "Unknown error",
    };
    return res.status(502).json({ error: normalized });
  }
});

app.post("/import/plaid/exchange_public_token", async (req, res) => {
  if (!plaidConfiguredOrError(res)) {
    return;
  }

  const schema = z.object({
    public_token: z.string().min(1),
    trigger_initial_sync: z.boolean().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:plaid_exchange_public_token", req, {
      issues: parsed.error.issues,
    });
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
      accounts: context.accounts.map((account) =>
        summarizePlaidAccount(account)
      ),
      request_id: exchangeResult.requestId,
      initial_sync: syncSummary,
    };

    logDebug("Success:plaid_exchange_public_token", req, {
      item_id: storedItem.item_id,
      plaid_item_id: storedItem.id,
      trigger_initial_sync: Boolean(parsed.data.trigger_initial_sync),
    });

    return res.json(response);
  } catch (error) {
    logError("PlaidError:plaid_exchange_public_token", req, error as any);
    const normalized = normalizePlaidError(error) || {
      type: "unknown_error",
      message: error instanceof Error ? error.message : "Unknown error",
    };
    return res.status(502).json({ error: normalized });
  }
});

app.post("/import/plaid/sync", async (req, res) => {
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
    logWarn("ValidationError:plaid_sync", req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  if (
    parsed.data.sync_all &&
    (parsed.data.plaid_item_id || parsed.data.item_id)
  ) {
    return res.status(400).json({
      error: "sync_all cannot be combined with plaid_item_id or item_id",
    });
  }

  try {
    const rawTargets = [];

    if (parsed.data.sync_all) {
      const items = await listPlaidItemsFromStore();
      rawTargets.push(...items);
    } else if (parsed.data.plaid_item_id) {
      const item = await getPlaidItemById(parsed.data.plaid_item_id);
      if (!item) {
        return res.status(404).json({ error: "Plaid item not found" });
      }
      rawTargets.push(item);
    } else if (parsed.data.item_id) {
      const item = await getPlaidItemByItemId(parsed.data.item_id);
      if (!item) {
        return res.status(404).json({ error: "Plaid item not found" });
      }
      rawTargets.push(item);
    } else {
      return res.status(400).json({
        error: "Provide plaid_item_id, item_id, or set sync_all to true",
      });
    }

    if (rawTargets.length === 0) {
      return res
        .status(404)
        .json({ error: "No Plaid items available to sync" });
    }

    const results: Array<{
      item: SanitizedPlaidItem;
      summary: PlaidSyncSummary;
    }> = [];
    for (const item of rawTargets) {
      const summary = await syncPlaidItem({
        plaidItemId: item.id,
        forceFullSync: parsed.data.force_full_sync,
      });
      const refreshed = (await getPlaidItemById(item.id)) ?? item;
      const sanitized = redactPlaidItem(refreshed);
      results.push({ item: sanitized, summary });
    }

    logDebug("Success:plaid_sync", req, {
      count: results.length,
      sync_all: parsed.data.sync_all,
      force_full_sync: parsed.data.force_full_sync,
    });

    return res.json({ results });
  } catch (error) {
    logError("PlaidError:plaid_sync", req, error as any);
    const normalized = normalizePlaidError(error) || {
      type: "unknown_error",
      message: error instanceof Error ? error.message : "Unknown error",
    };
    return res.status(502).json({ error: normalized });
  }
});

app.get("/import/plaid/items", async (req, res) => {
  if (!plaidConfiguredOrError(res)) {
    return;
  }

  const schema = z.object({
    plaid_item_id: z.string().uuid().optional(),
    item_id: z.string().optional(),
  });

  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    logWarn("ValidationError:plaid_items", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    let items;
    if (parsed.data.plaid_item_id) {
      const item = await getPlaidItemById(parsed.data.plaid_item_id);
      if (!item) {
        return res.status(404).json({ error: "Plaid item not found" });
      }
      items = [item];
    } else if (parsed.data.item_id) {
      const item = await getPlaidItemByItemId(parsed.data.item_id);
      if (!item) {
        return res.status(404).json({ error: "Plaid item not found" });
      }
      items = [item];
    } else {
      items = await listPlaidItemsFromStore();
    }

    const sanitized = items.map((item) => redactPlaidItem(item));
    logDebug("Success:plaid_items", req, { count: sanitized.length });
    return res.json({ items: sanitized });
  } catch (error) {
    logError("PlaidError:plaid_items", req, error as any);
    const normalized = normalizePlaidError(error) || {
      type: "unknown_error",
      message: error instanceof Error ? error.message : "Unknown error",
    };
    return res.status(502).json({ error: normalized });
  }
});

app.post("/import/plaid/preview_sync", async (req, res) => {
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
    logWarn("ValidationError:plaid_preview_sync", req, {
      issues: parsed.error.issues,
    });
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
        return res.status(404).json({ error: "Plaid item not found" });
      }
      targets.push(item.id);
    } else {
      return res
        .status(400)
        .json({ error: "Provide plaid_item_id, item_id, or set all=true" });
    }

    const previews: PlaidPreviewSummary[] = [];
    for (const id of targets) {
      const preview = await previewPlaidItemSync(id);
      previews.push(preview);
    }

    logDebug("Success:plaid_preview_sync", req, { count: previews.length });
    return res.json({ previews, count: previews.length });
  } catch (error) {
    logError("PlaidError:plaid_preview_sync", req, error as any);
    const normalized = normalizePlaidError(error) || {
      type: "unknown_error",
      message: error instanceof Error ? error.message : "Unknown error",
    };
    return res.status(502).json({ error: normalized });
  }
});

app.post("/store_record", async (req, res) => {
  const parsed = StoreSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:store_record", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const {
    type,
    properties,
    file_urls,
    embedding: providedEmbedding,
  } = parsed.data;
  const normalizedType = normalizeRecordType(type).type;

  // Generate embedding if not provided and OpenAI is configured
  // Filter out empty arrays - they're invalid for PostgreSQL vector type
  let embedding: number[] | null = null;
  if (
    providedEmbedding &&
    Array.isArray(providedEmbedding) &&
    providedEmbedding.length > 0
  ) {
    embedding = providedEmbedding;
  } else if (!providedEmbedding && config.openaiApiKey) {
    const recordText = getRecordText(normalizedType, properties);
    embedding = await generateEmbedding(recordText);
  }

  // Generate summary
  const summary = await generateRecordSummary(
    normalizedType,
    properties,
    file_urls || []
  );

  const insertData: Record<string, unknown> = {
    type: normalizedType,
    properties: properties,
    file_urls: file_urls || [],
  };
  if (embedding) {
    insertData.embedding = embedding;
  }
  if (summary) {
    insertData.summary = summary;
  }

  const { data, error } = await supabase
    .from("records")
    .insert(insertData)
    .select()
    .single();
  if (error) {
    logError("SupabaseError:store_record", req, error, {
      code: (error as any).code,
      details: (error as any).details,
      hint: (error as any).hint,
    });
    return res
      .status(500)
      .json({ error: (error as any).message || "Database error" });
  }

  // Emit RecordCreated event (event-sourcing foundation - FU-050)
  try {
    await emitRecordCreated(data as any);
  } catch (eventError) {
    // Log event emission error but don't fail the request
    logError("EventEmissionError:store_record", req, eventError);
  }

  logDebug("Success:store_record", req, { id: data?.id });
  return res.json(data);
});

app.post("/store_records", async (req, res) => {
  const parsed = StoreRecordsSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:store_records", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { records } = parsed.data;

  // Generate embeddings and summaries for records that don't have them
  const insertDataPromises = records.map(
    async ({ type, properties, file_urls, embedding: providedEmbedding }) => {
      const normalizedType = normalizeRecordType(type).type;
      // Filter out empty arrays - they're invalid for PostgreSQL vector type
      let embedding: number[] | null = null;
      if (
        providedEmbedding &&
        Array.isArray(providedEmbedding) &&
        providedEmbedding.length > 0
      ) {
        embedding = providedEmbedding;
      } else if (!providedEmbedding && config.openaiApiKey) {
        const recordText = getRecordText(normalizedType, properties);
        embedding = await generateEmbedding(recordText);
      }

      // Generate summary
      const summary = await generateRecordSummary(
        normalizedType,
        properties,
        file_urls || []
      );

      const recordData: Record<string, unknown> = {
        type: normalizedType,
        properties: properties,
        file_urls: file_urls || [],
      };
      if (embedding) {
        recordData.embedding = embedding;
      }
      if (summary) {
        recordData.summary = summary;
      }
      return recordData;
    }
  );

  const insertData = await Promise.all(insertDataPromises);

  const { data, error } = await supabase
    .from("records")
    .insert(insertData)
    .select("id, type, created_at");

  if (error) {
    logError("SupabaseError:store_records", req, error, {
      code: (error as any).code,
      details: (error as any).details,
      hint: (error as any).hint,
    });
    return res
      .status(500)
      .json({ error: (error as any).message || "Database error" });
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

  logDebug("Success:store_records", req, { count: summary.count });
  return res.json(summary);
});

app.post("/update_record", async (req, res) => {
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:update_record", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const {
    id,
    type,
    properties,
    file_urls,
    embedding: providedEmbedding,
  } = parsed.data;

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  // Fetch existing record to determine if we need to regenerate embedding and summary
  const { data: existing } = await supabase
    .from("records")
    .select("type, properties, embedding, file_urls")
    .eq("id", id)
    .single();

  let normalizedUpdateType: string | undefined;
  if (type !== undefined) {
    normalizedUpdateType = normalizeRecordType(type).type;
    updateData.type = normalizedUpdateType;
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
  } else if (
    (properties !== undefined || type !== undefined) &&
    config.openaiApiKey
  ) {
    const newType =
      type !== undefined
        ? normalizedUpdateType || normalizeRecordType(type).type
        : existing?.type || "";
    const baseProperties =
      (existing?.properties as Record<string, unknown>) || {};
    const newProperties =
      properties !== undefined
        ? { ...baseProperties, ...properties }
        : baseProperties;
    const recordText = getRecordText(newType, newProperties);
    const generatedEmbedding = await generateEmbedding(recordText);
    if (generatedEmbedding) {
      updateData.embedding = generatedEmbedding;
    }
  }

  if (properties !== undefined) {
    updateData.properties = {
      ...(existing?.properties as object),
      ...properties,
    };
  }

  if (file_urls !== undefined) {
    updateData.file_urls = file_urls;
  }

  // Regenerate summary when type, properties, or file_urls change (similar to embedding logic)
  if (
    (type !== undefined ||
      properties !== undefined ||
      file_urls !== undefined) &&
    config.openaiApiKey
  ) {
    const newType =
      type !== undefined
        ? normalizedUpdateType || normalizeRecordType(type).type
        : existing?.type || "";
    // Use merged properties if properties were updated, otherwise use existing
    const newProperties =
      properties !== undefined
        ? (updateData.properties as Record<string, unknown>) ||
          (existing?.properties as Record<string, unknown>) ||
          {}
        : (existing?.properties as Record<string, unknown>) || {};
    const newFileUrls =
      file_urls !== undefined
        ? file_urls
        : (existing?.file_urls as string[]) || [];
    const generatedSummary = await generateRecordSummary(
      newType,
      newProperties,
      newFileUrls
    );
    if (generatedSummary) {
      updateData.summary = generatedSummary;
    }
  }

  const { data, error } = await supabase
    .from("records")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    logError("SupabaseError:update_record:update", req, error, {
      code: (error as any).code,
    });
    return res.status(500).json({ error: error.message });
  }
  if (!data) {
    logWarn("NotFound:update_record", req, { id });
    return res.status(404).json({ error: "Not found" });
  }

  // Emit RecordUpdated event (event-sourcing foundation - FU-050)
  try {
    await emitRecordUpdated(id, {
      properties: updateData.properties as Record<string, unknown> | undefined,
      file_urls: updateData.file_urls as string[] | undefined,
      updated_at: data.updated_at,
    });
  } catch (eventError) {
    // Log event emission error but don't fail the request
    logError("EventEmissionError:update_record", req, eventError);
  }

  logDebug("Success:update_record", req, { id: data.id });
  return res.json(data);
});

app.post("/retrieve_records", async (req, res) => {
  const parsed = RetrieveSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:retrieve_records", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const {
    type,
    properties,
    limit,
    search,
    search_mode,
    similarity_threshold,
    query_embedding: providedQueryEmbedding,
    ids,
    include_total_count,
  } = parsed.data;
  const normalizedType = type ? normalizeRecordType(type).type : undefined;
  const includeTotalCount = include_total_count === true;

  const resultMap = new Map<string, any>();
  const appendResults = (records: any[]) => {
    for (const record of records) {
      const id = record?.id;
      if (!id || resultMap.has(id)) continue;
      resultMap.set(id, record);
    }
  };
  const finalLimit = limit ?? 100;
  const hasIdFilter = Array.isArray(ids) && ids.length > 0;
  let totalCount: number | null = null;

  if (hasIdFilter) {
    try {
      const idMatches = await fetchRecordsByIds(ids, normalizedType);
      appendResults(idMatches);
    } catch (error) {
      logError("SupabaseError:retrieve_records:ids", req, error);
      return res
        .status(500)
        .json({ error: (error as any)?.message || "Database error" });
    }
  }

  // Semantic search (vector similarity)
  if (search && (search_mode === "semantic" || search_mode === "both")) {
    // Generate query_embedding from search terms if not provided
    let query_embedding: number[] | undefined = providedQueryEmbedding;
    if (!query_embedding && config.openaiApiKey) {
      const searchText = search.join(" ");
      const generated = await generateEmbedding(searchText);
      query_embedding = generated || undefined;
      if (!query_embedding) {
        logWarn("EmbeddingGeneration:retrieve_records", req, {
          message: "Failed to generate query embedding",
        });
        // Fall back to keyword search only
        if (search_mode === "semantic") {
          // Switch to keyword mode if semantic was required
          const keywordQuery = supabase.from("records").select("*");
          if (normalizedType) keywordQuery.eq("type", normalizedType);
          const { data: keywordCandidates } = await keywordQuery.limit(
            finalLimit * 2
          );
          const searchTextLower = search.join(" ").toLowerCase();
          const keywordMatches = (keywordCandidates || [])
            .filter((rec: any) => {
              const typeMatch = rec.type
                ?.toLowerCase()
                .includes(searchTextLower);
              const propsText = JSON.stringify(
                rec.properties || {}
              ).toLowerCase();
              return typeMatch || propsText.includes(searchTextLower);
            })
            .slice(0, finalLimit);
          logDebug("Success:retrieve_records", req, {
            count: keywordMatches.length,
            search_mode: "keyword (fallback)",
          });
          return res.json(keywordMatches);
        }
      }
    }

    if (!query_embedding) {
      if (search_mode === "semantic") {
        logWarn("ValidationError:retrieve_records:no_embedding", req, {
          message:
            "query_embedding required for semantic search or OPENAI_API_KEY must be configured",
        });
        return res.status(400).json({
          error:
            "query_embedding required for semantic search, or configure OPENAI_API_KEY for automatic generation",
        });
      }
      // If both mode, just skip semantic and do keyword only
    } else if (query_embedding.length !== 1536) {
      logWarn("ValidationError:retrieve_records:embedding_dim", req, {
        received: query_embedding.length,
      });
      return res.status(400).json({
        error:
          "query_embedding must be 1536-dimensional (OpenAI text-embedding-3-small)",
      });
    }

    if (query_embedding) {
      // Fetch records with embeddings for similarity calculation
      // Note: For better performance at scale, create a PostgreSQL function using pgvector operators
      let embeddingQuery = supabase
        .from("records")
        .select("*")
        .not("embedding", "is", null);

      if (normalizedType) {
        embeddingQuery = embeddingQuery.eq("type", normalizedType);
      }

      // Fetch more candidates than limit to filter by similarity
      const { data: candidates, error: fetchError } =
        await embeddingQuery.limit(finalLimit * 10);

      if (fetchError) {
        logError(
          "SupabaseError:retrieve_records:semantic:fetch",
          req,
          fetchError
        );
      } else if (candidates) {
        // Debug: Check embedding format of first candidate
        const sampleEmbedding = candidates[0]?.embedding;
        const embeddingInfo = sampleEmbedding
          ? {
              type: typeof sampleEmbedding,
              isArray: Array.isArray(sampleEmbedding),
              length: Array.isArray(sampleEmbedding)
                ? sampleEmbedding.length
                : "N/A",
              preview:
                typeof sampleEmbedding === "string"
                  ? sampleEmbedding.substring(0, 50)
                  : Array.isArray(sampleEmbedding)
                  ? `[${sampleEmbedding.slice(0, 3).join(", ")}, ...]`
                  : JSON.stringify(sampleEmbedding).substring(0, 50),
            }
          : null;

        logDebug("SemanticSearch:retrieve_records", req, {
          candidates_count: candidates.length,
          similarity_threshold,
          type_filter: normalizedType || "all",
          sample_embedding: embeddingInfo,
        });

        // Calculate cosine similarity for each record
        const queryNorm = Math.sqrt(
          query_embedding.reduce((sum, val) => sum + val * val, 0)
        );

        const scoredCandidates = candidates
          .map((rec: any) => {
            let recEmbedding = rec.embedding;

            // Handle Supabase vector format - it might be stored as string or array
            if (!recEmbedding) {
              return null;
            }

            // Convert string to array if needed (Supabase might return JSON string)
            if (typeof recEmbedding === "string") {
              try {
                recEmbedding = JSON.parse(recEmbedding);
              } catch (e) {
                logWarn("SemanticSearch:embedding_parse_error", req, {
                  rec_id: rec.id?.substring(0, 8),
                  error: e,
                });
                return null;
              }
            }

            // Ensure it's an array with correct dimensions
            if (!Array.isArray(recEmbedding) || recEmbedding.length !== 1536) {
              logWarn("SemanticSearch:embedding_format_error", req, {
                rec_id: rec.id?.substring(0, 8),
                embedding_type: typeof recEmbedding,
                embedding_length: Array.isArray(recEmbedding)
                  ? recEmbedding.length
                  : "not-array",
              });
              return null;
            }

            const dotProduct = query_embedding.reduce(
              (sum, val, i) => sum + val * recEmbedding[i],
              0
            );
            const recNorm = Math.sqrt(
              recEmbedding.reduce(
                (sum: number, val: number) => sum + val * val,
                0
              )
            );
            const similarity = dotProduct / (queryNorm * recNorm);

            return { ...rec, similarity };
          })
          .filter((rec: any) => rec !== null)
          .sort((a: any, b: any) => b.similarity - a.similarity);

        // Log top 5 similarity scores for debugging
        const topScores = scoredCandidates.slice(0, 5).map((rec: any) => ({
          id: rec.id?.substring(0, 8),
          type: rec.type,
          similarity: rec.similarity?.toFixed(4),
        }));

        logDebug("SemanticSearch:similarity_scores", req, {
          top_5_scores: topScores,
          threshold: similarity_threshold,
          candidates_scored: scoredCandidates.length,
        });

        const semanticMatches = scoredCandidates
          .filter((rec: any) => rec.similarity >= similarity_threshold)
          .slice(0, finalLimit);

        logDebug("SemanticSearch:results", req, {
          matches_count: semanticMatches.length,
          top_similarity: scoredCandidates[0]?.similarity?.toFixed(4) || "N/A",
          threshold: similarity_threshold,
        });

        appendResults(semanticMatches);
      }
    }
  }

  // Keyword search (ILIKE pattern matching)
  if (search && (search_mode === "keyword" || search_mode === "both")) {
    let keywordQuery = supabase.from("records").select("*");

    if (normalizedType) {
      keywordQuery = keywordQuery.eq("type", normalizedType);
    }

    // Fetch candidates and filter by keyword match
    const { data: keywordCandidates, error: keywordError } =
      await keywordQuery.limit(finalLimit * 2);

    if (keywordError) {
      logError("SupabaseError:retrieve_records:keyword", req, keywordError);
    } else if (keywordCandidates) {
      const searchText = search.join(" ").toLowerCase();
      const keywordMatches = keywordCandidates
        .filter((rec: any) => {
          const typeMatch = rec.type?.toLowerCase().includes(searchText);
          const propsText = JSON.stringify(rec.properties || {}).toLowerCase();
          const propsMatch = propsText.includes(searchText);
          return typeMatch || propsMatch;
        })
        .slice(0, finalLimit);

      appendResults(keywordMatches);
    }
  }

  // No search mode: use existing logic
  if (!search && !hasIdFilter) {
    let query = supabase.from("records").select("*");
    if (normalizedType) query = query.eq("type", normalizedType);
    // Use deterministic ordering: created_at DESC, then id ASC for tiebreaker
    query = query
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(finalLimit);

    const { data, error } = await query;
    if (error) {
      logError("SupabaseError:retrieve_records", req, error, {
        code: (error as any).code,
      });
      return res.status(500).json({ error: error.message });
    }
    appendResults(data || []);
  }

  let results = Array.from(resultMap.values());
  // Filter by exact property matches (if specified)
  if (properties) {
    results = results.filter((rec: any) => {
      return Object.entries(properties).every(([key, value]) => {
        const recValue = (rec.properties as Record<string, unknown>)?.[key];
        return recValue === value;
      });
    });
  }

  // Apply deterministic ranking (FU-105)
  if (search && search.length > 0) {
    const searchText = search.join(" ");
    results = rankSearchResults(results, searchText);
  } else {
    // No search query - sort deterministically
    results = sortRecordsDeterministically(results);
  }

  results = results.slice(0, finalLimit);

  // Remove embeddings from response to reduce size (ChatGPT Actions has response size limits)
  const resultsWithoutEmbeddings = results.map((rec: any) => {
    const { embedding, ...rest } = rec;
    void embedding;
    return rest;
  });

  if (includeTotalCount) {
    if (!search && !hasIdFilter && !properties) {
      try {
        const countOptions: {
          count: "exact";
          head: true;
          eq?: [string, string];
        } = {
          count: "exact",
          head: true,
        };
        let countQuery = supabase.from("records").select("id", countOptions);
        if (normalizedType) {
          countQuery = countQuery.eq("type", normalizedType);
        }
        const { count, error: countError } = await countQuery;
        if (countError) {
          logError("SupabaseError:retrieve_records:count", req, countError);
        } else if (typeof count === "number") {
          totalCount = count;
        }
      } catch (countError) {
        logError("SupabaseError:retrieve_records:count", req, countError);
      }
    } else if (hasIdFilter && ids) {
      totalCount = ids.length;
    }
  }

  const payload = includeTotalCount
    ? {
        records: resultsWithoutEmbeddings,
        total_count: totalCount ?? resultsWithoutEmbeddings.length,
      }
    : resultsWithoutEmbeddings;

  logDebug("Success:retrieve_records", req, {
    count: resultsWithoutEmbeddings.length,
    total_count: includeTotalCount
      ? totalCount ?? resultsWithoutEmbeddings.length
      : undefined,
    search_mode,
    has_search: !!search,
  });
  return res.json(payload);
});

app.post("/delete_record", async (req, res) => {
  const schema = z.object({ id: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:delete_record", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { id } = parsed.data;

  const { error } = await supabase.from("records").delete().eq("id", id);
  if (error) {
    logError("SupabaseError:delete_record", req, error, {
      code: (error as any).code,
    });
    return res.status(500).json({ error: error.message });
  }

  // Emit RecordDeleted event (event-sourcing foundation - FU-050)
  try {
    await emitRecordDeleted(id);
  } catch (eventError) {
    // Log event emission error but don't fail the request
    logError("EventEmissionError:delete_record", req, eventError);
  }

  logDebug("Success:delete_record", req, { id });
  return res.json({ success: true, deleted_id: id });
});

// Historical API endpoints for event-sourcing (FU-050)
app.get("/api/records/:id/history", async (req, res) => {
  const { id } = req.params;

  try {
    const events = await getEventsByRecordId(id);

    // Format events for response (exclude internal fields if needed)
    const formattedEvents = events.map((event) => ({
      id: event.id,
      event_type: event.event_type,
      payload: event.payload,
      timestamp: event.timestamp,
      record_id: event.record_id,
      reducer_version: event.reducer_version,
      created_at: event.created_at,
    }));

    return res.json({ events: formattedEvents });
  } catch (error) {
    logError("HistoricalAPIError:history", req, error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to retrieve event history";
    return res.status(500).json({ error: message });
  }
});

app.get("/api/records/:id", async (req, res) => {
  const { id } = req.params;
  const { at } = req.query;

  // If "at" query parameter is provided, use historical replay
  if (at && typeof at === "string") {
    try {
      const record = await getRecordAtTimestamp(id, at);

      if (!record) {
        return res
          .status(404)
          .json({ error: "Record not found at specified timestamp" });
      }

      return res.json(record);
    } catch (error) {
      logError("HistoricalAPIError:at_timestamp", req, error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to retrieve record at timestamp";

      if (message.includes("Invalid timestamp")) {
        return res.status(400).json({ error: message });
      }

      return res.status(500).json({ error: message });
    }
  }

  // Otherwise, return current state from records table
  const { data, error } = await supabase
    .from("records")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    logError("SupabaseError:get_record", req, error);
    return res.status(500).json({ error: error.message });
  }

  if (!data) {
    return res.status(404).json({ error: "Record not found" });
  }

  return res.json(data);
});

// MCP Actions for Observation Architecture (FU-061)

// Get entity snapshot with provenance
app.post("/get_entity_snapshot", async (req, res) => {
  const schema = z.object({ entity_id: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:get_entity_snapshot", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { entity_id } = parsed.data;

  const { data, error } = await supabase
    .from("entity_snapshots")
    .select("*")
    .eq("entity_id", entity_id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return res.status(404).json({ error: "Entity not found" });
    }
    logError("SupabaseError:get_entity_snapshot", req, error);
    return res.status(500).json({ error: error.message });
  }

  logDebug("Success:get_entity_snapshot", req, { entity_id });
  return res.json(data);
});

// List observations for entity
app.post("/list_observations", async (req, res) => {
  const schema = z.object({
    entity_id: z.string(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:list_observations", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { entity_id, limit = 100, offset = 0 } = parsed.data;

  let query = supabase
    .from("observations")
    .select("*")
    .eq("entity_id", entity_id)
    .order("observed_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error } = await query;

  if (error) {
    logError("SupabaseError:list_observations", req, error);
    return res.status(500).json({ error: error.message });
  }

  logDebug("Success:list_observations", req, {
    entity_id,
    count: data?.length || 0,
  });
  return res.json({ observations: data || [] });
});

// Get field provenance (trace field to source documents)
app.post("/get_field_provenance", async (req, res) => {
  const schema = z.object({
    entity_id: z.string(),
    field: z.string(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:get_field_provenance", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { entity_id, field } = parsed.data;

  // Get snapshot to find observation ID for this field
  const { data: snapshot } = await supabase
    .from("entity_snapshots")
    .select("provenance")
    .eq("entity_id", entity_id)
    .single();

  if (!snapshot || !snapshot.provenance) {
    return res.status(404).json({ error: "Entity or field not found" });
  }

  const provenance = snapshot.provenance as Record<string, string>;
  const observationId = provenance[field];

  if (!observationId) {
    return res.status(404).json({ error: "Field not found in provenance" });
  }

  // Get observation(s) - may be comma-separated for merge_array
  const observationIds = observationId.split(",");

  const { data: observations, error: obsError } = await supabase
    .from("observations")
    .select("*, source_record_id")
    .in("id", observationIds);

  if (obsError) {
    logError("SupabaseError:get_field_provenance", req, obsError);
    return res.status(500).json({ error: obsError.message });
  }

  // Get source records
  const recordIds =
    observations?.map((obs) => obs.source_record_id).filter(Boolean) || [];

  const { data: records, error: recordError } = await supabase
    .from("records")
    .select("id, type, properties, file_urls, created_at")
    .in("id", recordIds);

  if (recordError) {
    logError("SupabaseError:get_field_provenance:records", req, recordError);
  }

  logDebug("Success:get_field_provenance", req, { entity_id, field });
  return res.json({
    field,
    entity_id,
    observation_ids: observationIds,
    observations: observations || [],
    source_records: records || [],
  });
});

// Create relationship
app.post("/create_relationship", async (req, res) => {
  const schema = z.object({
    relationship_type: z.enum([
      "PART_OF",
      "CORRECTS",
      "REFERS_TO",
      "SETTLES",
      "DUPLICATE_OF",
      "DEPENDS_ON",
      "SUPERSEDES",
    ]),
    source_entity_id: z.string(),
    target_entity_id: z.string(),
    source_record_id: z.string().uuid().optional(),
    metadata: z.record(z.unknown()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:create_relationship", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const {
    relationship_type,
    source_entity_id,
    target_entity_id,
    source_record_id,
    metadata,
  } = parsed.data;

  const userId = "00000000-0000-0000-0000-000000000000"; // v0.1.0 single-user

  const { relationshipsService } = await import("./services/relationships.js");

  try {
    const relationship = await relationshipsService.createRelationship({
      relationship_type,
      source_entity_id,
      target_entity_id,
      source_record_id: source_record_id || null,
      metadata: metadata || {},
      user_id: userId,
    });

    logDebug("Success:create_relationship", req, { id: relationship.id });
    return res.json(relationship);
  } catch (error) {
    logError("RelationshipCreationError:create_relationship", req, error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to create relationship",
    });
  }
});

// List relationships
app.post("/list_relationships", async (req, res) => {
  const schema = z.object({
    entity_id: z.string(),
    direction: z.enum(["outgoing", "incoming", "both"]).optional(),
    relationship_type: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:list_relationships", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { entity_id, direction = "both", relationship_type } = parsed.data;

  const { relationshipsService } = await import("./services/relationships.js");

  try {
    let relationships;
    if (relationship_type) {
      relationships = await relationshipsService.getRelationshipsByType(
        relationship_type as any
      );
      // Filter by entity_id
      relationships = relationships.filter(
        (rel) =>
          rel.source_entity_id === entity_id ||
          rel.target_entity_id === entity_id
      );
    } else {
      relationships = await relationshipsService.getRelationshipsForEntity(
        entity_id,
        direction
      );
    }

    logDebug("Success:list_relationships", req, {
      entity_id,
      count: relationships.length,
    });
    return res.json({ relationships });
  } catch (error) {
    logError("RelationshipQueryError:list_relationships", req, error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to query relationships",
    });
  }
});

app.post("/delete_records", async (req, res) => {
  const parsed = DeleteRecordsSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:delete_records", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { ids } = parsed.data;
  const { error } = await supabase.from("records").delete().in("id", ids);

  if (error) {
    logError("SupabaseError:delete_records", req, error, {
      code: (error as any).code,
    });
    return res.status(500).json({ error: error.message });
  }

  logDebug("Success:delete_records", req, { count: ids.length });
  return res.json({ success: true, deleted_ids: ids, count: ids.length });
});

type NormalizedCsvRowResult = ReturnType<typeof normalizeRow>;

interface PreparedCsvRow {
  normalized: NormalizedCsvRowResult;
  rowIndex: number;
}

async function persistCsvRowRecords(
  rows: PreparedCsvRow[],
  parentRecordId: string,
  filePath: string
): Promise<Array<{ id: string; row_index: number }>> {
  if (!rows.length) {
    return [];
  }

  const preparedEntries = rows.map(({ normalized, rowIndex }) => {
    const canonicalType = normalizeRecordType(normalized.type).type;
    const rowId = randomUUID();
    const baseProperties = (normalized.properties ?? {}) as Record<
      string,
      unknown
    >;
    const properties = {
      ...baseProperties,
      csv_origin: {
        parent_record_id: parentRecordId,
        row_index: rowIndex,
        file_url: filePath,
      },
    };
    return {
      payload: {
        id: rowId,
        type: canonicalType,
        properties,
        file_urls: [filePath],
      },
      rowIndex,
    };
  });

  const created: Array<{ id: string; row_index: number }> = [];
  for (let i = 0; i < preparedEntries.length; i += 25) {
    const chunk = preparedEntries.slice(i, i + 25);
    const insertPayload = chunk.map((entry) => entry.payload);
    const { error } = await supabase.from("records").insert(insertPayload);
    if (error) {
      throw error;
    }
    chunk.forEach((entry) => {
      created.push({
        id: entry.payload.id as string,
        row_index: entry.rowIndex,
      });
    });
  }

  return created;
}

// File endpoints
const upload = multer({ dest: "/tmp" });
app.post("/upload_file", upload.single("file"), async (req, res) => {
  const schema = z.object({
    record_id: z.string().uuid().optional(),
    bucket: z.string().optional(),
    properties: z.union([z.string(), z.record(z.unknown())]).optional(),
    csv_row_records: z.coerce.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:upload_file", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { record_id, bucket, properties } = parsed.data;
  const csvRowsPreference = parsed.data.csv_row_records ?? true;

  let overrideProperties: Record<string, unknown> | undefined;
  if (typeof properties === "string") {
    if (properties.trim().length === 0) {
      logWarn("ValidationError:upload_file:properties_empty", req);
      return res
        .status(400)
        .json({ error: "properties must be valid JSON object when provided" });
    }
    try {
      const parsedProperties = JSON.parse(properties);
      if (
        !parsedProperties ||
        typeof parsedProperties !== "object" ||
        Array.isArray(parsedProperties)
      ) {
        logWarn("ValidationError:upload_file:properties_shape", req, {
          properties: parsedProperties,
        });
        return res
          .status(400)
          .json({ error: "properties must be a JSON object" });
      }
      overrideProperties = parsedProperties as Record<string, unknown>;
    } catch (error) {
      logWarn("ValidationError:upload_file:properties_parse", req, {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(400).json({ error: "properties must be valid JSON" });
    }
  } else if (
    properties &&
    typeof properties === "object" &&
    !Array.isArray(properties)
  ) {
    overrideProperties = properties as Record<string, unknown>;
  }

  let existingFileUrls: string[] = [];

  const bucketName = bucket || "files";
  const tmpPath = req.file?.path;
  if (!tmpPath) {
    logWarn("ValidationError:upload_file:missing_file", req);
    return res.status(400).json({ error: "Missing file" });
  }

  const fileBuffer = fs.readFileSync(tmpPath);
  fs.unlinkSync(tmpPath);

  const originalName = req.file?.originalname || "upload.bin";
  const mimeType = req.file?.mimetype || "application/octet-stream";
  const fileSize = req.file?.size ?? fileBuffer.length;

  const recordId = record_id ?? randomUUID();

  const isCsvFileUpload = isCsvLike(originalName, mimeType);
  const shouldGenerateCsvRows = isCsvFileUpload && csvRowsPreference;
  let preparedCsvRows: PreparedCsvRow[] = [];
  let csvRowsMeta: { truncated: boolean } | null = null;
  const csvRowWarnings: string[] = [];

  if (shouldGenerateCsvRows) {
    try {
      const parsedCsv = parseCsvRows(fileBuffer);
      if (parsedCsv.rows.length === 0) {
        logWarn("UploadFile:csv_rows_empty", req, { file: originalName });
      } else {
        const { data: typeRows, error: typeFetchError } = await supabase
          .from("records")
          .select("type")
          .limit(1000);
        if (typeFetchError) {
          logError("SupabaseError:upload_file:csv_types", req, typeFetchError);
        } else {
          const existingTypes = Array.from(
            new Set(
              ((typeRows || []) as Array<{ type: string | null }>)
                .map((row) => row.type)
                .filter(Boolean)
            )
          ) as string[];
          csvRowsMeta = { truncated: parsedCsv.truncated };
          preparedCsvRows = parsedCsv.rows.map((row, index) => {
            const normalized = normalizeRow(row, existingTypes);
            if (csvRowWarnings.length < 10 && normalized.warnings.length > 0) {
              const remainingSlots = 10 - csvRowWarnings.length;
              normalized.warnings
                .slice(0, remainingSlots)
                .forEach((warning) => {
                  csvRowWarnings.push(`Row ${index + 1}: ${warning}`);
                });
            }
            return { normalized, rowIndex: index };
          });
        }
      }
    } catch (error) {
      logError("UploadFile:csv_parse_failed", req, error, {
        file: originalName,
      });
    }
  }

  if (csvRowWarnings.length) {
    logWarn("UploadFile:csv_row_warnings", req, { warnings: csvRowWarnings });
  }

  const safeBase =
    path
      .basename(originalName)
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .slice(0, 100) || "file";
  const ext = path.extname(safeBase) || ".bin";
  const baseName = safeBase.endsWith(ext)
    ? safeBase.slice(0, safeBase.length - ext.length)
    : safeBase;
  const fileName = `${recordId}/${Date.now()}-${baseName.replace(
    /\.+/g,
    "-"
  )}${ext}`;

  if (record_id) {
    const { data: recordData, error: fetchError } = await supabase
      .from("records")
      .select("file_urls")
      .eq("id", record_id)
      .single();
    if (fetchError || !recordData) {
      logWarn("NotFound:upload_file", req, { record_id, fetchError });
      return res.status(404).json({ error: "Record not found" });
    }
    existingFileUrls = Array.isArray(recordData.file_urls)
      ? (recordData.file_urls as string[])
      : [];
  }

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(fileName, fileBuffer, { upsert: false });

  if (uploadError) {
    logError("SupabaseStorageError:upload_file", req, uploadError, {
      bucket: bucketName,
      fileName,
    });
    return res.status(500).json({ error: uploadError.message });
  }

  const filePath = uploadData.path;

  if (record_id) {
    const updatedFileUrls = [...existingFileUrls, filePath];

    const { data: updated, error: updateError } = await supabase
      .from("records")
      .update({ file_urls: updatedFileUrls })
      .eq("id", record_id)
      .select()
      .single();

    if (updateError) {
      logError("SupabaseError:upload_file:update_row", req, updateError);
      return res.status(500).json({ error: updateError.message });
    }

    logDebug("Success:upload_file", req, { record_id, filePath });
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
    let responseRecord = created;

    if (shouldGenerateCsvRows && preparedCsvRows.length > 0) {
      try {
        const insertedRows = await persistCsvRowRecords(
          preparedCsvRows,
          created.id,
          filePath
        );
        if (insertedRows.length > 0) {
          const relationshipPayload = insertedRows.map((row) => ({
            source_id: created.id,
            target_id: row.id,
            relationship: "contains_row",
            metadata: { row_index: row.row_index },
          }));
          const { error: relationshipError } = await supabase
            .from("record_relationships")
            .insert(relationshipPayload);
          if (relationshipError) {
            logError(
              "SupabaseError:upload_file:relationships",
              req,
              relationshipError
            );
          }

          const mergedProperties = {
            ...(created.properties as Record<string, unknown>),
            csv_rows: {
              linked_records: insertedRows.length,
              truncated: csvRowsMeta?.truncated ?? false,
              relationship: "contains_row",
            },
          };

          const { data: updatedDataset, error: datasetUpdateError } =
            await supabase
              .from("records")
              .update({ properties: mergedProperties })
              .eq("id", created.id)
              .select()
              .single();

          if (datasetUpdateError) {
            logError(
              "SupabaseError:upload_file:update_csv_summary",
              req,
              datasetUpdateError
            );
            responseRecord = { ...created, properties: mergedProperties };
          } else if (updatedDataset) {
            responseRecord = updatedDataset as typeof created;
          }

          logDebug("Success:upload_file:csv_rows", req, {
            parent_record_id: created.id,
            row_count: insertedRows.length,
            truncated: csvRowsMeta?.truncated ?? false,
          });
        }
      } catch (csvRowError) {
        logError("SupabaseError:upload_file:csv_rows", req, csvRowError);
      }
    }

    // Emit RecordCreated event (event-sourcing foundation - FU-050)
    try {
      await emitRecordCreated(responseRecord as any);
    } catch (eventError) {
      // Log event emission error but don't fail the request
      logError("EventEmissionError:upload_file", req, eventError);
    }

    logDebug("Success:upload_file:create", req, {
      record_id: created.id,
      filePath,
    });
    return res.status(201).json(responseRecord);
  } catch (error) {
    logError("SupabaseError:upload_file:create_record", req, error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to create record from file",
    });
  }
});

app.post("/analyze_file", upload.single("file"), async (req, res) => {
  const tmpPath = req.file?.path;
  if (!tmpPath) {
    logWarn("ValidationError:analyze_file:missing_file", req);
    return res.status(400).json({ error: "Missing file" });
  }

  const fileBuffer = fs.readFileSync(tmpPath);
  fs.unlinkSync(tmpPath);

  const originalName = req.file?.originalname || "upload.bin";
  const mimeType = req.file?.mimetype || "application/octet-stream";
  const fileSize = req.file?.size ?? fileBuffer.length;

  try {
    const { analyzeFileForRecord } = await import(
      "./services/file_analysis.js"
    );
    const analysis = await analyzeFileForRecord({
      buffer: fileBuffer,
      fileName: originalName,
      mimeType,
      fileSize,
    });

    logDebug("Success:analyze_file", req, {
      fileName: originalName,
      type: analysis.type,
    });
    return res.json(analysis);
  } catch (error) {
    logError("Error:analyze_file", req, error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to analyze file",
    });
  }
});

app.post("/record_comparison", async (req, res) => {
  const metricsSchema = z
    .object({
      amount: z.number().optional(),
      currency: z.string().max(16).optional(),
      repetitions: z.number().optional(),
      load: z.number().optional(),
      duration_minutes: z.number().optional(),
      date: z.string().optional(),
      recipient: z.string().optional(),
      merchant: z.string().optional(),
      category: z.string().optional(),
      location: z.string().optional(),
      label: z.string().optional(),
    })
    .strict()
    .partial();

  const recordSchema = z.object({
    id: z.string(),
    type: z.string(),
    summary: z.string().nullable().optional(),
    properties: z.record(z.unknown()).optional(),
    metrics: metricsSchema.optional(),
  });

  const schema = z.object({
    new_record: recordSchema,
    similar_records: z.array(recordSchema).min(1).max(10),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:record_comparison", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  if (!config.openaiApiKey) {
    logWarn("RecordComparison:openai_unconfigured", req);
    return res
      .status(503)
      .json({ error: "OpenAI API key is not configured on the server" });
  }

  try {
    const analysis = await generateRecordComparisonInsight(parsed.data);
    return res.json({ analysis });
  } catch (error) {
    logError("RecordComparison:failure", req, error);
    return res
      .status(500)
      .json({ error: "Failed to generate record comparison" });
  }
});

app.post("/generate_embedding", async (req, res) => {
  const schema = z.object({
    type: z.string(),
    properties: z.record(z.unknown()),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:generate_embedding", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  if (!config.openaiApiKey) {
    logWarn("GenerateEmbedding:openai_unconfigured", req);
    return res
      .status(503)
      .json({ error: "OpenAI API key is not configured on the server" });
  }

  try {
    const { type, properties } = parsed.data;
    const normalizedType = normalizeRecordType(type).type;
    const recordText = getRecordText(normalizedType, properties);
    const embedding = await generateEmbedding(recordText);

    if (!embedding) {
      return res.status(500).json({ error: "Failed to generate embedding" });
    }

    logDebug("Success:generate_embedding", req, { type: normalizedType });
    return res.json({ embedding });
  } catch (error) {
    logError("GenerateEmbedding:failure", req, error);
    return res.status(500).json({ error: "Failed to generate embedding" });
  }
});

app.get("/get_file_url", async (req, res) => {
  const schema = z.object({
    file_path: z.string(),
    expires_in: z.coerce.number().optional(),
  });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    logWarn("ValidationError:get_file_url", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { file_path, expires_in } = parsed.data;

  const parts = file_path.split("/");
  const bucket = parts[0];
  const path = parts.slice(1).join("/");

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expires_in || 3600);
  if (error) {
    logError("SupabaseStorageError:get_file_url", req, error, { bucket, path });
    return res.status(500).json({ error: error.message });
  }

  logDebug("Success:get_file_url", req, { path: file_path });
  return res.json({ url: data.signedUrl });
});

async function fetchRecordsByIds(ids: string[], type?: string): Promise<any[]> {
  if (!ids.length) {
    return [];
  }
  let query = supabase.from("records").select("*").in("id", ids);
  if (type) {
    query = query.eq("type", type);
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  const orderMap = new Map(ids.map((id, index) => [id, index]));
  return (data ?? []).sort((a, b) => {
    const aIndex = orderMap.get(a.id) ?? 0;
    const bIndex = orderMap.get(b.id) ?? 0;
    return aIndex - bIndex;
  });
}

// Helper function to execute retrieve_records logic (reusable for chat endpoint)
async function executeRetrieveRecords(params: {
  type?: string;
  properties?: Record<string, unknown>;
  limit?: number;
  search?: string[];
  search_mode?: "semantic" | "keyword" | "both";
  similarity_threshold?: number;
  query_embedding?: number[];
  ids?: string[];
  include_total_count?: boolean;
}): Promise<{ records: any[]; totalCount?: number }> {
  const {
    type,
    properties,
    limit,
    search,
    search_mode = "both",
    similarity_threshold = 0.3,
    query_embedding: providedQueryEmbedding,
    ids,
    include_total_count,
  } = params;

  const resultMap = new Map<string, any>();
  const appendResults = (records: any[]) => {
    for (const record of records) {
      const id = record?.id;
      if (!id || resultMap.has(id)) continue;
      resultMap.set(id, record);
    }
  };

  const finalLimit = limit ?? 100;
  const includeTotalCount = include_total_count === true;
  const normalizedType = type ? normalizeRecordType(type).type : undefined;
  const hasIdFilter = Array.isArray(ids) && ids.length > 0;
  const hasSearch = Array.isArray(search) && search.length > 0;
  let totalCount: number | null = null;

  if (hasIdFilter) {
    const idMatches = await fetchRecordsByIds(ids, normalizedType);
    appendResults(idMatches);
    if (includeTotalCount) {
      totalCount = ids.length;
    }
  }

  // Semantic search (vector similarity)
  if (hasSearch && (search_mode === "semantic" || search_mode === "both")) {
    let query_embedding: number[] | undefined = providedQueryEmbedding;
    if (!query_embedding && config.openaiApiKey) {
      const searchText = search.join(" ");
      const generated = await generateEmbedding(searchText);
      query_embedding = generated || undefined;
    }

    if (query_embedding && query_embedding.length === 1536) {
      let embeddingQuery = supabase
        .from("records")
        .select("*")
        .not("embedding", "is", null);

      if (normalizedType) {
        embeddingQuery = embeddingQuery.eq("type", normalizedType);
      }

      const { data: candidates, error: fetchError } =
        await embeddingQuery.limit(finalLimit * 10);

      if (!fetchError && candidates) {
        const queryNorm = Math.sqrt(
          query_embedding.reduce((sum, val) => sum + val * val, 0)
        );

        const scoredCandidates = candidates
          .map((rec: any) => {
            let recEmbedding = rec.embedding;

            if (!recEmbedding) return null;

            if (typeof recEmbedding === "string") {
              try {
                recEmbedding = JSON.parse(recEmbedding);
              } catch {
                return null;
              }
            }

            if (!Array.isArray(recEmbedding) || recEmbedding.length !== 1536) {
              return null;
            }

            const dotProduct = query_embedding.reduce(
              (sum, val, i) => sum + val * recEmbedding[i],
              0
            );
            const recNorm = Math.sqrt(
              recEmbedding.reduce(
                (sum: number, val: number) => sum + val * val,
                0
              )
            );
            const similarity = dotProduct / (queryNorm * recNorm);

            return { ...rec, similarity };
          })
          .filter((rec: any) => rec !== null)
          .sort((a: any, b: any) => b.similarity - a.similarity);

        const semanticMatches = scoredCandidates
          .filter((rec: any) => rec.similarity >= similarity_threshold)
          .slice(0, finalLimit);
        appendResults(semanticMatches);
      }
    }
  }

  // Keyword search
  if (hasSearch && (search_mode === "keyword" || search_mode === "both")) {
    let keywordQuery = supabase.from("records").select("*");

    if (normalizedType) {
      keywordQuery = keywordQuery.eq("type", normalizedType);
    }

    const { data: keywordCandidates, error: keywordError } =
      await keywordQuery.limit(finalLimit * 2);

    if (!keywordError && keywordCandidates) {
      const searchText = search.join(" ").toLowerCase();
      const keywordMatches = keywordCandidates
        .filter((rec: any) => {
          const typeMatch = rec.type?.toLowerCase().includes(searchText);
          const propsText = JSON.stringify(rec.properties || {}).toLowerCase();
          const propsMatch = propsText.includes(searchText);
          return typeMatch || propsMatch;
        })
        .slice(0, finalLimit);
      appendResults(keywordMatches);
    }
  }

  // No search mode
  if (!hasSearch && !hasIdFilter) {
    let query = supabase.from("records").select("*");
    if (normalizedType) query = query.eq("type", normalizedType);
    // Use deterministic ordering: created_at DESC, then id ASC for tiebreaker
    query = query
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(finalLimit);

    const { data, error } = await query;
    if (!error && data) {
      appendResults(data);
    }
  }

  // Filter by exact property matches
  let results = Array.from(resultMap.values());
  if (properties) {
    results = results.filter((rec: any) => {
      return Object.entries(properties).every(([key, value]) => {
        const recValue = (rec.properties as Record<string, unknown>)?.[key];
        return recValue === value;
      });
    });
  }

  // Apply deterministic sorting if no search was performed
  if (!hasSearch) {
    results = sortRecordsDeterministically(results);
  }

  results = results.slice(0, finalLimit);

  // Remove embeddings from response
  const sanitized = results.map((rec: any) => {
    const { embedding, ...rest } = rec;
    void embedding;
    return rest;
  });

  if (includeTotalCount && totalCount === null && !hasSearch && !properties) {
    try {
      let countQuery = supabase
        .from("records")
        .select("id", { count: "exact", head: true });
      if (normalizedType) {
        countQuery = countQuery.eq("type", normalizedType);
      }
      const { count } = await countQuery;
      if (typeof count === "number") {
        totalCount = count;
      }
    } catch {
      totalCount = null;
    }
  }

  return {
    records: sanitized,
    totalCount: includeTotalCount ? totalCount ?? sanitized.length : undefined,
  };
}

// Local-only version of executeRetrieveRecords that works with in-memory records
async function executeRetrieveRecordsLocal(
  localRecords: any[],
  params: {
    type?: string;
    properties?: Record<string, unknown>;
    limit?: number;
    search?: string[];
    search_mode?: "semantic" | "keyword" | "both";
    similarity_threshold?: number;
    query_embedding?: number[];
    ids?: string[];
    include_total_count?: boolean;
  }
): Promise<{ records: any[]; totalCount?: number }> {
  const {
    type,
    properties,
    limit,
    search,
    search_mode = "both",
    similarity_threshold = 0.3,
    query_embedding: providedQueryEmbedding,
    ids,
    include_total_count,
  } = params;

  const resultMap = new Map<string, any>();
  const appendResults = (records: any[]) => {
    for (const record of records) {
      const id = record?.id;
      if (!id || resultMap.has(id)) continue;
      resultMap.set(id, record);
    }
  };

  const finalLimit = limit ?? 100;
  const includeTotalCount = include_total_count === true;
  const normalizedType = type ? normalizeRecordType(type).type : undefined;
  const hasIdFilter = Array.isArray(ids) && ids.length > 0;
  const hasSearch = Array.isArray(search) && search.length > 0;
  let totalCount: number | null = null;

  // Start with all local records
  let candidates = [...localRecords];

  // Filter by type if specified
  if (normalizedType) {
    candidates = candidates.filter((rec: any) => rec.type === normalizedType);
  }

  // Filter by IDs if specified
  if (hasIdFilter) {
    const idMatches = candidates.filter((rec: any) => ids.includes(rec.id));
    appendResults(idMatches);
    if (includeTotalCount) {
      totalCount = idMatches.length;
    }
  }

  // Semantic search (vector similarity)
  if (hasSearch && (search_mode === "semantic" || search_mode === "both")) {
    let query_embedding: number[] | undefined = providedQueryEmbedding;
    if (!query_embedding && config.openaiApiKey) {
      const searchText = search.join(" ");
      const generated = await generateEmbedding(searchText);
      query_embedding = generated || undefined;
    }

    if (
      query_embedding &&
      Array.isArray(query_embedding) &&
      query_embedding.length === 1536
    ) {
      const recordsWithEmbeddings = candidates.filter((rec: any) => {
        if (!rec.embedding) return false;
        let recEmbedding = rec.embedding;
        if (typeof recEmbedding === "string") {
          try {
            recEmbedding = JSON.parse(recEmbedding);
          } catch {
            return false;
          }
        }
        return Array.isArray(recEmbedding) && recEmbedding.length === 1536;
      });

      const queryNorm = Math.sqrt(
        query_embedding.reduce((sum, val) => sum + val * val, 0)
      );

      const scoredCandidates = recordsWithEmbeddings
        .map((rec: any) => {
          let recEmbedding = rec.embedding;
          if (typeof recEmbedding === "string") {
            try {
              recEmbedding = JSON.parse(recEmbedding);
            } catch {
              return null;
            }
          }

          if (!Array.isArray(recEmbedding) || recEmbedding.length !== 1536) {
            return null;
          }

          const dotProduct = query_embedding.reduce(
            (sum, val, i) => sum + val * recEmbedding[i],
            0
          );
          const recNorm = Math.sqrt(
            recEmbedding.reduce(
              (sum: number, val: number) => sum + val * val,
              0
            )
          );
          const similarity = dotProduct / (queryNorm * recNorm);

          return { ...rec, similarity };
        })
        .filter((rec: any) => rec !== null)
        .sort((a: any, b: any) => b.similarity - a.similarity);

      const semanticMatches = scoredCandidates
        .filter((rec: any) => rec.similarity >= similarity_threshold)
        .slice(0, finalLimit);
      appendResults(semanticMatches);
    }
  }

  // Keyword search
  if (hasSearch && (search_mode === "keyword" || search_mode === "both")) {
    const searchText = search.join(" ").toLowerCase();
    const keywordMatches = candidates
      .filter((rec: any) => {
        const typeMatch = rec.type?.toLowerCase().includes(searchText);
        const summaryMatch = rec.summary?.toLowerCase().includes(searchText);
        const propsText = JSON.stringify(rec.properties || {}).toLowerCase();
        const propsMatch = propsText.includes(searchText);
        return typeMatch || summaryMatch || propsMatch;
      })
      .slice(0, finalLimit);
    appendResults(keywordMatches);
  }

  // No search mode - just return records
  if (!hasSearch && !hasIdFilter) {
    const sorted = candidates
      .sort((a: any, b: any) => {
        const timeA = new Date(a.created_at || 0).getTime();
        const timeB = new Date(b.created_at || 0).getTime();
        return timeB - timeA;
      })
      .slice(0, finalLimit);
    appendResults(sorted);
  }

  // Filter by exact property matches
  let results = Array.from(resultMap.values());
  if (properties) {
    results = results.filter((rec: any) => {
      return Object.entries(properties).every(([key, value]) => {
        const recValue = (rec.properties as Record<string, unknown>)?.[key];
        return recValue === value;
      });
    });
  }

  // Apply deterministic sorting if no search was performed
  if (!hasSearch) {
    results = sortRecordsDeterministically(results);
  }

  results = results.slice(0, finalLimit);

  // Remove embeddings from response
  const sanitized = results.map((rec: any) => {
    const { embedding, ...rest } = rec;
    void embedding;
    return rest;
  });

  // Calculate total count if requested
  if (includeTotalCount && totalCount === null && !hasSearch && !properties) {
    totalCount = normalizedType
      ? candidates.filter((rec: any) => rec.type === normalizedType).length
      : candidates.length;
  }

  return {
    records: sanitized,
    totalCount: includeTotalCount ? totalCount ?? sanitized.length : undefined,
  };
}

function extractUUIDs(text: string): string[] {
  const uuidRegex =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const matches = text.match(uuidRegex);
  return matches ? Array.from(new Set(matches)) : [];
}

app.post("/chat", async (req, res) => {
  const schema = z.object({
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant", "system"]),
          content: z.string(),
        })
      )
      .min(1),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    recent_records: z
      .array(
        z.object({
          id: z.string().min(1),
          persisted: z.boolean().optional(),
          payload: z.record(z.unknown()).optional(),
        })
      )
      .optional(),
    local_records: z.array(z.record(z.unknown())).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:chat", req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  if (!config.openaiApiKey) {
    return res
      .status(400)
      .json({ error: "OPENAI_API_KEY not configured on server" });
  }

  const {
    messages,
    model = "gpt-4o-mini",
    temperature = 0.7,
    recent_records: recentRecordsInput = [],
    local_records: localRecordsInput = [],
  } = parsed.data;

  // Determine if we're in local-only mode (local_records provided and non-empty)
  const useLocalOnly =
    Array.isArray(localRecordsInput) && localRecordsInput.length > 0;

  // Extract UUIDs from the last user message
  const lastUserMessage = messages[messages.length - 1];
  const mentionedUUIDs =
    lastUserMessage?.role === "user"
      ? extractUUIDs(lastUserMessage.content || "")
      : [];

  const systemMessage = {
    role: "system" as const,
    content: `You are a helpful assistant for the Neotoma database system. You help users query and understand their stored records.

CRITICAL RULE: When the user asks "how many records" or "records" without explicitly mentioning a type (e.g., "exercise records", "transaction records"), you MUST call retrieve_records WITHOUT the type parameter to get ALL records. Do NOT filter by type based on recent records or context.

When a user asks about records, data, or information that might be stored in the database, use the retrieve_records function to fetch relevant records. Then provide a helpful response based on the retrieved data.

Guidelines:
- Use retrieve_records when the user asks about stored data, records, or information
- If the user mentions a specific record ID (UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx), extract it and use the ids parameter to fetch that exact record
- Extract search terms from the user's query for semantic/keyword search
- CRITICAL: ONLY use the type parameter if the user explicitly uses words like "exercise records", "transaction records", "all [type] records" in their query. If they just say "records" or "how many records", DO NOT use the type parameter - query ALL records
- When the user asks about "records" or "how many records" without specifying a type, query ALL records by omitting the type parameter completely
- Do NOT infer record types from recent records shown in context - those are just examples
- Provide clear, concise answers based on the retrieved records
- If no records are found, let the user know
- Function call results include a \"total_count\" when available; use it to report counts even if the returned \"records\" array is truncated to the current limit
- Be conversational and helpful`,
  };

  const retrieveRecordsFunction = {
    name: "retrieve_records",
    description:
      'Query records from the Neotoma database. IMPORTANT: When the user asks "how many records" or "records" without specifying a type, call this function WITHOUT the type parameter to get ALL records.',
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description:
            'Filter by record type (e.g., "transaction", "note", "exercise"). CRITICAL: ONLY include this parameter if the user explicitly says words like "exercise records", "transaction records", or "all [type] records" in their query. If the user just says "records" or "how many records", DO NOT include this parameter - omit it completely to get ALL records. Do NOT infer the type from recent records or context.',
        },
        properties: {
          type: "object",
          description: "Filter by exact property value matches",
          additionalProperties: true,
        },
        limit: {
          type: "number",
          description:
            "Maximum number of results (default: 10, max: 50 for chat)",
          minimum: 1,
          maximum: 50,
        },
        search: {
          type: "array",
          items: { type: "string" },
          description: "Search terms for semantic/keyword matching",
        },
        search_mode: {
          type: "string",
          enum: ["semantic", "keyword", "both"],
          description:
            "Search mode: semantic (vector similarity), keyword (text matching), or both (default: both)",
        },
        similarity_threshold: {
          type: "number",
          description:
            "Minimum similarity score for semantic search (0-1, default: 0.3)",
          minimum: 0,
          maximum: 1,
        },
        ids: {
          type: "array",
          items: { type: "string" },
          description:
            "Explicit record IDs (UUIDs) to fetch. Use this when the user mentions a specific ID, or when referencing recently created records. This is the most direct way to retrieve a record by its identifier.",
        },
      },
      required: [],
    },
  };

  try {
    const chatMessages: ChatMessage[] = [systemMessage];
    const sanitizeRecord = (record: any) => {
      if (!record) return null;
      const { embedding, ...rest } = record;
      void embedding;
      return rest;
    };

    const persistedRecentFromInput = recentRecordsInput
      .filter((record) => record.persisted !== false)
      .map((record) => record.id);

    // Merge mentioned UUIDs with recent records (prioritize mentioned ones)
    const allRelevantIds = [
      ...mentionedUUIDs,
      ...persistedRecentFromInput,
    ].filter((id, index, arr) => arr.indexOf(id) === index); // dedupe

    const persistedRecent = allRelevantIds;
    const inlineRecent = recentRecordsInput
      .filter(
        (record) =>
          record.persisted === false &&
          record.payload &&
          typeof record.payload === "object"
      )
      .map((record) => ({
        id: record.id,
        ...(record.payload as Record<string, unknown>),
      }));

    let persistedRecentRecords: any[] = [];
    if (persistedRecent.length > 0) {
      if (useLocalOnly) {
        // In local-only mode, fetch from local_records
        persistedRecentRecords = localRecordsInput.filter(
          (rec: any) => rec.id && persistedRecent.includes(rec.id)
        );
        // Preserve order
        const orderMap = new Map(
          persistedRecent.map((id, index) => [id, index])
        );
        persistedRecentRecords.sort((a, b) => {
          const aIndex = orderMap.get(a.id) ?? 0;
          const bIndex = orderMap.get(b.id) ?? 0;
          return aIndex - bIndex;
        });
      } else {
        try {
          persistedRecentRecords = await fetchRecordsByIds(persistedRecent);
        } catch (error) {
          logError("SupabaseError:chat:recent_records", req, error);
        }
      }
    }

    const combinedRecentRecords = [
      ...persistedRecentRecords.map(sanitizeRecord).filter(Boolean),
      ...inlineRecent.map(sanitizeRecord).filter(Boolean),
    ] as any[];
    const recentRecordCatalog: any[] = [];
    const seenRecentIds = new Set<string>();
    combinedRecentRecords.forEach((rec) => {
      if (!rec?.id || seenRecentIds.has(rec.id)) {
        return;
      }
      seenRecentIds.add(rec.id);
      recentRecordCatalog.push(rec);
    });

    const MAX_RECENT_CONTEXT = 5;
    if (recentRecordCatalog.length > 0) {
      const contextLines = recentRecordCatalog
        .slice(0, MAX_RECENT_CONTEXT)
        .map((rec, index) => {
          const props = rec.properties
            ? JSON.stringify(rec.properties).slice(0, 280)
            : "";
          const summary = rec.summary || "";
          return `${index + 1}. ID: ${rec.id} | Type: ${
            rec.type || "unknown"
          } | Summary: ${summary || props || "No summary available"}`;
        })
        .join("\n");

      const persistedInstruction = persistedRecent.length
        ? `When the user references these records (e.g., "it", "that file", "the thing I just saved"), OR when they mention a specific UUID, call retrieve_records with ids [${persistedRecent.join(
            ", "
          )}] to fetch the exact objects. If the user mentions a UUID that matches one of these IDs, use it. IMPORTANT: The types shown in the recent records above are for reference only. Do NOT use the type parameter unless the user explicitly asks for records of a specific type (e.g., "exercise records", "all transactions"). When the user asks about "records" or "how many records" without specifying a type, query ALL records by omitting the type parameter.`
        : "";
      const inlineInstruction = inlineRecent.length
        ? "Some records are only available inline (not yet synced). Their payload is already provided above—cite them directly without calling retrieve_records."
        : "";
      const mentionedUUIDsInstruction =
        mentionedUUIDs.length > 0 &&
        !persistedRecentFromInput.some((id) => mentionedUUIDs.includes(id))
          ? `The user mentioned UUID(s): ${mentionedUUIDs.join(
              ", "
            )}. Use retrieve_records with ids parameter to fetch these records directly.`
          : "";

      chatMessages.push({
        role: "system",
        content:
          `Recent session records (highest priority first):\n${contextLines}\n\n${[
            persistedInstruction,
            inlineInstruction,
            mentionedUUIDsInstruction,
          ]
            .filter(Boolean)
            .join(" ")}`.trim(),
      });
    } else if (mentionedUUIDs.length > 0) {
      // No recent records, but user mentioned UUIDs - add instruction to use them
      const mentionedUUIDsInstruction = `The user mentioned UUID(s): ${mentionedUUIDs.join(
        ", "
      )}. Use retrieve_records with ids parameter to fetch these records directly.`;
      chatMessages.push({
        role: "system",
        content: mentionedUUIDsInstruction,
      });
    }

    chatMessages.push(...messages);
    const functionCalls: Array<{
      name: string;
      arguments: string;
      result?: any;
    }> = [];
    const recordsQueried: any[] = [];
    let lastRetrieveTotalCount: number | null = null;
    const maxIterations = 5;
    let iteration = 0;

    while (iteration < maxIterations) {
      const openAIMessages = serializeChatMessagesForOpenAI(chatMessages);
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.openaiApiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: openAIMessages,
            functions: [retrieveRecordsFunction],
            function_call: "auto",
            temperature,
          }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        logError("OpenAIError:chat", req, text);
        return res.status(502).json({ error: "Upstream model error" });
      }

      const data = (await response.json()) as {
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
        return res.status(502).json({ error: "Invalid response from model" });
      }

      const message = choice.message;
      if (
        message.role &&
        message.content !== null &&
        message.content !== undefined
      ) {
        chatMessages.push({
          role: message.role as "assistant" | "user" | "system",
          content: message.content || "",
        });
      }

      // If function call, execute it
      if (message.function_call?.name && message.function_call?.arguments) {
        const functionName = message.function_call.name;
        const functionArgs = message.function_call.arguments;

        if (functionName === "retrieve_records") {
          try {
            const args = JSON.parse(functionArgs);
            const { records, totalCount } = useLocalOnly
              ? await executeRetrieveRecordsLocal(localRecordsInput as any[], {
                  type: args.type,
                  properties: args.properties,
                  limit: Math.min(args.limit || 10, 50), // Cap at 50 for chat
                  search: args.search,
                  search_mode: args.search_mode || "both",
                  similarity_threshold: args.similarity_threshold || 0.3,
                  ids: Array.isArray(args.ids)
                    ? args.ids.slice(0, 50)
                    : undefined,
                  include_total_count: true,
                })
              : await executeRetrieveRecords({
                  type: args.type,
                  properties: args.properties,
                  limit: Math.min(args.limit || 10, 50), // Cap at 50 for chat
                  search: args.search,
                  search_mode: args.search_mode || "both",
                  similarity_threshold: args.similarity_threshold || 0.3,
                  ids: Array.isArray(args.ids)
                    ? args.ids.slice(0, 50)
                    : undefined,
                  include_total_count: true,
                });

            recordsQueried.push(...records);
            if (typeof totalCount === "number") {
              lastRetrieveTotalCount = totalCount;
            }

            const functionResult = {
              records,
              total_count:
                typeof totalCount === "number" ? totalCount : undefined,
            };

            functionCalls.push({
              name: functionName,
              arguments: functionArgs,
              result: functionResult,
            });

            // Add function result to conversation
            chatMessages.push({
              role: "function",
              name: functionName,
              content: JSON.stringify(functionResult),
            });

            iteration++;
            continue; // Continue to next iteration to get final response
          } catch (error) {
            logError("FunctionExecutionError:chat", req, error);
            chatMessages.push({
              role: "function",
              name: functionName,
              content: JSON.stringify({ error: "Failed to retrieve records" }),
            });
            iteration++;
            continue;
          }
        }
      }

      // If no function call, we have the final response
      const assistantMessage = {
        role: "assistant" as const,
        content: message.content || "",
      };

      return res.json({
        message: assistantMessage,
        records_queried: recordsQueried.length > 0 ? recordsQueried : undefined,
        records_total_count:
          typeof lastRetrieveTotalCount === "number"
            ? lastRetrieveTotalCount
            : undefined,
        function_calls:
          functionCalls.length > 0
            ? functionCalls.map((fc) => ({
                name: fc.name,
                arguments: JSON.parse(fc.arguments),
              }))
            : undefined,
      });
    }

    // If we've exhausted iterations, return the last message
    const lastMessage = chatMessages[chatMessages.length - 1];
    return res.json({
      message: {
        role: "assistant",
        content:
          typeof lastMessage.content === "string"
            ? lastMessage.content
            : "Unable to complete request",
      },
      records_queried: recordsQueried.length > 0 ? recordsQueried : undefined,
      records_total_count:
        typeof lastRetrieveTotalCount === "number"
          ? lastRetrieveTotalCount
          : undefined,
      function_calls:
        functionCalls.length > 0
          ? functionCalls.map((fc) => ({
              name: fc.name,
              arguments: JSON.parse(fc.arguments),
            }))
          : undefined,
    });
  } catch (error) {
    logError("Exception:chat", req, error);
    return res.status(500).json({ error: "Chat failed" });
  }
});

app.get("/openapi.yaml", (req, res) => {
  res.type("text/yaml");
  res.sendFile(process.cwd() + "/openapi.yaml");
});

app.get("/import/plaid/link_demo", async (req, res) => {
  if (!plaidConfiguredOrError(res)) {
    return;
  }
  const userId = config.plaid.linkDefaults?.userId;
  if (!userId) {
    return res
      .status(500)
      .send("PLAID_LINK_USER_ID is required to use the demo");
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

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (error) {
    logError("PlaidError:plaid_link_demo", req, error as any);
    const normalized = normalizePlaidError(error) || {
      type: "unknown_error",
      message: error instanceof Error ? error.message : "Unknown error",
    };
    return res.status(502).json({ error: normalized });
  }
});

app.get("/plaid/link_demo", (req, res) => {
  const token =
    typeof req.query.token === "string"
      ? `?token=${encodeURIComponent(req.query.token)}`
      : "";
  return res.redirect(302, `/import/plaid/link_demo${token}`);
});

// SPA fallback - serve index.html for non-API routes (must be after all API routes)
// Initialize encryption service
initServerKeys().catch((err) => {
  console.error("Failed to initialize encryption service:", err);
});

if (process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART !== "1") {
  const httpPort = process.env.HTTP_PORT
    ? parseInt(process.env.HTTP_PORT, 10)
    : config.port || 3000;
  app.listen(httpPort, () => {
    // eslint-disable-next-line no-console
    console.log(`HTTP Actions listening on :${httpPort}`);
  });
}

/**
 * Check if a record matches keyword search terms
 */
export function recordMatchesKeywordSearch(
  record: import('./db.js').NeotomaRecord,
  searchTerms: string[]
): boolean {
  const recordText = JSON.stringify(record.properties || {}).toLowerCase();
  const recordType = record.type.toLowerCase();
  
  return searchTerms.some(term => {
    const termLower = term.toLowerCase();
    return recordText.includes(termLower) || recordType.includes(termLower);
  });
}
