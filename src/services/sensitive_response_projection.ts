/**
 * Remove credential-bearing fields from generic response payloads.
 *
 * Apply this at serialization boundaries so direct, hydrated, and write
 * response shapes cannot accidentally bypass it. Explicit credential-issuance
 * operations may allow a named top-level field exactly once; nested stored
 * copies remain redacted.
 */

export interface SensitiveResponseProjectionOptions {
  allowTopLevelFields?: readonly string[];
}

const SENSITIVE_RESPONSE_KEYS = [
  "access_token",
  "accessToken",
  "guest_access_token",
  "guestAccessToken",
  "guest_access_token_hash",
  "guestAccessTokenHash",
  "token_hash",
  "tokenHash",
] as const;

function normalizedKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

const NORMALIZED_SENSITIVE_RESPONSE_KEYS = new Set(SENSITIVE_RESPONSE_KEYS.map(normalizedKey));

function project(value: unknown, allowedTopLevelKeys: ReadonlySet<string>, depth: number): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => project(item, allowedTopLevelKeys, depth + 1));
  }
  if (!value || typeof value !== "object") return value;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = normalizedKey(key);
    if (NORMALIZED_SENSITIVE_RESPONSE_KEYS.has(normalized)) {
      if (depth === 0 && allowedTopLevelKeys.has(normalized)) out[key] = child;
      continue;
    }
    out[key] = project(child, allowedTopLevelKeys, depth + 1);
  }
  return out;
}

export function projectSensitiveResponse<T>(
  value: T,
  options: SensitiveResponseProjectionOptions = {}
): T {
  const allowedTopLevelKeys = new Set((options.allowTopLevelFields ?? []).map(normalizedKey));
  return project(value, allowedTopLevelKeys, 0) as T;
}
