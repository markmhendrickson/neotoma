/** MCP tool-result budget shared by every JSON result serialized by buildTextResponse. */
export const DEFAULT_MAX_RESPONSE_BYTES = 65_536;
export const MIN_CONFIGURABLE_RESPONSE_BYTES = 1_000;

export interface ResponseBudgetResult {
  text: string;
  truncated: boolean;
  originalBytes: number;
}

/** Invalid configuration always falls back to the bounded default. */
export function resolveMaxResponseBytes(raw: string | undefined): number {
  if (raw === undefined || !/^[0-9]+$/.test(raw.trim())) return DEFAULT_MAX_RESPONSE_BYTES;
  const value = Number(raw.trim());
  return Number.isSafeInteger(value) && value >= MIN_CONFIGURABLE_RESPONSE_BYTES
    ? value
    : DEFAULT_MAX_RESPONSE_BYTES;
}

/** Withhold oversized JSON as a standard error envelope, never cut its text. */
export function applyResponseBudget(serialized: string, limitBytes: number): ResponseBudgetResult {
  const originalBytes = Buffer.byteLength(serialized, "utf8");
  if (originalBytes <= limitBytes) return { text: serialized, truncated: false, originalBytes };

  const text = JSON.stringify({
    error: {
      error_code: "RESPONSE_TOO_LARGE",
      message: "MCP result withheld because it exceeds the response budget.",
      details: { original_size_bytes: originalBytes, limit_bytes: limitBytes },
      hint: "Narrow the request and retry with fewer results or smaller fields.",
      timestamp: new Date().toISOString(),
    },
  });
  return { text, truncated: true, originalBytes };
}
