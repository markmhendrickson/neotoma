const EXCLUDED_SNAPSHOT_KEYS = new Set(["schema_version", "entity_type", "_deleted"]);

const SPECIAL_FIRST_KEYS = ["title", "name", "canonical_name", "description", "summary"];

/**
 * Order the keys of a snapshot-like record deterministically.
 *
 * Priority:
 *   1. Conceptual first keys (title, name, canonical_name, description, summary)
 *      that actually appear.
 *   2. Schema-declared field order (when schema is provided).
 *   3. Any remaining keys, alphabetically sorted.
 *
 * Keys in EXCLUDED_SNAPSHOT_KEYS are dropped (they live in the header instead).
 * Keys whose value is the `_deleted` sentinel are also dropped.
 */
export function orderedSnapshotKeys(
  snapshot: Record<string, unknown>,
  schemaFieldOrder: string[] = []
): string[] {
  const present = new Set(Object.keys(snapshot));
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const k of SPECIAL_FIRST_KEYS) {
    if (present.has(k) && !EXCLUDED_SNAPSHOT_KEYS.has(k) && !seen.has(k)) {
      ordered.push(k);
      seen.add(k);
    }
  }
  for (const k of schemaFieldOrder) {
    if (present.has(k) && !EXCLUDED_SNAPSHOT_KEYS.has(k) && !seen.has(k)) {
      ordered.push(k);
      seen.add(k);
    }
  }
  const remaining = [...present]
    .filter((k) => !EXCLUDED_SNAPSHOT_KEYS.has(k) && !seen.has(k))
    .sort();
  for (const k of remaining) ordered.push(k);

  return ordered;
}
