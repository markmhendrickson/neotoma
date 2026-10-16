/**
 * Shared search-text normalization (#1572).
 *
 * Dependency-free so it can be imported by both the lexical-search module
 * (`src/shared/action_handlers/entity_handlers.ts`) and the schema registry
 * (`src/services/schema_registry.ts`) without creating an import cycle —
 * entity_handlers already imports schema_registry, so schema_registry cannot
 * import entity_handlers. Previously this normalizer was duplicated in both
 * files (the registry copy was `normalizeConceptPhrase`); a future change to
 * tokenization (e.g. Unicode folding, stemming) would have had to be mirrored
 * in two places or the concept→type synonym bridge would silently stop
 * matching. Keeping it here is the single source of truth.
 *
 * Lowercases, maps hyphen/underscore to space, strips non-word characters,
 * and collapses whitespace, so a query string and a stored `query_synonyms`
 * phrase compare on the same footing.
 */
export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Serialized snapshot text as lexical search sees it (#2659). */
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

/**
 * One `raw_fragments` row's contribution to an entity's lexical text: key and
 * value joined by a space, in the exact form search has always used (a
 * non-string value goes through template-literal conversion, so an object reads
 * "[object Object]"). Returns "" for a row that contributes nothing.
 */
export function rawFragmentSearchPiece(fragmentKey: unknown, fragmentValue: unknown): string {
  return `${fragmentKey} ${fragmentValue ?? ""}`.trim();
}

/** Canonical lexical haystack: canonical_name + snapshot + optional raw_fragments text. */
export function buildEntityLexicalSearchText(
  canonicalName: string,
  snapshot: unknown,
  rawFragmentText?: string
): string {
  const normalizedCanonical = normalizeSearchText(canonicalName);
  const normalizedSnapshot = normalizeSearchText(stringifySnapshot(snapshot));
  const normalizedFragments = normalizeSearchText(rawFragmentText ?? "");
  return `${normalizedCanonical} ${normalizedSnapshot} ${normalizedFragments}`.trim();
}

/**
 * The text stored in the lexical prefilter index for one entity (#2659): the
 * distinct words of {@link buildEntityLexicalSearchText}, space-separated.
 *
 * A query token never contains a space, so it is a substring of the lexical
 * text exactly when it is a substring of one of the text's words. Keeping each
 * distinct word once therefore preserves every substring match a token can
 * make, and the index stays small for repetitive snapshots.
 */
export function entitySearchIndexBody(lexicalText: string): string {
  if (!lexicalText) return "";
  return [...new Set(lexicalText.split(" ").filter(Boolean))].join(" ");
}
