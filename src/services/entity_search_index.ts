/**
 * Lexical prefilter index for entity search (#2659): maintenance and lookup.
 *
 * Schema, triggers and the invariants are described in
 * src/repositories/sqlite/entity_search_index_schema.ts. In short: an FTS5
 * trigram table holds each entity's distinct normalized words; triggers record
 * every entity whose text may have changed in `entity_search_dirty`; search
 * asks the index for the entities that can contain every query token, adds
 * every dirty entity, and runs the unchanged JavaScript match over only those.
 *
 * Correctness argument (the index is a superset filter, never a source of
 * truth):
 *  - A query token is `[a-z0-9]+` (normalizeSearchText output split on spaces),
 *    so it occurs in an entity's lexical text exactly when it occurs inside one
 *    of the text's words. The indexed body is those words, so for a token of
 *    three or more characters the trigram MATCH is true exactly when the JS
 *    `includes` is true for that word set. Shorter tokens cannot be looked up
 *    in a trigram index and are simply not used to narrow anything.
 *  - An entity whose stored row is stale is in the dirty set (a trigger put it
 *    there in the same transaction as the write), and dirty entities are always
 *    candidates. The FTS lookup and the dirty read happen in ONE statement, so
 *    a maintainer commit between them cannot make an entity fall through both.
 *  - The maintainer reads an entity's inputs and writes its index row inside
 *    one write transaction, so no other write can interleave and leave a fresh
 *    -looking row with stale text.
 *  - Until the backfill has covered every entity, the index is not used at
 *    all: search runs the full scan it always ran.
 *
 * Encryption at rest: when `NEOTOMA_ENCRYPTION_ENABLED=true`, the index is
 * never written and never read. The maintainer empties it (and the backfill is
 * reset) so text indexed in an earlier plaintext period does not linger, and
 * search uses the full scan. Keyed hashes were considered and rejected: a
 * substring match needs trigram-level entries, and keyed hashes of trigrams
 * over a 36-letter alphabet (46,656 values) are open to frequency analysis,
 * which would weaken encryption at rest more than the operator approved.
 */
import { config } from "../config.js";
import { getDb } from "../repositories/db/connection.js";
import type { DbConnection } from "../repositories/db/driver.js";
import { resetEntitySearchIndex } from "../repositories/sqlite/entity_search_index_schema.js";
import { fromDbRow } from "../repositories/sqlite/local_db_adapter.js";
import {
  buildEntityLexicalSearchText,
  entitySearchIndexBody,
  rawFragmentSearchPiece,
} from "../shared/search_normalization.js";
import { logger } from "../utils/logger.js";

/** Trigram index: a token shorter than this cannot be looked up. */
export const MIN_INDEXED_TOKEN_LENGTH = 3;

/** Entities re-indexed per write transaction. Each batch holds the write lock. */
const DEFAULT_BATCH_SIZE = 200;
/** Background maintainer: wall-clock budget per tick, and tick interval. */
const MAINTAINER_TICK_BUDGET_MS = 250;
const MAINTAINER_INTERVAL_MS = 1000;

export type EntitySearchIndexInactiveReason =
  | "encryption_at_rest"
  | "disabled_by_env"
  | "fts_unavailable";

/** `NEOTOMA_ENTITY_SEARCH_INDEX=off` turns the prefilter and its maintenance off. */
export function entitySearchIndexDisabledByEnv(): boolean {
  const value = (process.env.NEOTOMA_ENTITY_SEARCH_INDEX ?? "").trim().toLowerCase();
  return value === "off" || value === "0" || value === "false";
}

function configInactiveReason(): EntitySearchIndexInactiveReason | null {
  if (config.encryption.enabled) return "encryption_at_rest";
  if (entitySearchIndexDisabledByEnv()) return "disabled_by_env";
  return null;
}

interface IndexState {
  ftsAvailable: boolean;
  backfillComplete: boolean;
  backfillCursor: string;
}

async function readIndexState(conn: DbConnection): Promise<IndexState | null> {
  let rows: Array<{ key: string; value: string }>;
  try {
    rows = (await conn.prepare("SELECT key, value FROM entity_search_state").all()) as Array<{
      key: string;
      value: string;
    }>;
  } catch {
    return null;
  }
  const state = new Map(rows.map((row) => [row.key, row.value]));
  if (!state.has("version")) return null;
  return {
    ftsAvailable: state.get("fts") === "available",
    backfillComplete: state.get("backfill_complete") === "1",
    backfillCursor: state.get("backfill_cursor") ?? "",
  };
}

async function setState(conn: DbConnection, key: string, value: string): Promise<void> {
  await conn
    .prepare(
      "INSERT INTO entity_search_state (key, value) VALUES (?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(key, value);
}

/** True when search may use the index right now. */
export async function entitySearchPrefilterAvailable(conn: DbConnection): Promise<boolean> {
  if (configInactiveReason()) return false;
  const state = await readIndexState(conn);
  return Boolean(state?.ftsAvailable && state.backfillComplete);
}

// ---------------------------------------------------------------------------
// Indexing
// ---------------------------------------------------------------------------

type DocRow = { doc_id: number; entity_id: string };

/**
 * Re-index `entityIds` from the current rows. Must run inside a write
 * transaction (see the correctness argument above). Entities that no longer
 * exist lose their index row.
 */
async function indexEntities(
  tx: DbConnection,
  entityIds: string[]
): Promise<{ indexed: number; removed: number }> {
  if (entityIds.length === 0) return { indexed: 0, removed: 0 };
  const ids = JSON.stringify(entityIds);
  const entityRows = (await tx
    .prepare("SELECT id, canonical_name FROM entities WHERE id IN (SELECT value FROM json_each(?))")
    .all(ids)) as Array<{ id: string; canonical_name: string }>;
  const snapshotRows = (await tx
    .prepare(
      "SELECT entity_id, snapshot FROM entity_snapshots " +
        "WHERE entity_id IN (SELECT value FROM json_each(?))"
    )
    .all(ids)) as Array<Record<string, unknown>>;
  const fragmentRows = (await tx
    .prepare(
      "SELECT entity_id, fragment_key, fragment_value FROM raw_fragments " +
        "WHERE entity_id IN (SELECT value FROM json_each(?))"
    )
    .all(ids)) as Array<Record<string, unknown>>;

  // Same decoding (JSON parse, decryption) and the same text assembly as the
  // search path, so the indexed words are exactly the words search matches.
  const snapshotByEntity = new Map<string, unknown>();
  for (const row of snapshotRows) {
    const decoded = fromDbRow("entity_snapshots", row);
    snapshotByEntity.set(decoded.entity_id as string, decoded.snapshot);
  }
  const fragmentTextByEntity = new Map<string, string>();
  for (const row of fragmentRows) {
    const decoded = fromDbRow("raw_fragments", row);
    const entityId = decoded.entity_id as string | null;
    if (!entityId) continue;
    const piece = rawFragmentSearchPiece(decoded.fragment_key, decoded.fragment_value);
    if (!piece) continue;
    const existing = fragmentTextByEntity.get(entityId);
    fragmentTextByEntity.set(entityId, existing ? `${existing} ${piece}` : piece);
  }

  const live = new Set(entityRows.map((row) => row.id));
  const gone = entityIds.filter((id) => !live.has(id));
  if (live.size > 0) {
    await tx
      .prepare(
        "INSERT OR IGNORE INTO entity_search_docs (entity_id) SELECT value FROM json_each(?)"
      )
      .run(JSON.stringify([...live]));
  }
  const docRows = (await tx
    .prepare(
      "SELECT doc_id, entity_id FROM entity_search_docs " +
        "WHERE entity_id IN (SELECT value FROM json_each(?))"
    )
    .all(ids)) as DocRow[];
  const docIdByEntity = new Map(docRows.map((row) => [row.entity_id, Number(row.doc_id)]));

  const deleteFts = tx.prepare("DELETE FROM entity_search_fts WHERE rowid = ?");
  const insertFts = tx.prepare("INSERT INTO entity_search_fts (rowid, body) VALUES (?, ?)");
  for (const row of entityRows) {
    const docId = docIdByEntity.get(row.id);
    if (docId === undefined) continue;
    const body = entitySearchIndexBody(
      buildEntityLexicalSearchText(
        row.canonical_name,
        snapshotByEntity.get(row.id),
        fragmentTextByEntity.get(row.id)
      )
    );
    await deleteFts.run(docId);
    await insertFts.run(docId, body);
  }
  let removed = 0;
  for (const entityId of gone) {
    const docId = docIdByEntity.get(entityId);
    if (docId === undefined) continue;
    await deleteFts.run(docId);
    await tx.prepare("DELETE FROM entity_search_docs WHERE doc_id = ?").run(docId);
    removed += 1;
  }
  await tx
    .prepare("DELETE FROM entity_search_dirty WHERE entity_id IN (SELECT value FROM json_each(?))")
    .run(ids);
  return { indexed: entityRows.length, removed };
}

export interface EntitySearchMaintenanceResult {
  /** Dirty entities re-indexed (or dropped, when they no longer exist). */
  reindexed: number;
  /** Entities indexed by the backfill. */
  backfilled: number;
  /** Index rows removed for entities that no longer exist. */
  removed: number;
  backfillComplete: boolean;
  /** Why the index is not maintained, when it is not. */
  inactive: EntitySearchIndexInactiveReason | null;
  /** The index was emptied this run (encryption on, disabled, or no FTS5). */
  purged: boolean;
  batches: number;
}

/**
 * Bring the index up to date: re-index dirty entities first (so recent writes
 * become searchable through the index quickly), then continue the backfill.
 * Each batch is one short write transaction; between batches the event loop is
 * yielded so request traffic interleaves. Stops when there is nothing left, or
 * when `timeBudgetMs` / `maxBatches` is reached.
 */
export async function runEntitySearchIndexMaintenance(
  options: { batchSize?: number; timeBudgetMs?: number; maxBatches?: number } = {}
): Promise<EntitySearchMaintenanceResult> {
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
  const deadline =
    options.timeBudgetMs === undefined ? Infinity : Date.now() + options.timeBudgetMs;
  const maxBatches = options.maxBatches ?? Infinity;
  const conn = await getDb();
  const result: EntitySearchMaintenanceResult = {
    reindexed: 0,
    backfilled: 0,
    removed: 0,
    backfillComplete: false,
    inactive: null,
    purged: false,
    batches: 0,
  };

  const initial = await readIndexState(conn);
  if (!initial) return result; // schema not present (should not happen after ensureSchema)
  const inactive = configInactiveReason() ?? (initial.ftsAvailable ? null : "fts_unavailable");
  if (inactive) {
    // Never index while inactive. Empty whatever an earlier active period left
    // behind and restart the backfill from scratch, so that the index can never
    // be used later with rows that missed the writes made in the meantime.
    result.inactive = inactive;
    await conn.transaction(async (tx) => {
      const state = await readIndexState(tx);
      if (!state) return;
      const anyDoc = await tx.prepare("SELECT 1 AS present FROM entity_search_docs LIMIT 1").get();
      if (anyDoc || state.backfillComplete || state.backfillCursor !== "") {
        await resetEntitySearchIndex(tx, { ftsAvailable: state.ftsAvailable });
        await setState(tx, "backfill_complete", "0");
        result.purged = true;
      }
      await tx.prepare("DELETE FROM entity_search_dirty").run();
    });
    return result;
  }

  while (result.batches < maxBatches && Date.now() < deadline) {
    const step = await conn.transaction(async (tx) => {
      const state = await readIndexState(tx);
      if (!state?.ftsAvailable) return "idle" as const;
      const dirtyRows = (await tx
        .prepare("SELECT entity_id FROM entity_search_dirty ORDER BY seq LIMIT ?")
        .all(batchSize)) as Array<{ entity_id: string }>;
      if (dirtyRows.length > 0) {
        const ids = [...new Set(dirtyRows.map((row) => row.entity_id))];
        const { removed } = await indexEntities(tx, ids);
        result.reindexed += ids.length;
        result.removed += removed;
        return "dirty" as const;
      }
      if (state.backfillComplete) return "idle" as const;
      const rows = (await tx
        .prepare("SELECT id FROM entities WHERE id > ? ORDER BY id LIMIT ?")
        .all(state.backfillCursor, batchSize)) as Array<{ id: string }>;
      if (rows.length === 0) {
        await setState(tx, "backfill_complete", "1");
        return "backfill_done" as const;
      }
      const ids = rows.map((row) => row.id);
      await indexEntities(tx, ids);
      await setState(tx, "backfill_cursor", ids[ids.length - 1]!);
      result.backfilled += ids.length;
      return "backfill" as const;
    });
    result.batches += 1;
    if (step === "idle" || step === "backfill_done") break;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  const final = await readIndexState(conn);
  result.backfillComplete = Boolean(final?.backfillComplete);
  return result;
}

let maintainerTimer: ReturnType<typeof setInterval> | null = null;
let maintainerRunning = false;

/**
 * Start the background maintainer (idempotent; one per process). Each tick
 * spends at most MAINTAINER_TICK_BUDGET_MS on index work, so on a large
 * database the backfill proceeds at roughly a quarter of one core and never
 * holds the write lock for longer than one batch.
 */
export function startEntitySearchIndexMaintainer(): () => void {
  if (maintainerTimer) return stopEntitySearchIndexMaintainer;
  const tick = async () => {
    if (maintainerRunning) return;
    maintainerRunning = true;
    try {
      const result = await runEntitySearchIndexMaintenance({
        timeBudgetMs: MAINTAINER_TICK_BUDGET_MS,
      });
      if (result.backfilled > 0 || result.purged) {
        logger.info(
          `[entitySearchIndex] backfilled=${result.backfilled} reindexed=${result.reindexed} ` +
            `complete=${result.backfillComplete} purged=${result.purged} inactive=${result.inactive ?? "no"}`
        );
      }
    } catch (error) {
      logger.warn(
        `[entitySearchIndex] maintenance failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      maintainerRunning = false;
    }
  };
  maintainerTimer = setInterval(() => void tick(), MAINTAINER_INTERVAL_MS);
  maintainerTimer.unref?.();
  void tick();
  return stopEntitySearchIndexMaintainer;
}

export function stopEntitySearchIndexMaintainer(): void {
  if (maintainerTimer) clearInterval(maintainerTimer);
  maintainerTimer = null;
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/** The entity rows search starts from, as its full-scan candidate query returns them. */
export type LexicalCandidateEntity = { id: string; canonical_name: string; entity_type: string };

/** The same owner / type / merged / cap scope the full-scan candidate query applies. */
export interface LexicalCandidateScope {
  userId: string;
  /** null: untyped. */
  types: string[] | null;
  includeMerged: boolean;
  /** Untyped cap: only entities with id <= this (the cap-th id). */
  maxEntityId?: string | null;
}

function scopeWhere(scope: LexicalCandidateScope): { sql: string; params: unknown[] } {
  const clauses = ["e.user_id = ?"];
  const params: unknown[] = [scope.userId];
  if (scope.types && scope.types.length === 1) {
    clauses.push("e.entity_type = ?");
    params.push(scope.types[0]);
  } else if (scope.types && scope.types.length > 1) {
    clauses.push("e.entity_type IN (SELECT value FROM json_each(?))");
    params.push(JSON.stringify(scope.types));
  }
  if (!scope.includeMerged) clauses.push("e.merged_to_entity_id IS NULL");
  if (scope.maxEntityId != null) {
    clauses.push("e.id <= ?");
    params.push(scope.maxEntityId);
  }
  return { sql: clauses.join(" AND "), params };
}

/** One FTS5 phrase per token; tokens are [a-z0-9]+ but quote defensively. */
function phrase(token: string): string {
  return `"${token.replace(/"/g, '""')}"`;
}

const FTS_DOCS = (match: string) =>
  "SELECT d.entity_id AS entity_id FROM entity_search_docs d WHERE d.doc_id IN " +
  `(SELECT rowid FROM entity_search_fts WHERE entity_search_fts MATCH ${match})`;

async function selectCandidates(
  conn: DbConnection,
  candidateIdsSql: string,
  candidateParams: unknown[],
  scope: LexicalCandidateScope
): Promise<LexicalCandidateEntity[]> {
  const where = scopeWhere(scope);
  // CROSS JOIN pins the join order: walk the (small) candidate id set and
  // probe entities by primary key, never scan entities and probe the set.
  return (await conn
    .prepare(
      "SELECT e.id AS id, e.canonical_name AS canonical_name, e.entity_type AS entity_type " +
        `FROM (${candidateIdsSql}) c CROSS JOIN entities e ON e.id = c.entity_id ` +
        `WHERE ${where.sql} ORDER BY e.id`
    )
    .all(...candidateParams, ...where.params)) as LexicalCandidateEntity[];
}

/**
 * Entities in scope that can contain every token in `tokens` (each at least
 * MIN_INDEXED_TOKEN_LENGTH long), plus every dirty entity in scope.
 */
export async function prefilterStrictCandidates(
  conn: DbConnection,
  scope: LexicalCandidateScope,
  tokens: string[]
): Promise<LexicalCandidateEntity[]> {
  const match = [...new Set(tokens)].map(phrase).join(" AND ");
  return selectCandidates(
    conn,
    `${FTS_DOCS("?")} UNION SELECT entity_id FROM entity_search_dirty`,
    [match],
    scope
  );
}

/**
 * Entities in scope whose summed token weight is at least `minWeight`, where an
 * entity earns a token's weight when it can contain that token; every dirty
 * entity in scope is included. `weights` maps an indexable token to how many
 * times it counts (a query can repeat a token).
 */
export async function prefilterWeightedCandidates(
  conn: DbConnection,
  scope: LexicalCandidateScope,
  weights: Map<string, number>,
  minWeight: number
): Promise<LexicalCandidateEntity[]> {
  const parts: string[] = [];
  const params: unknown[] = [];
  for (const [token, weight] of weights) {
    parts.push(`SELECT x.entity_id AS entity_id, ? AS w FROM (${FTS_DOCS("?")}) x`);
    params.push(weight, phrase(token));
  }
  parts.push("SELECT entity_id, ? AS w FROM entity_search_dirty");
  params.push(minWeight);
  params.push(minWeight);
  return selectCandidates(
    conn,
    `SELECT entity_id FROM (${parts.join(" UNION ALL ")}) ` +
      "GROUP BY entity_id HAVING SUM(w) >= ?",
    params,
    scope
  );
}
