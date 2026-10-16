/**
 * Lexical prefilter index for entity search (#2659): schema and invalidation.
 *
 * Search matches a query token against an entity's NORMALIZED text
 * (`buildEntityLexicalSearchText`: canonical_name + serialized snapshot +
 * raw_fragments, lowercased, punctuation and non-ASCII letters deleted). That
 * text cannot be matched in SQL against the stored columns, so search used to
 * hydrate and normalize every candidate in JavaScript. This index stores the
 * normalized words once per entity in an FTS5 trigram table, so search can ask
 * SQL for the few entities that can contain every token and hydrate only those.
 * The JavaScript match stays the exact, final check; the index only has to be a
 * SUPERSET of the true matches, never an exact copy.
 *
 * Tables
 * ------
 *  - `entity_search_fts`   FTS5, trigram tokenizer, contentless (the words are
 *                          indexed, not stored a second time). rowid = doc_id.
 *  - `entity_search_docs`  doc_id <-> entity_id. An explicit INTEGER PRIMARY
 *                          KEY, so VACUUM cannot renumber it out from under
 *                          the FTS rowids.
 *  - `entity_search_dirty` entity ids whose indexed text may be stale.
 *  - `entity_search_state` key/value: format version, backfill cursor,
 *                          backfill_complete, fts availability.
 *
 * Invalidation is done by TRIGGERS, not by the application write paths. The
 * text depends on three tables written from many places (the snapshot reducer,
 * interpretation, conditional store, merge, GDPR and sandbox purges, the CLI's
 * raw-SQL restore and merge commands). A trigger on each of them records the
 * entity id in `entity_search_dirty`; nothing that writes those tables can skip
 * it, including an operator's sqlite3 shell. The triggers use only plain SQL
 * (no application-registered functions), so a connection that has never loaded
 * Neotoma can still write. They cannot fail a write: the dirty table has no
 * uniqueness constraint (dedupe is a NOT EXISTS probe), so no outer
 * `INSERT OR ...` conflict clause can turn a trigger insert into an abort.
 *
 * Search treats every dirty entity as a candidate, so a stale index row can
 * cost a few extra hydrations but can never hide a match. The maintainer
 * (`src/services/entity_search_index.ts`) re-indexes dirty entities and runs the
 * backfill; both read and write inside one write transaction, which the
 * single-writer database makes atomic with respect to every other write.
 *
 * Bump {@link ENTITY_SEARCH_INDEX_VERSION} whenever the indexed text changes
 * meaning (normalization, snapshot serialization, fragment pieces, the body
 * format). The next open discards the index and the maintainer rebuilds it;
 * until the rebuild completes, search runs the full scan exactly as before.
 */
import type { DbConnection } from "../db/driver.js";

export const ENTITY_SEARCH_INDEX_VERSION = "1";

export const ENTITY_SEARCH_STATE_TABLE = "entity_search_state";
export const ENTITY_SEARCH_DOCS_TABLE = "entity_search_docs";
export const ENTITY_SEARCH_DIRTY_TABLE = "entity_search_dirty";
export const ENTITY_SEARCH_FTS_TABLE = "entity_search_fts";

/** Insert `expr` into the dirty set unless it is NULL or already there. */
function markDirty(expr: string): string {
  return (
    `INSERT INTO entity_search_dirty (entity_id) SELECT ${expr} ` +
    `WHERE ${expr} IS NOT NULL AND NOT EXISTS ` +
    `(SELECT 1 FROM entity_search_dirty WHERE entity_id = ${expr});`
  );
}

/**
 * [name, event, body]. Updates fire only for the columns that feed the search
 * text (plus the id/link columns, so a re-pointed row dirties both ends).
 */
const DIRTY_TRIGGERS: Array<[string, string, string[]]> = [
  ["trg_entity_search_entities_ins", "AFTER INSERT ON entities", ["NEW.id"]],
  [
    "trg_entity_search_entities_upd",
    "AFTER UPDATE OF id, canonical_name ON entities",
    ["OLD.id", "NEW.id"],
  ],
  ["trg_entity_search_entities_del", "AFTER DELETE ON entities", ["OLD.id"]],
  ["trg_entity_search_snapshots_ins", "AFTER INSERT ON entity_snapshots", ["NEW.entity_id"]],
  [
    "trg_entity_search_snapshots_upd",
    "AFTER UPDATE OF entity_id, snapshot ON entity_snapshots",
    ["OLD.entity_id", "NEW.entity_id"],
  ],
  ["trg_entity_search_snapshots_del", "AFTER DELETE ON entity_snapshots", ["OLD.entity_id"]],
  ["trg_entity_search_fragments_ins", "AFTER INSERT ON raw_fragments", ["NEW.entity_id"]],
  [
    "trg_entity_search_fragments_upd",
    "AFTER UPDATE OF entity_id, fragment_key, fragment_value ON raw_fragments",
    ["OLD.entity_id", "NEW.entity_id"],
  ],
  ["trg_entity_search_fragments_del", "AFTER DELETE ON raw_fragments", ["OLD.entity_id"]],
];

export const ENTITY_SEARCH_TRIGGER_NAMES = DIRTY_TRIGGERS.map(([name]) => name);

async function setState(db: DbConnection, key: string, value: string): Promise<void> {
  await db
    .prepare(
      "INSERT INTO entity_search_state (key, value) VALUES (?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(key, value);
}

async function getState(db: DbConnection, key: string): Promise<string | undefined> {
  const row = (await db.prepare("SELECT value FROM entity_search_state WHERE key = ?").get(key)) as
    | { value: string }
    | undefined;
  return row?.value;
}

/**
 * Empty the index and mark the backfill as not started, so search stops using
 * it until the maintainer has rebuilt it. Leaves the dirty set alone: callers
 * that discard the index also clear the dirty set themselves when appropriate.
 */
export async function resetEntitySearchIndex(
  db: DbConnection,
  options: { ftsAvailable: boolean }
): Promise<void> {
  if (options.ftsAvailable) {
    // 'delete-all' is the FTS5 command for emptying a contentless table.
    await db
      .prepare("INSERT INTO entity_search_fts (entity_search_fts) VALUES ('delete-all')")
      .run();
  }
  await db.prepare("DELETE FROM entity_search_docs").run();
  await setState(db, "backfill_cursor", "");
  // A database with no entities has nothing to backfill: the index is complete
  // and current from its first write, which the triggers mark dirty.
  const anyEntity = await db.prepare("SELECT 1 AS present FROM entities LIMIT 1").get();
  await setState(db, "backfill_complete", anyEntity ? "0" : "1");
}

/**
 * Idempotent; runs inside ensureSchema's transaction on every open. Cheap on an
 * existing database: CREATE ... IF NOT EXISTS plus two state reads. The only
 * heavy step is a format-version change, which empties the index (the rebuild
 * itself runs online in the maintainer, never here).
 */
export async function ensureEntitySearchIndexSchema(db: DbConnection): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS entity_search_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS entity_search_docs (
        doc_id INTEGER PRIMARY KEY,
        entity_id TEXT NOT NULL UNIQUE
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS entity_search_dirty (
        seq INTEGER PRIMARY KEY,
        entity_id TEXT NOT NULL
      )`
    )
    .run();
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_entity_search_dirty_entity ON entity_search_dirty(entity_id)"
    )
    .run();

  let ftsAvailable = true;
  try {
    await db
      .prepare(
        "CREATE VIRTUAL TABLE IF NOT EXISTS entity_search_fts USING fts5(" +
          "body, content='', contentless_delete=1, tokenize='trigram')"
      )
      .run();
  } catch {
    // A SQLite build without FTS5, the trigram tokenizer (< 3.34) or
    // contentless_delete (< 3.43). Search keeps its full scan; nothing breaks.
    ftsAvailable = false;
  }

  for (const [name, event, exprs] of DIRTY_TRIGGERS) {
    await db
      .prepare(
        `CREATE TRIGGER IF NOT EXISTS ${name} ${event} BEGIN ${exprs.map(markDirty).join(" ")} END`
      )
      .run();
  }

  const ftsState = ftsAvailable ? "available" : "unavailable";
  const previousFts = await getState(db, "fts");
  const version = await getState(db, "version");
  if (version !== ENTITY_SEARCH_INDEX_VERSION || previousFts !== ftsState) {
    await resetEntitySearchIndex(db, { ftsAvailable });
    await db.prepare("DELETE FROM entity_search_dirty").run();
    await setState(db, "version", ENTITY_SEARCH_INDEX_VERSION);
    await setState(db, "fts", ftsState);
  }
}
