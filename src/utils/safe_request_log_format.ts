/**
 * Deep, stdout-safe formatting for HTTP request debug logs.
 * Avoids Node's shallow console serialization (`[Object]`) while applying
 * key-based and pattern-based PII / secret reduction before `util.inspect`.
 */

import { inspect } from "node:util";

import { DATA_ORIGIN_KINDS } from "../shared/action_schemas.js";

/** Keys whose values are almost always credentials or signing material. */
const SENSITIVE_KEY_NAMES = new Set([
  "token",
  "accesstoken",
  "refreshtoken",
  "password",
  "secret",
  "apikey",
  "apisecret",
  "client_secret",
  "clientsecret",
  "authorization",
  "bearer_token",
  "bearertoken",
  "public_token",
  "publictoken",
  "id_token",
  "idtoken",
  "cookie",
  "set-cookie",
  "mnemonic",
  "private_key",
  "privatekey",
  "ssh_key",
  "sshkey",
  "credit_card",
  "creditcard",
]);

/** Large blobs that commonly hold raw upstream payloads (high PII density). */
const OMIT_RECURSE_KEYS = new Set(["api_response_data"]);

/**
 * Free-text fields where logging full strings violates observability / privacy
 * rules; keep length only so operators can see store shape.
 */
const OMIT_STRING_KEYS = new Set([
  "content",
  "body",
  "body_text",
  "body_html",
  "raw_text",
  "transcript",
  "message",
]);

/** Long narrative fields: keep a short prefix after scrubbing, then elide. */
const TRUNCATE_STRING_KEYS = new Set(["summary", "description", "notes", "subject"]);

/**
 * `data_origin` (#2242) and the snapshot `data_origins` map carry
 * caller-claimed locators, URLs, and notes that may hold local paths, message
 * ids, or URL tokens. Their content never reaches a log line: only the origin
 * `kind` and per-field lengths are kept.
 */
const DATA_ORIGIN_KEY = "data_origin";
const DATA_ORIGINS_KEY = "data_origins";
const KNOWN_DATA_ORIGIN_KINDS = new Set<string>(DATA_ORIGIN_KINDS);

/** Log-safe summary of one `data_origin` value: kind plus field lengths. */
export function summarizeDataOriginForLog(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object" || Array.isArray(value)) {
    const length = typeof value === "string" ? value.length : undefined;
    return `[omitted:data_origin type=${Array.isArray(value) ? "array" : typeof value}${
      length !== undefined ? ` len=${length}` : ""
    }]`;
  }
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (key === "kind") {
      out.kind =
        typeof raw === "string" && KNOWN_DATA_ORIGIN_KINDS.has(raw) ? raw : "[omitted:kind]";
      continue;
    }
    // Field names are attacker-chosen on a malformed (non-strict) input too, so
    // only keep a name that is a plain identifier.
    const safeKey = /^[a-z_]{1,32}$/.test(key) ? key : "[key]";
    out[`${safeKey}_len`] = typeof raw === "string" ? raw.length : `[${typeof raw}]`;
  }
  return out;
}

function summarizeDataOriginsMapForLog(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return summarizeDataOriginForLog(value);
  }
  return `[omitted:data_origins count=${Object.keys(value as Record<string, unknown>).length}]`;
}

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const US_PHONE_RE = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const BEARERISH_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi;
const JWTISH_RE = /\beyJ[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}\b/g;

const MAX_DEPTH = 42;
const MAX_STRING_INLINE = 2048;
const MAX_STRING_KEEP = 400;
const TRUNCATE_PREFIX_LEN = 120;

function scrubScalarString(s: string): string {
  let out = s;
  if (out.length > MAX_STRING_INLINE) {
    out = `${out.slice(0, MAX_STRING_KEEP)}…[truncated total=${s.length}]`;
  }
  out = out.replace(EMAIL_RE, "[REDACTED:email]");
  out = out.replace(US_PHONE_RE, "[REDACTED:phone]");
  out = out.replace(BEARERISH_RE, "[REDACTED:bearer]");
  out = out.replace(JWTISH_RE, "[REDACTED:jwt]");
  return out;
}

function deepSanitizeForRequestLog(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (depth > MAX_DEPTH) {
    return "[MAX_DEPTH]";
  }
  if (value === null || value === undefined) {
    return value;
  }
  const t = typeof value;
  if (t === "string") {
    return scrubScalarString(value as string);
  }
  if (t === "number" || t === "boolean" || t === "bigint" || t === "symbol") {
    return value;
  }
  if (t !== "object") {
    return "[UNSERIALIZABLE]";
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepSanitizeForRequestLog(item, seen, depth + 1));
  }

  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  const obj = value as Record<string, unknown>;
  // A validation issue about a data_origin field (Zod `{ path, received }`)
  // may echo the submitted value in `received`; keep the issue, drop the value.
  const isDataOriginIssue =
    Array.isArray(obj.path) && (obj.path as unknown[]).includes(DATA_ORIGIN_KEY);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const lower = key.toLowerCase();
    const raw = obj[key];

    if (isDataOriginIssue && lower === "received") {
      out[key] = "[omitted:received]";
      continue;
    }

    if (lower === DATA_ORIGIN_KEY) {
      out[key] = summarizeDataOriginForLog(raw);
      continue;
    }
    if (lower === DATA_ORIGINS_KEY) {
      out[key] = summarizeDataOriginsMapForLog(raw);
      continue;
    }
    if (OMIT_RECURSE_KEYS.has(lower)) {
      out[key] = "[REDACTED:payload_field]";
      continue;
    }
    if (SENSITIVE_KEY_NAMES.has(lower)) {
      out[key] = "[REDACTED]";
      continue;
    }
    if (typeof raw === "string" && OMIT_STRING_KEYS.has(lower)) {
      out[key] = `[omitted:${key} len=${raw.length}]`;
      continue;
    }
    if (typeof raw === "string" && TRUNCATE_STRING_KEYS.has(lower) && raw.length > 180) {
      out[key] =
        `${scrubScalarString(raw.slice(0, TRUNCATE_PREFIX_LEN))}…[truncated len=${raw.length}]`;
      continue;
    }
    out[key] = deepSanitizeForRequestLog(raw, seen, depth + 1);
  }
  return out;
}

/**
 * Format a pre-redacted request log object (e.g. output of `redactSensitiveFields`)
 * for a single console line with full structural depth.
 */
export function formatRequestLogLine(
  level: "DEBUG" | "WARN" | "ERROR",
  event: string,
  payload: Record<string, unknown>
): string {
  const sanitized = deepSanitizeForRequestLog(payload, new WeakSet<object>(), 0);
  const inspected = inspect(sanitized, {
    depth: null,
    colors: false,
    maxArrayLength: 80,
    maxStringLength: 600,
    breakLength: 100,
    compact: false,
  });
  return `[${level}] ${event} ${inspected}`;
}
