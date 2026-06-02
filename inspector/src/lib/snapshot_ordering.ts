/**
 * Client-side port of `orderedSnapshotKeys` from
 * `src/services/canonical_markdown.ts`. Keeps the two implementations aligned
 * so the Inspector can order fields even when the backend doesn't ship a
 * `primary_fields` hint.
 */

const EXCLUDED_SNAPSHOT_KEYS = new Set([
  "schema_version",
  "entity_type",
  "_deleted",
]);

const SPECIAL_FIRST_KEYS = [
  "title",
  "name",
  "canonical_name",
  "description",
  "summary",
];

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

/**
 * Best-effort shortlist of "primary" fields for overview display.
 * Prefers common identity fields, then falls back to the schema-ordered list.
 */
export function pickPrimaryFields(
  snapshot: Record<string, unknown>,
  schemaFieldOrder: string[] = [],
  max = 5
): string[] {
  const all = orderedSnapshotKeys(snapshot, schemaFieldOrder);
  const picked: string[] = [];
  const seen = new Set<string>();
  const prefer = new Set([
    "title",
    "name",
    "canonical_name",
    "description",
    "summary",
    "status",
    "due_date",
    "start_date",
    "end_date",
    "owner",
    "author",
    "recipient",
    "sender",
    "price",
    "amount",
    "currency",
    "location",
    "url",
    "email",
    "phone",
  ]);
  for (const k of all) {
    if (picked.length >= max) break;
    if (prefer.has(k) && !seen.has(k)) {
      picked.push(k);
      seen.add(k);
    }
  }
  for (const k of all) {
    if (picked.length >= max) break;
    if (!seen.has(k)) {
      const v = snapshot[k];
      if (v === null || v === undefined) continue;
      if (typeof v === "string" && !v.trim()) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      picked.push(k);
      seen.add(k);
    }
  }
  return picked;
}
