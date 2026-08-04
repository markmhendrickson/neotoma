/**
 * SQLite FTS5 index over entity text (issue #1601).
 *
 * Background: lexical entity search had no SQL text predicate. It pulled up to
 * MAX_LEXICAL_CANDIDATES rows ordered by `id` — the random hex entity id — and
 * filtered them in JS, so on a large graph the cap acted as an arbitrary
 * hash-ordered sample. #1600 added a `canonical_name` LIKE prefilter, which
 * fixed name matches but left body/snapshot-only matches bounded by that same
 * capped scan. This module closes the body gap with a real index.
 *
 * Design notes:
 *
 * - **Triggers, not a write hook.** `upsertEntitySnapshotWithEmbedding` calls
 *   itself the single entry point for entity_snapshots upserts, but
 *   `interpretation.ts` writes the table directly (it builds the payload via
 *   `getEntitySnapshotUpsertPayload` then upserts through `db`). A JS-level
 *   hook would silently miss that path — which is exactly how the embedding
 *   index can go stale. SQLite triggers fire below every writer, so the index
 *   cannot drift no matter which code path writes.
 *
 * - **Separate `name`/`body` columns.** bm25 rewards short documents, so a
 *   single blended column ranks long pages far below chat bookkeeping that
 *   happens to repeat the query terms. Separate columns let callers weight
 *   canonical_name above snapshot text, mirroring the JS scorer's existing
 *   +300 name / +180 body bias.
 *
 * - **Encryption.** Policy is that the index MAY hold plaintext body text: an
 *   FTS index is the same shape of exposure as the vector index, and
 *   docs/operations/encryption.md already documents that "embeddings are stored
 *   unencrypted for vector search", delegating full at-rest coverage to volume
 *   encryption (FileVault/LUKS). `canonical_name` is plaintext in every mode by
 *   design — the deterministic engine and integrity chain depend on it — so the
 *   `name` column is never encryption-sensitive.
 *
 *   That policy is NOT yet realized for bodies under encryption, because of a
 *   layering fact: column encryption happens in the JS adapter above SQLite, so
 *   a trigger observes `new.snapshot` already as ciphertext. Indexing it would
 *   produce unsearchable blobs (verified: body-word MATCH returns 0 rows while
 *   name still matches). Rather than fill the index with garbage, triggers omit
 *   the body when encryption is on, and those deployments get name-only search
 *   until a JS-side plaintext writer lands (#1602). See
 *   {@link isEntityFtsBodyIndexed}.
 */

import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import type { SqliteDatabase } from "../repositories/sqlite/sqlite_driver.js";

let ftsReady = false;

/**
 * True when the FTS index can be maintained at all. Local SQLite only — the
 * index lives in the SQLite file.
 */
export function isEntityFtsEnabled(): boolean {
  return config.storageBackend === "local";
}

/**
 * True when triggers can index snapshot body text.
 *
 * Column encryption happens in the JS adapter ABOVE SQLite
 * (local_db_adapter.ts encrypts on write), so by the time a trigger sees
 * `new.snapshot` the value is already ciphertext. Indexing it would fill the
 * index with unsearchable blobs — verified: a body-word MATCH returns 0 rows
 * while the plaintext name column still matches.
 *
 * Body search under encryption therefore needs a JS-side writer that indexes
 * plaintext before the adapter encrypts it (tracked in #1602). Until that
 * exists, encrypted deployments get name-only search rather than a body index
 * full of ciphertext. `name` is unaffected in every mode: canonical_name is
 * plaintext by design.
 */
export function isEntityFtsBodyIndexed(): boolean {
  return isEntityFtsEnabled() && !config.encryption.enabled;
}

/**
 * Create the FTS table and the triggers that keep it in sync. Idempotent and
 * cheap after the first call. Safe to call on every query path.
 *
 * The table is `contentless_delete=0`-style external content on
 * entity_snapshots would couple the index to that table's rowids; a plain
 * (non-external-content) table keyed by entity_id is simpler to reason about
 * and lets us index canonical_name from the snapshot row directly.
 */
export function ensureEntityFtsSchema(db: SqliteDatabase): boolean {
  if (!isEntityFtsEnabled()) return false;
  if (ftsReady) return true;

  // Trigger bodies are frozen at CREATE time, so the encryption mode is baked
  // into them. Drop first: a database whose triggers were created in the other
  // mode would otherwise keep indexing ciphertext (or keep omitting bodies)
  // forever, since CREATE TRIGGER IF NOT EXISTS is a no-op once one exists.
  const bodyExpr = isEntityFtsBodyIndexed() ? "COALESCE(new.snapshot,'')" : "''";

  try {
    db.exec(`
      DROP TRIGGER IF EXISTS entity_fts_snapshot_ai;
      DROP TRIGGER IF EXISTS entity_fts_snapshot_au;
      DROP TRIGGER IF EXISTS entity_fts_snapshot_ad;
      DROP TRIGGER IF EXISTS entity_fts_entities_au;
      DROP TRIGGER IF EXISTS entity_fts_entities_ad;
    `);
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS entity_search_fts USING fts5(
        entity_id UNINDEXED,
        name,
        body,
        tokenize = 'unicode61'
      );

      -- Membership side table. entity_id is UNINDEXED inside FTS5 (it is
      -- payload, not a searchable column), so "is this entity already
      -- indexed?" cannot use an index and degrades to a full scan of the FTS
      -- table per row — an O(n^2) backfill that hangs for minutes on a 140k
      -- graph. A plain PRIMARY KEY table makes that lookup O(log n). Mirrors
      -- how entity_embedding_rows backs the vec0 index.
      CREATE TABLE IF NOT EXISTS entity_fts_rows (
        entity_id TEXT PRIMARY KEY
      );

      -- entity_snapshots carries canonical_name alongside snapshot, so both
      -- FTS columns can be maintained from this one table. Writers upsert
      -- (INSERT OR REPLACE / UPDATE), so all three trigger kinds are needed.
      CREATE TRIGGER IF NOT EXISTS entity_fts_snapshot_ai
      AFTER INSERT ON entity_snapshots BEGIN
        DELETE FROM entity_search_fts WHERE entity_id = new.entity_id;
        INSERT INTO entity_search_fts(entity_id, name, body)
        VALUES (new.entity_id, COALESCE(new.canonical_name,''), ${bodyExpr});
        INSERT OR IGNORE INTO entity_fts_rows(entity_id) VALUES (new.entity_id);
      END;

      CREATE TRIGGER IF NOT EXISTS entity_fts_snapshot_au
      AFTER UPDATE ON entity_snapshots BEGIN
        DELETE FROM entity_search_fts WHERE entity_id = new.entity_id;
        INSERT INTO entity_search_fts(entity_id, name, body)
        VALUES (new.entity_id, COALESCE(new.canonical_name,''), ${bodyExpr});
        INSERT OR IGNORE INTO entity_fts_rows(entity_id) VALUES (new.entity_id);
      END;

      CREATE TRIGGER IF NOT EXISTS entity_fts_snapshot_ad
      AFTER DELETE ON entity_snapshots BEGIN
        DELETE FROM entity_search_fts WHERE entity_id = old.entity_id;
        DELETE FROM entity_fts_rows WHERE entity_id = old.entity_id;
      END;

      -- canonical_name can be renamed on the entities table without touching
      -- the snapshot row; keep the indexed name honest in that case.
      CREATE TRIGGER IF NOT EXISTS entity_fts_entities_au
      AFTER UPDATE OF canonical_name ON entities BEGIN
        UPDATE entity_search_fts SET name = COALESCE(new.canonical_name,'')
        WHERE entity_id = new.id;
      END;

      CREATE TRIGGER IF NOT EXISTS entity_fts_entities_ad
      AFTER DELETE ON entities BEGIN
        DELETE FROM entity_search_fts WHERE entity_id = old.id;
        DELETE FROM entity_fts_rows WHERE entity_id = old.id;
      END;
    `);
    ftsReady = true;
    return true;
  } catch (error) {
    // Fail open: an FTS5 build without the extension must not break search.
    logger.warn(
      `[entity_fts] FTS unavailable, falling back to scan: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

/** Rows present in entity_snapshots but absent from the index. */
export function entityFtsBacklogCount(db: SqliteDatabase): number {
  if (!ensureEntityFtsSchema(db)) return 0;
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM entity_snapshots s
       WHERE NOT EXISTS (SELECT 1 FROM entity_fts_rows r WHERE r.entity_id = s.entity_id)`
    )
    .get() as { c: number };
  return row.c;
}

/**
 * Backfill entities written before the index existed. Triggers only cover
 * writes from their creation onward, so an existing graph needs one pass.
 * Idempotent — indexes only the rows the index is missing.
 */
export function backfillEntityFts(db: SqliteDatabase): number {
  if (!ensureEntityFtsSchema(db)) return 0;
  // Index rows and record membership atomically: a crash between the two would
  // otherwise leave rows indexed but unmarked (double-indexed on the next
  // pass) or marked but unindexed (invisible forever).
  // Same ciphertext constraint as the triggers: this reads snapshot straight
  // from SQLite, bypassing the adapter's decryption, so under encryption the
  // body would be an unsearchable blob. Index name-only in that mode.
  const bodySelect = isEntityFtsBodyIndexed() ? "COALESCE(s.snapshot,'')" : "''";
  const run = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO entity_search_fts(entity_id, name, body)
         SELECT s.entity_id,
                COALESCE(NULLIF(s.canonical_name,''), (SELECT e.canonical_name FROM entities e WHERE e.id = s.entity_id), ''),
                ${bodySelect}
         FROM entity_snapshots s
         WHERE NOT EXISTS (SELECT 1 FROM entity_fts_rows r WHERE r.entity_id = s.entity_id)`
      )
      .run();
    db.prepare(
      `INSERT OR IGNORE INTO entity_fts_rows(entity_id) SELECT entity_id FROM entity_snapshots`
    ).run();
    return Number(result.changes ?? 0);
  });
  return run();
}

/**
 * Escape a user query token for an FTS5 MATCH expression. FTS5 treats bare
 * `-`, `*`, `"`, `(`, `)`, `:`, `^` and the bareword operators AND/OR/NOT as
 * syntax; an unescaped query would raise a syntax error rather than return
 * results. Wrapping each token in double quotes makes it a literal string
 * ("" is the in-string escape for a quote).
 */
export function toFtsMatchExpression(tokens: string[]): string | null {
  const quoted = tokens
    .map((t) => t.replace(/"/g, '""').trim())
    .filter(Boolean)
    .map((t) => `"${t}"`);
  return quoted.length > 0 ? quoted.join(" AND ") : null;
}

/**
 * Entity ids matching every token, ranked by bm25 with canonical_name weighted
 * above snapshot body.
 *
 * Weights (0.0 / 5.0 / 1.0) map to (entity_id, name, body) — entity_id is
 * UNINDEXED and contributes nothing. Name-over-body mirrors the JS scorer's
 * existing bias and keeps long pages from being buried under short chat rows
 * that merely repeat the terms.
 *
 * Returns null when FTS is unavailable, so callers can distinguish "no index"
 * from "index says zero matches" and fall back rather than show an empty page.
 */
export function ftsSearchEntityIds(params: {
  tokens: string[];
  limit: number;
  db: SqliteDatabase;
}): string[] | null {
  const db = params.db;
  if (!ensureEntityFtsSchema(db)) return null;

  const matchExpr = toFtsMatchExpression(params.tokens);
  if (!matchExpr) return null;

  try {
    const rows = db
      .prepare(
        `SELECT entity_id FROM entity_search_fts
         WHERE entity_search_fts MATCH ?
         ORDER BY bm25(entity_search_fts, 0.0, 5.0, 1.0)
         LIMIT ?`
      )
      .all(matchExpr, params.limit) as Array<{ entity_id: string }>;
    return rows.map((r) => r.entity_id);
  } catch (error) {
    logger.warn(
      `[entity_fts] MATCH failed, falling back to scan: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

/** Test seam: forget the cached readiness flag. */
export function resetEntityFtsCacheForTests(): void {
  ftsReady = false;
}
