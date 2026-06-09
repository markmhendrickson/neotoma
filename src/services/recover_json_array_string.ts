/**
 * #1595: defensive recovery for a JSON-array-shaped *string*.
 *
 * Some transports/clients deliver a stringified array (e.g. `'["a","b"]'`) to an
 * array-typed field instead of a real array — the upstream cause of the #1541
 * malformed-element artifact. The Neotoma server write path itself preserves
 * arrays; this helper lets the substrate tolerate the malformed input instead of
 * either dropping it to `[]` (canonicalizer) or adding the whole blob as one
 * literal-string element (merge_array reducer).
 *
 * Single source of truth for the heuristic so the reducer and canonicalizer
 * cannot drift, and so the recovery signal is wired through one locus.
 *
 * Returns the parsed array when `value` is a string that JSON-parses to an
 * array; otherwise returns `null` (no recovery applies — caller keeps `value`).
 */
export function recoverJsonArrayString(value: unknown): unknown[] | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
