/**
 * Parse `--corrected-value` for `neotoma corrections create`.
 *
 * When the shell passes JSON (arrays, objects, booleans, numbers, quoted strings),
 * `JSON.parse` yields the correct shape for `/correct`. Without this, a value
 * like `'["a","b"]'` is sent as a string and `merge_array` fields (e.g. issue
 * `labels`) incorrectly merge one literal string element.
 */
export function parseCliCorrectedValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return raw;
  }
}
