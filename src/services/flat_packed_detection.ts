/**
 * Flat-packed row detector.
 *
 * Rejects entity payloads that smuggle a whole CSV-style table into a single
 * entity as numbered-column keys (e.g. `contact_1_name`, `contact_1_email`,
 * `contact_2_name`, `contact_2_email`). These are almost always a bug where a
 * caller stringified many rows into one entity. Neotoma cannot build per-row
 * snapshots or timeline events from that shape.
 *
 * The detector is schema-agnostic: it flags any entity whose fields include
 * two or more `<prefix>_<index>_<suffix>` keys with numeric index segments,
 * where the same `<prefix>_<index>` group contains at least two distinct
 * numeric indices.
 *
 * When detected, `extractFlatPackedRows` returns suggested per-row entities
 * so callers can either split and retry themselves or surface the suggestion
 * in the error payload.
 */

export interface FlatPackedDetection {
  detected: boolean;
  prefix?: string;
  indices?: number[];
  suggestedEntities?: Array<Record<string, unknown>>;
  exampleKeys?: string[];
}

const FLAT_PACKED_KEY = /^([a-z][a-z0-9_]*?)_(\d+)_([a-z0-9_]+)$/i;

export function detectFlatPackedRows(fields: Record<string, unknown>): FlatPackedDetection {
  if (!fields || typeof fields !== "object") {
    return { detected: false };
  }

  // Group keys by (prefix, numeric_index) → list of suffix fields.
  const groups = new Map<string, Map<number, Record<string, unknown>>>();
  const exampleKeysByPrefix = new Map<string, string[]>();

  for (const [key, value] of Object.entries(fields)) {
    const match = FLAT_PACKED_KEY.exec(key);
    if (!match) continue;
    const [, prefix, indexStr, suffix] = match;
    const index = Number.parseInt(indexStr, 10);
    if (!Number.isFinite(index)) continue;

    if (!groups.has(prefix)) {
      groups.set(prefix, new Map());
    }
    const byIndex = groups.get(prefix)!;
    if (!byIndex.has(index)) {
      byIndex.set(index, {});
    }
    byIndex.get(index)![suffix] = value;

    if (!exampleKeysByPrefix.has(prefix)) {
      exampleKeysByPrefix.set(prefix, []);
    }
    const samples = exampleKeysByPrefix.get(prefix)!;
    if (samples.length < 6) samples.push(key);
  }

  // A prefix is flat-packed if it has at least two distinct numeric indices
  // AND each row has at least two suffix fields (so it really looks like a
  // column set, not coincidental `address_1`, `phone_2` flat names).
  let best: { prefix: string; indices: number[] } | null = null;
  for (const [prefix, byIndex] of groups.entries()) {
    if (byIndex.size < 2) continue;
    let rowsWithMultipleSuffixes = 0;
    for (const row of byIndex.values()) {
      if (Object.keys(row).length >= 2) rowsWithMultipleSuffixes++;
    }
    if (rowsWithMultipleSuffixes < 2) continue;
    if (!best || byIndex.size > best.indices.length) {
      best = { prefix, indices: Array.from(byIndex.keys()).sort((a, b) => a - b) };
    }
  }

  if (!best) return { detected: false };

  const byIndex = groups.get(best.prefix)!;
  const suggestedEntities = best.indices.map((idx) => ({
    entity_type: best!.prefix,
    ...byIndex.get(idx)!,
  }));

  return {
    detected: true,
    prefix: best.prefix,
    indices: best.indices,
    suggestedEntities,
    exampleKeys: exampleKeysByPrefix.get(best.prefix)?.slice(0, 6) ?? [],
  };
}

export class FlatPackedRowsError extends Error {
  readonly code = "ERR_FLAT_PACKED_ROWS";
  readonly detection: FlatPackedDetection;

  constructor(detection: FlatPackedDetection) {
    const prefix = detection.prefix ?? "row";
    const count = detection.indices?.length ?? 0;
    super(
      `Detected ${count} flat-packed ${prefix} rows in a single entity payload. ` +
        `Keys like "${(detection.exampleKeys ?? []).join(", ")}" indicate that a tabular dataset was smuggled ` +
        `into one entity. Split into ${count} distinct entities (one per row) and retry.`
    );
    this.name = "FlatPackedRowsError";
    this.detection = detection;
  }
}
