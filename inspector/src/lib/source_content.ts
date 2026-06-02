/** If `raw` is a single JSON object or array, return the parsed value; otherwise null. */
export function tryParseJsonDocument(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const c = trimmed[0];
  if (c !== "{" && c !== "[") return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

/** Above this size, buffering the whole file in JS is unreliable for inline preview. */
export const INLINE_SOURCE_PREVIEW_MAX_BYTES = 24 * 1024 * 1024;
