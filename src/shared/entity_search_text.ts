/**
 * Lexical search haystack for one entity: canonical_name + snapshot + raw
 * fragment text, normalized with `normalizeSearchText`.
 *
 * Shared by lexical search (`entity_handlers.ts`) and the snapshot writers that
 * store the same text in `entity_snapshots.search_text`, so the stored value and
 * the value search would build can never drift apart. A NULL `search_text`
 * means "build it the old way"; see `refreshEntitySearchText` in
 * `src/repositories/sqlite/local_db_adapter.ts` for the write-time fill.
 */
import { db } from "../db.js";
import { normalizeSearchText } from "./search_normalization.js";

export function stringifySnapshot(snapshot: unknown): string {
  if (typeof snapshot === "string") {
    return snapshot;
  }
  if (snapshot == null) {
    return "";
  }
  try {
    return JSON.stringify(snapshot);
  } catch {
    return "";
  }
}

/** Canonical lexical haystack: canonical_name + snapshot + optional raw_fragments text. */
export function buildEntityLexicalSearchText(
  canonicalName: string,
  snapshot: unknown,
  rawFragmentText?: string
): string {
  return buildEntityLexicalSearchTextFromNormalized(
    normalizeSearchText(canonicalName),
    normalizeSearchText(stringifySnapshot(snapshot)),
    rawFragmentText
  );
}

/**
 * Variant of `buildEntityLexicalSearchText` that takes canonical_name and
 * snapshot text already normalized, so callers that also score against those
 * parts stringify and clean each snapshot once.
 */
export function buildEntityLexicalSearchTextFromNormalized(
  normalizedCanonical: string,
  normalizedSnapshot: string,
  rawFragmentText?: string
): string {
  const normalizedFragments = normalizeSearchText(rawFragmentText ?? "");
  return `${normalizedCanonical} ${normalizedSnapshot} ${normalizedFragments}`.trim();
}

/**
 * Text form of a raw_fragments value for the lexical haystack. The db adapter
 * parses JSON columns, so object and array values arrive as objects; serialise
 * them so their content is searchable rather than "[object Object]".
 */
function rawFragmentValueText(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object") {
    return stringifySnapshot(value);
  }
  return String(value);
}

/** One fragment's contribution to the haystack ("" when it adds nothing). */
export function rawFragmentPieceText(fragmentKey: string, fragmentValue: unknown): string {
  return `${fragmentKey} ${rawFragmentValueText(fragmentValue)}`.trim();
}

/** Join fragment pieces in row order, skipping empty ones. */
export function joinRawFragmentPieces(
  rows: Array<{ fragment_key: string; fragment_value: unknown }>
): string | undefined {
  let text: string | undefined;
  for (const row of rows) {
    const piece = rawFragmentPieceText(row.fragment_key, row.fragment_value);
    if (!piece) continue;
    text = text ? `${text} ${piece}` : piece;
  }
  return text;
}

export async function loadRawFragmentTextByEntityId(
  entityIds: string[]
): Promise<Map<string, string>> {
  const fragmentTextByEntityId = new Map<string, string>();
  if (entityIds.length === 0) {
    return fragmentTextByEntityId;
  }

  const chunkSize = 500;
  for (let i = 0; i < entityIds.length; i += chunkSize) {
    const chunk = entityIds.slice(i, i + chunkSize);
    const { data, error } = await db
      .from("raw_fragments")
      .select("entity_id, fragment_key, fragment_value")
      .in("entity_id", chunk);

    if (error) {
      throw new Error(`Failed lexical raw_fragments query: ${error.message}`);
    }

    for (const row of (data ?? []) as Array<{
      entity_id: string | null;
      fragment_key: string;
      fragment_value: unknown;
    }>) {
      if (!row.entity_id) {
        continue;
      }
      const piece = rawFragmentPieceText(row.fragment_key, row.fragment_value);
      if (!piece) {
        continue;
      }
      const existing = fragmentTextByEntityId.get(row.entity_id);
      fragmentTextByEntityId.set(row.entity_id, existing ? `${existing} ${piece}` : piece);
    }
  }

  return fragmentTextByEntityId;
}
