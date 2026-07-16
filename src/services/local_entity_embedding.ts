// Local entity embedding storage and retrieval via sqlite-vec
// Used when storageBackend === "local" and OPENAI_API_KEY is set

import { createRequire } from "node:module";
import { AsyncSqliteDatabase, type SqliteDatabase } from "../repositories/sqlite/sqlite_driver.js";
import type { DbDatabase } from "../repositories/db/driver.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { getDb } from "../repositories/db/connection.js";

const createRequireFromMeta = createRequire(import.meta.url);
const EMBEDDING_DIM = 1536;

let sqliteVecLoaded: boolean | null = null;

/**
 * Load sqlite-vec extension lazily. Caches success/failure.
 * Returns true if loaded, false if failed (e.g. wrong platform).
 */
export function ensureSqliteVecLoaded(db: SqliteDatabase): boolean {
  if (sqliteVecLoaded !== null) {
    return sqliteVecLoaded;
  }
  try {
    const sqliteVec = createRequireFromMeta("sqlite-vec") as { load: (d: SqliteDatabase) => void };
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
 * Extract the raw synchronous SQLite handle needed by sqlite-vec's `load()`.
 * Returns null for backends without one (e.g. libSQL), where sqlite-vec is
 * unavailable — same degradation as a failed extension load.
 */
function rawSqliteHandle(db: DbDatabase): SqliteDatabase | null {
  return db instanceof AsyncSqliteDatabase ? db.rawDb() : null;
}

/**
 * Ensure vec0 virtual table exists. Call after ensureSqliteVecLoaded.
 * entity_embedding_rows is created by sqlite_client schema.
 */
function ensureVecSchema(db: SqliteDatabase): void {
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
export async function storeLocalEntityEmbedding(row: {
  entity_id: string;
  embedding?: number[] | null;
  user_id: string;
  entity_type: string;
  merged?: boolean;
}): Promise<void> {
  if (!row.embedding || row.embedding.length !== EMBEDDING_DIM) {
    return;
  }
  if (config.storageBackend !== "local" || !config.openaiApiKey) {
    return;
  }

  const db = await getDb();
  const rawDb = rawSqliteHandle(db);
  if (!rawDb || !ensureSqliteVecLoaded(rawDb)) {
    return;
  }
  ensureVecSchema(rawDb);

  const merged = row.merged ? 1 : 0;

  // Upsert: delete existing row for entity_id if any, then insert
  const existing = (await db
    .prepare("SELECT rowid FROM entity_embedding_rows WHERE entity_id = ?")
    .get(row.entity_id)) as { rowid: number } | undefined;

  if (existing) {
    await db.prepare("DELETE FROM entity_embeddings_vec WHERE rowid = ?").run(existing.rowid);
    await db.prepare("DELETE FROM entity_embedding_rows WHERE rowid = ?").run(existing.rowid);
  }

  const embeddingBlob = new Float32Array(row.embedding);
  await db
    .prepare("INSERT INTO entity_embeddings_vec(rowid, embedding) VALUES (?, ?)")
    .run(null, embeddingBlob);

  const rowid = (await db.prepare("SELECT last_insert_rowid() as id").get()) as {
    id: number;
  };
  await db
    .prepare(
      "INSERT INTO entity_embedding_rows(rowid, entity_id, user_id, entity_type, merged) VALUES (?, ?, ?, ?, ?)"
    )
    .run(rowid.id, row.entity_id, row.user_id, row.entity_type, merged);
}

/**
 * Semantic search over local entity embeddings.
 * Returns entity IDs ordered by similarity.
 */
export async function searchLocalEntityEmbeddings(options: {
  queryEmbedding: number[];
  userId: string;
  entityType?: string | null;
  /**
   * Multi-type filter, OR-combined with `entityType` (#1562). When non-empty,
   * candidates are restricted to rows whose `entity_type` is in this list.
   */
  entityTypes?: string[];
  includeMerged: boolean;
  /**
   * L2 distance threshold. Results with distance >= threshold are dropped.
   * Practical range ~0.9–1.5. Typical values: 1.0 (strict), 1.02 (moderate), 1.05 (loose).
   * Omit to return all k results regardless of distance.
   */
  distanceThreshold?: number;
  limit: number;
  offset: number;
}): Promise<{ entityIds: string[]; total: number }> {
  const {
    queryEmbedding,
    userId,
    entityType,
    entityTypes,
    includeMerged,
    distanceThreshold,
    limit,
    offset,
  } = options;

  // Union of singular + plural type filters. Empty → no type filter.
  const typeFilter = (() => {
    const types = new Set<string>();
    if (typeof entityType === "string" && entityType.trim().length > 0) {
      types.add(entityType);
    }
    for (const candidate of entityTypes ?? []) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        types.add(candidate);
      }
    }
    return [...types].sort();
  })();

  if (
    config.storageBackend !== "local" ||
    !config.openaiApiKey ||
    queryEmbedding.length !== EMBEDDING_DIM
  ) {
    logger.warn(
      `[searchLocalEntityEmbeddings] early exit: storageBackend=${config.storageBackend} openaiApiKey=${!!config.openaiApiKey} embLen=${queryEmbedding?.length ?? 0}`
    );
    return { entityIds: [], total: 0 };
  }

  const db = await getDb();
  const rawDb = rawSqliteHandle(db);
  if (!rawDb || !ensureSqliteVecLoaded(rawDb)) {
    logger.warn("[searchLocalEntityEmbeddings] sqlite-vec not loaded");
    return { entityIds: [], total: 0 };
  }
  ensureVecSchema(rawDb);

  // Debug: row counts for userId
  const totalRows = (
    (await db.prepare("SELECT COUNT(*) as c FROM entity_embedding_rows").get()) as { c: number }
  ).c;
  const userRows = (
    (await db
      .prepare("SELECT COUNT(*) as c FROM entity_embedding_rows WHERE user_id = ?")
      .get(userId)) as {
      c: number;
    }
  ).c;
  const distinctUsers = (
    (await db.prepare("SELECT DISTINCT user_id FROM entity_embedding_rows").all()) as {
      user_id: string;
    }[]
  ).map((r) => r.user_id);
  if (userRows === 0) {
    logger.warn(
      `[searchLocalEntityEmbeddings] userId=${userId} has 0 rows; total=${totalRows} distinctUsers=${distinctUsers.slice(0, 5).join(",")}${distinctUsers.length > 5 ? "..." : ""}`
    );
  }

  // Oversample for filtering: fetch more candidates then filter and slice
  const oversample = Math.max((limit + offset) * 5, 500);
  const float32 = new Float32Array(queryEmbedding);
  const embeddingBlob = Buffer.from(float32.buffer, float32.byteOffset, float32.byteLength);

  // Build the entity_type clause from the normalized union list. No filter when
  // empty; equality for one type; an IN(...) with bound placeholders otherwise.
  const typeClause =
    typeFilter.length === 0
      ? "1 = 1"
      : typeFilter.length === 1
        ? "r.entity_type = ?"
        : `r.entity_type IN (${typeFilter.map(() => "?").join(", ")})`;

  const rows = (await db
    .prepare(
      `
    SELECT r.entity_id, v.distance
    FROM entity_embeddings_vec v
    INNER JOIN entity_embedding_rows r ON r.rowid = v.rowid
    WHERE v.embedding MATCH ? AND k = ?
      AND r.user_id = ?
      AND ${typeClause}
      AND (? = 1 OR r.merged = 0)
    ORDER BY v.distance
  `
    )
    .all(
      embeddingBlob,
      oversample,
      userId,
      ...typeFilter,
      includeMerged ? 1 : 0 /* includeMerged=1: all rows; =0: only non-merged (r.merged=0) */
    )) as Array<{ entity_id: string; distance: number }>;

  const filtered =
    distanceThreshold !== undefined ? rows.filter((r) => r.distance < distanceThreshold) : rows;
  const sliced = filtered.slice(offset, offset + limit);
  if (rows.length === 0 && userRows > 0) {
    logger.warn(
      `[searchLocalEntityEmbeddings] KNN returned 0 rows despite userRows=${userRows}; userId=${userId}`
    );
  }
  return { entityIds: sliced.map((r) => r.entity_id), total: filtered.length };
}
