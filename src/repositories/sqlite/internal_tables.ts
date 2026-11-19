/**
 * Tables that hold per-database bookkeeping rather than user data.
 *
 * Kept dependency-free so the CLI can import it without loading the database
 * layer.
 */

/**
 * Single-row change counter for `schema_registry`, bumped by triggers on every
 * insert, update and delete (sqlite_client.ts ensureSchema). The in-memory
 * schema lookup cache compares it to notice writes from other processes
 * (src/repositories/db/schema_registry_cache.ts).
 */
export const SCHEMA_REGISTRY_CHANGE_COUNTER_TABLE = "schema_registry_change_counter";

/**
 * Tables `neotoma storage merge-db` never copies from the source file.
 *
 * Each is derived from the target's own data, and the target maintains it
 * itself as merged rows land. Copying one would conflict on every merge (two
 * databases always disagree about their own bookkeeping) or, with
 * `--mode keep-source`, overwrite the target's value with one that means
 * nothing there. For the change counter that could move it backwards to a
 * value a running server has already seen, hiding the merged schema rows from
 * that server's cache.
 */
export const MERGE_DB_SKIPPED_INTERNAL_TABLES: ReadonlySet<string> = new Set([
  SCHEMA_REGISTRY_CHANGE_COUNTER_TABLE,
]);
