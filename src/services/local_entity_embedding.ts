// Local entity embedding storage and retrieval via sqlite-vec
// Used when storageBackend === "local" and OPENAI_API_KEY is set

import { createRequire } from "node:module";
import type Database from "better-sqlite3";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { getSqliteDb } from "../repositories/sqlite/sqlite_client.js";

const createRequireFromMeta = createRequire(import.meta.url);
const EMBEDDING_DIM = 1536;

let sqliteVecLoaded: boolean | null = null;

/**
 * Load sqlite-vec extension lazily. Caches success/failure.
 * Returns true if loaded, false if failed (e.g. wrong platform).
 */
export function ensureSqliteVecLoaded(db: Database.Database): boolean {
  if (sqliteVecLoaded !== null) {
    return sqliteVecLoaded;
  }
  try {
    const sqliteVec = createRequireFromMeta("sqlite-vec") as { load: (d: Database.Database) => void };
    sqliteVec.load(db);
    sqliteVecLoaded = true;
    return true;
  } catch (err) {
    logger.warn("[local_entity_embedding] sqlite-vec load failed:", err);
    sqliteVecLoaded = false;
    return false;
  }
}

/**
 * Ensure vec0 virtual table exists. Call after ensureSqliteVecLoaded.
 * entity_embedding_rows is created by sqlite_client schema.
 */
function ensureVecSchema(db: Database.Database): void {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS entity_embeddings_vec USING vec0(
      embedding float[${EMBEDDING_DIM}]
    )
  `);
}

/**
 * Store or update entity embedding in local vec0 table.
 * Call when entity_snapshots upsert succeeds and row has embedding.
 */
export function storeLocalEntityEmbedding(
  row: {
    entity_id: string;
    embedding?: number[] | null;
    user_id: string;
    entity_type: string;
    merged?: boolean;
  }
): void {
  if (!row.embedding || row.embedding.length !== EMBEDDING_DIM) {
    return;
  }
  if (config.storageBackend !== "local" || !config.openaiApiKey) {
    return;
  }

  const db = getSqliteDb();
  if (!ensureSqliteVecLoaded(db)) {
    return;
  }
  ensureVecSchema(db);

  const merged = row.merged ? 1 : 0;

  // Upsert: delete existing row for entity_id if any, then insert
  const existing = db
    .prepare("SELECT rowid FROM entity_embedding_rows WHERE entity_id = ?")
    .get(row.entity_id) as { rowid: number } | undefined;

  if (existing) {
    db.prepare("DELETE FROM entity_embeddings_vec WHERE rowid = ?").run(
      existing.rowid
    );
    db.prepare("DELETE FROM entity_embedding_rows WHERE rowid = ?").run(
      existing.rowid
    );
  }

  const embeddingBlob = new Float32Array(row.embedding);
  db.prepare(
    "INSERT INTO entity_embeddings_vec(rowid, embedding) VALUES (?, ?)"
  ).run(null, embeddingBlob);

  const rowid = db.prepare("SELECT last_insert_rowid() as id").get() as {
    id: number;
  };
  db.prepare(
    "INSERT INTO entity_embedding_rows(rowid, entity_id, user_id, entity_type, merged) VALUES (?, ?, ?, ?, ?)"
  ).run(rowid.id, row.entity_id, row.user_id, row.entity_type, merged);
}

/**
 * Semantic search over local entity embeddings.
 * Returns entity IDs ordered by similarity.
 */
export function searchLocalEntityEmbeddings(options: {
  queryEmbedding: number[];
  userId: string;
  entityType?: string | null;
  includeMerged: boolean;
  /**
   * L2 distance threshold. Results with distance >= threshold are dropped.
   * Practical range ~0.9–1.5. Typical values: 1.0 (strict), 1.02 (moderate), 1.05 (loose).
   * Omit to return all k results regardless of distance.
   */
  distanceThreshold?: number;
  limit: number;
  offset: number;
}): string[] {
  const {
    queryEmbedding,
    userId,
    entityType,
    includeMerged,
    distanceThreshold,
    limit,
    offset,
  } = options;

  if (
    config.storageBackend !== "local" ||
    !config.openaiApiKey ||
    queryEmbedding.length !== EMBEDDING_DIM
  ) {
    logger.warn(
      `[searchLocalEntityEmbeddings] early exit: storageBackend=${config.storageBackend} openaiApiKey=${!!config.openaiApiKey} embLen=${queryEmbedding?.length ?? 0}`
    );
    return [];
  }

  const db = getSqliteDb();
  if (!ensureSqliteVecLoaded(db)) {
    logger.warn("[searchLocalEntityEmbeddings] sqlite-vec not loaded");
    return [];
  }
  ensureVecSchema(db);

  // Debug: row counts for userId
  const totalRows = (db.prepare("SELECT COUNT(*) as c FROM entity_embedding_rows").get() as { c: number }).c;
  const userRows = (db.prepare("SELECT COUNT(*) as c FROM entity_embedding_rows WHERE user_id = ?").get(userId) as { c: number }).c;
  const distinctUsers = (db.prepare("SELECT DISTINCT user_id FROM entity_embedding_rows").all() as { user_id: string }[]).map((r) => r.user_id);
  if (userRows === 0) {
    logger.warn(
      `[searchLocalEntityEmbeddings] userId=${userId} has 0 rows; total=${totalRows} distinctUsers=${distinctUsers.slice(0, 5).join(",")}${distinctUsers.length > 5 ? "..." : ""}`
    );
  }

  // Oversample for filtering: fetch more candidates then filter and slice
  const oversample = Math.max((limit + offset) * 5, 500);
  const float32 = new Float32Array(queryEmbedding);
  const embeddingBlob = Buffer.from(float32.buffer, float32.byteOffset, float32.byteLength);

  const rows = db
    .prepare(
      `
    SELECT r.entity_id, v.distance
    FROM entity_embeddings_vec v
    INNER JOIN entity_embedding_rows r ON r.rowid = v.rowid
    WHERE v.embedding MATCH ? AND k = ?
      AND r.user_id = ?
      AND (? IS NULL OR r.entity_type = ?)
      AND (? = 1 OR r.merged = 0)
    ORDER BY v.distance
  `
    )
    .all(
      embeddingBlob,
      oversample,
      userId,
      entityType ?? null,
      entityType ?? null,
      includeMerged ? 1 : 0  /* includeMerged=1: all rows; =0: only non-merged (r.merged=0) */
    ) as Array<{ entity_id: string; distance: number }>;

  const filtered =
    distanceThreshold !== undefined
      ? rows.filter((r) => r.distance < distanceThreshold)
      : rows;
  const sliced = filtered.slice(offset, offset + limit);
  if (rows.length === 0 && userRows > 0) {
    logger.warn(
      `[searchLocalEntityEmbeddings] KNN returned 0 rows despite userRows=${userRows}; userId=${userId}`
    );
  }
  return sliced.map((r) => r.entity_id);
}
