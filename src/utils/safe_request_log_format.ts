/**
 * Deep, stdout-safe formatting for HTTP request debug logs.
 * Avoids Node's shallow console serialization (`[Object]`) while applying
 * key-based and pattern-based PII / secret reduction before `util.inspect`.
 */

import { inspect } from "node:util";

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
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const lower = key.toLowerCase();
    const raw = obj[key];

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
      out[key] = `${scrubScalarString(raw.slice(0, TRUNCATE_PREFIX_LEN))}…[truncated len=${raw.length}]`;
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
