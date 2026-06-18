/**
 * Shared schema-meta key constants.
 *
 * Keys that appear in a stored observation's `fields` map but are NOT
 * user-facing schema fields. When scanning an observation's payload to flag
 * undeclared (unknown) fields, these keys MUST be skipped so they never inflate
 * `unknown_fields` / `unknown_fields_count`.
 *
 * Single source of truth for both the MCP store path (`src/server.ts`) and the
 * HTTP store path (`src/actions.ts`) — they previously declared identical
 * inline copies, which drift independently. Issue #1552 cluster.
 */
export const NON_SCHEMA_META_KEYS: ReadonlySet<string> = new Set([
  "canonical_name",
  "schema_version",
  "_deleted",
]);
