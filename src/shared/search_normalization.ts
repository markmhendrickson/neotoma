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
