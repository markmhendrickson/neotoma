import crypto from "crypto";
import { mkdirSync, readFileSync } from "fs";
import fs from "fs/promises";
import path from "path";
import { getSqliteDb } from "./sqlite_client.js";
import { config } from "../../config.js";
import { encryptColumn, decryptColumn, isEncryptedColumn } from "../../crypto/column_encryption.js";
import { deriveKeys, deriveKeysFromMnemonic, hexToKey } from "../../crypto/key_derivation.js";

type QueryResult<T> = { data: T | null; error: { message: string; code?: string } | null; count?: number };

/** Columns stored as 0/1 in SQLite that should be returned as boolean */
const BOOLEAN_COLUMNS: Record<string, Set<string>> = {
  schema_registry: new Set(["active", "test"]),
};

const JSON_COLUMNS: Record<string, Set<string>> = {
  sources: new Set(["provenance"]),
  interpretations: new Set(["interpretation_config"]),
  observations: new Set(["fields"]),
  entity_snapshots: new Set(["snapshot", "provenance"]),
  entities: new Set(["aliases"]),
  relationship_observations: new Set(["metadata"]),
  relationship_snapshots: new Set(["snapshot", "provenance"]),
  raw_fragments: new Set(["fragment_value", "fragment_envelope"]),
  schema_registry: new Set(["schema_definition", "reducer_config", "metadata"]),
  schema_recommendations: new Set(["fields_to_add", "fields_to_remove", "fields_to_modify", "converters_to_add"]),
  auto_enhancement_queue: new Set(["payload"]),
};

/**
 * Columns that are encrypted at rest when NEOTOMA_ENCRYPTION_ENABLED=true.
 * Only content/payload columns; never IDs, timestamps, hashes, or signatures.
 * See plan Section 7 (blockchain compatibility).
 */
const ENCRYPTED_COLUMNS: Record<string, Set<string>> = {
  observations: new Set(["fields"]),
  entity_snapshots: new Set(["snapshot", "provenance"]),
  relationship_snapshots: new Set(["snapshot", "provenance"]),
  raw_fragments: new Set(["fragment_value", "fragment_envelope"]),
  schema_recommendations: new Set(["fields_to_add", "fields_to_remove", "fields_to_modify", "converters_to_add"]),
  auto_enhancement_queue: new Set(["payload"]),
};

/** Cached data encryption key (lazy-loaded on first use) */
let cachedDataKey: Uint8Array | null = null;

/**
 * Load the data encryption key from config (key file or mnemonic).
 * Returns null if encryption is not enabled.
 */
function getDataKey(): Uint8Array | null {
  if (!config.encryption.enabled) {
    return null;
  }
  if (cachedDataKey) {
    return cachedDataKey;
  }

  // Priority: key file > mnemonic
  if (config.encryption.keyFilePath) {
    const raw = readFileSync(config.encryption.keyFilePath, "utf8").trim();
    const keyBytes = hexToKey(raw);
    const derived = deriveKeys(keyBytes);
    cachedDataKey = derived.dataKey;
    return cachedDataKey;
  }

  if (config.encryption.mnemonic) {
    const derived = deriveKeysFromMnemonic(
      config.encryption.mnemonic,
      config.encryption.mnemonicPassphrase,
    );
    cachedDataKey = derived.dataKey;
    return cachedDataKey;
  }

  throw new Error(
    "Encryption is enabled but no key source configured. " +
    "Set NEOTOMA_KEY_FILE_PATH or NEOTOMA_MNEMONIC."
  );
}

/**
 * Clear the cached data key. Call after key rotation or for testing.
 */
export function clearCachedDataKey(): void {
  cachedDataKey = null;
}

const TABLES_WITH_ID = new Set([
  "sources",
  "interpretations",
  "observations",
  "entities",
  "timeline_events",
  "relationship_observations",
  "raw_fragments",
  "entity_merges",
  "schema_registry",
  "schema_recommendations",
  "auto_enhancement_queue",
  "field_blacklist",
  "source_entity_edges",
  "source_event_edges",
  "mcp_oauth_state",
  "mcp_oauth_connections",
  "mcp_oauth_client_state",
  "auth_users",
  "auth_sessions",
  "local_auth_users",
]);

const DETERMINISTIC_ID_TABLES = new Set([
  "sources",
  "observations",
  "entities",
  "timeline_events",
  "relationship_observations",
  "interpretations",
]);

/** SQLite3 only accepts numbers, strings, bigints, buffers, and null. Normalize for bind. */
function toBindValue(value: unknown): unknown {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return value;
}

function toDbValue(table: string, column: string, value: unknown): unknown {
  if (value === undefined) {
    return null;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (JSON_COLUMNS[table]?.has(column)) {
    const jsonStr = value === null ? null : JSON.stringify(value);
    // Encrypt if this column is in the encrypted set and encryption is enabled
    if (jsonStr !== null && ENCRYPTED_COLUMNS[table]?.has(column)) {
      const key = getDataKey();
      if (key) {
        return encryptColumn(jsonStr, key);
      }
    }
    return jsonStr;
  }
  return value;
}

/** Map SQLite constraint errors to PostgreSQL error codes for compatibility */
function mapSqliteErrorToPostgres(error: { errno?: number; code?: string; message?: string }): string | undefined {
  const code = error.code || "";
  const msg = (error.message || "").toLowerCase();
  const errno = error.errno;
  if (errno === 2067 || code === "SQLITE_CONSTRAINT_UNIQUE" || msg.includes("unique constraint")) {
    return "23505";
  }
  if (errno === 787 || code === "SQLITE_CONSTRAINT_FOREIGNKEY" || msg.includes("foreign key")) {
    return "23503";
  }
  if (code === "SQLITE_CONSTRAINT" && msg.includes("unique")) return "23505";
  if (code === "SQLITE_CONSTRAINT" && msg.includes("foreign key")) return "23503";
  return undefined;
}

function fromDbRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...row };
  const booleanColumns = BOOLEAN_COLUMNS[table];
  if (booleanColumns) {
    for (const column of booleanColumns) {
      if (result[column] === 1 || result[column] === "1") {
        result[column] = true;
      } else if (result[column] === 0 || result[column] === "0") {
        result[column] = false;
      }
    }
  }
  const jsonColumns = JSON_COLUMNS[table];
  if (!jsonColumns) {
    return result;
  }
  for (const column of jsonColumns) {
    if (result[column] === null || result[column] === undefined) {
      continue;
    }
    if (typeof result[column] === "string") {
      let raw = result[column] as string;

      // Decrypt if this column is in the encrypted set and value looks encrypted
      if (ENCRYPTED_COLUMNS[table]?.has(column) && isEncryptedColumn(raw)) {
        const key = getDataKey();
        if (key) {
          try {
            raw = decryptColumn(raw, key);
          } catch {
            // If decryption fails, leave as-is (wrong key or plaintext data from before encryption)
          }
        }
      }

      try {
        result[column] = JSON.parse(raw);
      } catch {
        // Leave as string if parse fails
        result[column] = raw;
      }
    }
  }

  // Compatibility aliases (match Postgres naming used in tests).
  if (table === "entities") {
    if (!("merged_into" in result) && "merged_to_entity_id" in result) {
      result["merged_into"] = result["merged_to_entity_id"];
    }
  }
  return result;
}

function normalizeColumnName(table: string, column: string): string {
  // Compatibility aliases used by tests and older codepaths.
  if (table === "entities" && column === "merged_into") return "merged_to_entity_id";
  if (table === "observations" && column === "priority") return "source_priority";
  return column;
}

function deriveCanonicalName(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
}

function deriveCanonicalNameFromObject(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return (
    deriveCanonicalName(v["canonical_name"]) ??
    deriveCanonicalName(v["canonicalName"]) ??
    deriveCanonicalName(v["title"]) ??
    deriveCanonicalName(v["name"]) ??
    null
  );
}

async function ensureEntityRowForObservation(
  db: ReturnType<typeof getSqliteDb>,
  obs: Record<string, unknown>
): Promise<void> {
  const entityId = typeof obs["entity_id"] === "string" ? (obs["entity_id"] as string) : null;
  const entityType = typeof obs["entity_type"] === "string" ? (obs["entity_type"] as string) : null;
  if (!entityId || !entityType) return;

  const existing = db.prepare("SELECT id FROM entities WHERE id = ?").get(entityId) as
    | { id: string }
    | undefined;
  if (existing) return;

  const fields = obs["fields"];
  const canonicalName =
    deriveCanonicalNameFromObject(fields) ??
    // last resort so INSERT doesn't violate NOT NULL
    entityId;
  const now = new Date().toISOString();
  const userId =
    typeof obs["user_id"] === "string" || obs["user_id"] === null ? obs["user_id"] : null;

  db.prepare(
    "INSERT INTO entities (id, entity_type, canonical_name, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(entityId, entityType, canonicalName, now, now, userId);
}

async function ensureEntityRowForSnapshot(
  db: ReturnType<typeof getSqliteDb>,
  snapshotRow: Record<string, unknown>
): Promise<void> {
  const entityId = typeof snapshotRow["entity_id"] === "string" ? (snapshotRow["entity_id"] as string) : null;
  const entityType =
    typeof snapshotRow["entity_type"] === "string" ? (snapshotRow["entity_type"] as string) : null;
  if (!entityId || !entityType) return;

  const existing = db.prepare("SELECT id FROM entities WHERE id = ?").get(entityId) as
    | { id: string }
    | undefined;
  if (existing) return;

  const canonicalName =
    deriveCanonicalName(snapshotRow["canonical_name"]) ??
    deriveCanonicalNameFromObject(snapshotRow["snapshot"]) ??
    entityId;
  const now = new Date().toISOString();
  const userId =
    typeof snapshotRow["user_id"] === "string" || snapshotRow["user_id"] === null
      ? snapshotRow["user_id"]
      : null;

  db.prepare(
    "INSERT INTO entities (id, entity_type, canonical_name, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(entityId, entityType, canonicalName, now, now, userId);
}

async function recomputeEntitySnapshot(
  db: ReturnType<typeof getSqliteDb>,
  entityId: string
): Promise<void> {
  const { ObservationReducer } = await import("../../reducers/observation_reducer.js");
  const reducer = new ObservationReducer();

  const rows = db
    .prepare("SELECT * FROM observations WHERE entity_id = ?")
    .all(entityId) as Record<string, unknown>[];
  const observations = rows.map((r) => fromDbRow("observations", r)) as any[];
  if (observations.length === 0) {
    db.prepare("DELETE FROM entity_snapshots WHERE entity_id = ?").run(entityId);
    return;
  }

  const snapshot = await reducer.computeSnapshot(entityId, observations);
  if (!snapshot) {
    db.prepare("DELETE FROM entity_snapshots WHERE entity_id = ?").run(entityId);
    return;
  }

  const canonicalName = deriveCanonicalNameFromObject((snapshot as any).snapshot);
  const payload: Record<string, unknown> = {
    ...snapshot,
    canonical_name: canonicalName,
  };

  const columns = Object.keys(payload);
  const values = columns.map((column) => toDbValue("entity_snapshots", column, payload[column]));
  const placeholders = columns.map(() => "?").join(", ");
  db.prepare(
    `INSERT OR REPLACE INTO entity_snapshots (${columns.join(", ")}) VALUES (${placeholders})`
  ).run(values);
}

async function recomputeRelationshipSnapshot(
  db: ReturnType<typeof getSqliteDb>,
  relationshipKey: string
): Promise<void> {
  const { RelationshipReducer } = await import("../../reducers/relationship_reducer.js");
  const reducer = new RelationshipReducer();

  const rows = db
    .prepare("SELECT * FROM relationship_observations WHERE relationship_key = ?")
    .all(relationshipKey) as Record<string, unknown>[];
  const observations = rows.map((r) => fromDbRow("relationship_observations", r)) as any[];
  if (observations.length === 0) {
    db.prepare("DELETE FROM relationship_snapshots WHERE relationship_key = ?").run(relationshipKey);
    return;
  }

  const snapshot = await reducer.computeSnapshot(relationshipKey, observations);
  const payload: Record<string, unknown> = { ...snapshot };
  const columns = Object.keys(payload);
  const values = columns.map((column) =>
    toDbValue("relationship_snapshots", column, payload[column])
  );
  const placeholders = columns.map(() => "?").join(", ");
  db.prepare(
    `INSERT OR REPLACE INTO relationship_snapshots (${columns.join(", ")}) VALUES (${placeholders})`
  ).run(values);
}


class LocalQueryBuilder {
  private table: string;
  private operation: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private selectColumns: string | null = "*";
  private filters: string[] = [];
  private filterValues: unknown[] = [];
  private orderBy: Array<{ column: string; ascending: boolean }> = [];
  private limitValue: number | null = null;
  private offsetValue: number | null = null;
  private insertPayload: Record<string, unknown>[] | null = null;
  private updatePayload: Record<string, unknown> | null = null;
  private upsertPayload: Record<string, unknown>[] | null = null;
  private countExact = false;
  private countHead = false;
  private expectSingle = false;
  private allowNullSingle = false;
  private orConditions: Array<{ clause: string; values: unknown[] }> = [];

  constructor(table: string) {
    this.table = table;
  }

  select(columns?: string, options?: { count?: "exact"; head?: boolean }): this {
    this.selectColumns = columns || "*";
    this.countExact = options?.count === "exact";
    this.countHead = options?.head === true;
    if (this.operation !== "insert" && this.operation !== "upsert") {
      this.operation = "select";
    }
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]): this {
    this.operation = "insert";
    this.insertPayload = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  update(payload: Record<string, unknown>): this {
    this.operation = "update";
    this.updatePayload = payload;
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  upsert(payload: Record<string, unknown> | Record<string, unknown>[], _options?: { onConflict?: string }): this {
    this.operation = "upsert";
    this.upsertPayload = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  delete(): this {
    this.operation = "delete";
    return this;
  }

  eq(column: string, value: unknown): this {
    const col = normalizeColumnName(this.table, column);
    if (value === null) {
      this.filters.push(`${col} IS NULL`);
    } else {
      this.filters.push(`${col} = ?`);
      this.filterValues.push(value);
    }
    return this;
  }

  /** Postgrest-compatible NULL check: .is(column, null) => column IS NULL */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  is(column: string, value: null): this {
    const col = normalizeColumnName(this.table, column);
    this.filters.push(`${col} IS NULL`);
    return this;
  }

  in(column: string, values: unknown[]): this {
    const col = normalizeColumnName(this.table, column);
    if (values.length === 0) {
      this.filters.push("1 = 0");
      return this;
    }
    const placeholders = values.map(() => "?").join(", ");
    this.filters.push(`${col} IN (${placeholders})`);
    this.filterValues.push(...values);
    return this;
  }

  not(column: string, operator: string, value: unknown): this {
    const col = normalizeColumnName(this.table, column);
    if (operator === "is" && value === null) {
      this.filters.push(`${col} IS NOT NULL`);
      return this;
    }
    this.filters.push(`${col} != ?`);
    this.filterValues.push(value);
    return this;
  }

  ilike(column: string, pattern: string): this {
    const col = normalizeColumnName(this.table, column);
    this.filters.push(`${col} LIKE ? COLLATE NOCASE`);
    this.filterValues.push(pattern);
    return this;
  }

  gte(column: string, value: unknown): this {
    const col = normalizeColumnName(this.table, column);
    this.filters.push(`${col} >= ?`);
    this.filterValues.push(value);
    return this;
  }

  lte(column: string, value: unknown): this {
    const col = normalizeColumnName(this.table, column);
    this.filters.push(`${col} <= ?`);
    this.filterValues.push(value);
    return this;
  }

  lt(column: string, value: unknown): this {
    const col = normalizeColumnName(this.table, column);
    this.filters.push(`${col} < ?`);
    this.filterValues.push(value);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    const col = normalizeColumnName(this.table, column);
    this.orderBy.push({ column: col, ascending: options?.ascending !== false });
    return this;
  }

  range(from: number, to: number): this {
    this.offsetValue = from;
    this.limitValue = Math.max(0, to - from + 1);
    return this;
  }

  limit(limit: number): this {
    this.limitValue = limit;
    return this;
  }

  single(): this {
    this.expectSingle = true;
    this.allowNullSingle = false;
    return this;
  }

  maybeSingle(): this {
    this.expectSingle = true;
    this.allowNullSingle = true;
    return this;
  }

  or(conditions: string): this {
    const parts = conditions.split(",").map((p) => p.trim()).filter(Boolean);
    const clauses: string[] = [];
    const values: unknown[] = [];

    for (const part of parts) {
      const dotIdx = part.indexOf(".");
      if (dotIdx < 0) continue;
      const left = part.slice(0, dotIdx);
      const rest = part.slice(dotIdx + 1);
      const dotIdx2 = rest.indexOf(".");
      const op = dotIdx2 >= 0 ? rest.slice(0, dotIdx2) : rest;
      const value = dotIdx2 >= 0 ? rest.slice(dotIdx2 + 1) : "";

      if (!left || !op) continue;

      if (op === "eq") {
        clauses.push(`${left} = ?`);
        values.push(value);
      } else if (op === "is" && value === "null") {
        clauses.push(`${left} IS NULL`);
      } else if (op === "ilike") {
        clauses.push(`${left} LIKE ? COLLATE NOCASE`);
        values.push(value);
      } else if (op === "like") {
        clauses.push(`${left} LIKE ?`);
        values.push(value);
      } else if (op === "neq") {
        clauses.push(`${left} != ?`);
        values.push(value);
      } else if (op === "cs") {
        // PostgREST cs (contains) - for JSON arrays, do a LIKE check on the TEXT column
        clauses.push(`${left} LIKE ?`);
        values.push(`%${value.replace(/^\["|"\]$/, "").replace(/^"|"$/g, "")}%`);
      }
    }

    if (clauses.length > 0) {
      this.orConditions.push({ clause: `(${clauses.join(" OR ")})`, values });
    }
    return this;
  }

  async execute(): Promise<QueryResult<any>> {
    const db = getSqliteDb();
    const whereClauses: string[] = [];
    const values: unknown[] = [];

    if (this.filters.length > 0) {
      whereClauses.push(...this.filters);
      values.push(...this.filterValues.map(toBindValue));
    }
    if (this.orConditions.length > 0) {
      const orClause = this.orConditions.map((o) => o.clause).join(" AND ");
      whereClauses.push(orClause);
      for (const condition of this.orConditions) {
        values.push(...condition.values.map(toBindValue));
      }
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    try {
      if (this.operation === "select") {
        const countRow = this.countExact
          ? db.prepare(`SELECT COUNT(*) as count FROM ${this.table} ${whereSql}`).get(values) as { count: number } | undefined
          : undefined;
        const count = countRow?.count;

        if (this.countHead) {
          return { data: null, error: null, count };
        }

        const orderSql =
          this.orderBy.length > 0
            ? `ORDER BY ${this.orderBy
                .map((o) => `${o.column} ${o.ascending ? "ASC" : "DESC"}`)
                .join(", ")}`
            : "";
        const limitSql = this.limitValue !== null ? `LIMIT ${this.limitValue}` : "";
        const offsetSql = this.offsetValue !== null ? `OFFSET ${this.offsetValue}` : "";

        const sql = `SELECT ${this.selectColumns || "*"} FROM ${this.table} ${whereSql} ${orderSql} ${limitSql} ${offsetSql}`.trim();
        const rows = db.prepare(sql).all(values).map((row: any) => fromDbRow(this.table, row));

        if (this.expectSingle) {
          const row = rows[0] || null;
          if (!row && !this.allowNullSingle) {
            const detail =
              whereSql ||
              "no filter applied";
            return {
              data: null,
              error: {
                message: `SELECT on table '${this.table}' returned no rows (expected exactly one). Query had: ${detail}.`,
                code: "PGRST116",
              },
            };
          }
          return { data: row, error: null, count };
        }

        return { data: rows, error: null, count };
      }

      if (this.operation === "insert" && this.insertPayload) {
        const inserted: Record<string, unknown>[] = [];
        for (const item of this.insertPayload) {
          const payload = { ...item };

          // Compatibility: observations.priority -> observations.source_priority
          if (
            this.table === "observations" &&
            "priority" in payload &&
            !("source_priority" in payload)
          ) {
            payload["source_priority"] = payload["priority"];
            delete payload["priority"];
          }

          // Parity with Postgres: supply required observation columns when omitted by tests/helpers.
          if (this.table === "observations") {
            // Compatibility: some tests use observations.id as entity identifier.
            if (!("entity_id" in payload) && typeof payload["id"] === "string" && /^ent_/i.test(payload["id"] as string)) {
              payload["entity_id"] = payload["id"];
            }
            if (!("schema_version" in payload)) payload["schema_version"] = "1.0";
            if (!("observed_at" in payload)) payload["observed_at"] = new Date().toISOString();
          }

          // Parity with Postgres: derive relationship_key when omitted.
          if (this.table === "relationship_observations") {
            const hasKey = typeof payload["relationship_key"] === "string" && payload["relationship_key"];
            if (!hasKey) {
              const rt = typeof payload["relationship_type"] === "string" ? payload["relationship_type"] : "";
              const se = typeof payload["source_entity_id"] === "string" ? payload["source_entity_id"] : "";
              const te = typeof payload["target_entity_id"] === "string" ? payload["target_entity_id"] : "";
              if (rt && se && te) {
                payload["relationship_key"] = `${rt}:${se}:${te}`;
              }
            }
            if (!("observed_at" in payload)) payload["observed_at"] = new Date().toISOString();
            if (!("source_priority" in payload)) payload["source_priority"] = 0;
            if (!("metadata" in payload)) payload["metadata"] = {};
          }

          // Parity: entity_snapshots.canonical_name column for filtering.
          if (this.table === "entity_snapshots" && !("canonical_name" in payload)) {
            const derived = deriveCanonicalNameFromObject(payload["snapshot"]);
            if (derived) payload["canonical_name"] = derived;
          }

          if (TABLES_WITH_ID.has(this.table) && !payload.id) {
            if (DETERMINISTIC_ID_TABLES.has(this.table)) {
              console.warn(
                `[DETERMINISM] Missing ID for ${this.table} insert; falling back to randomUUID. Callers should provide deterministic IDs for domain tables.`
              );
            }
            payload.id = crypto.randomUUID();
          }
          // Only add created_at for tables that have this column
          // entity_snapshots and relationship_snapshots don't have created_at
          const TABLES_WITHOUT_CREATED_AT = new Set(["entity_snapshots", "relationship_snapshots"]);
          if ("created_at" in payload === false && !TABLES_WITHOUT_CREATED_AT.has(this.table)) {
            payload.created_at = new Date().toISOString();
          }
          const columns = Object.keys(payload);
          const values = columns.map((column) => toDbValue(this.table, column, payload[column]));
          const placeholders = columns.map(() => "?").join(", ");
          db.prepare(`INSERT INTO ${this.table} (${columns.join(", ")}) VALUES (${placeholders})`).run(values);
          inserted.push(payload);

          // Local backend parity: inserts can materialize related state (entities + snapshots).
          if (this.table === "observations") {
            await ensureEntityRowForObservation(db, payload);
            if (typeof payload["entity_id"] === "string") {
              await recomputeEntitySnapshot(db, payload["entity_id"] as string);
            }
          }
          if (this.table === "entity_snapshots") {
            await ensureEntityRowForSnapshot(db, payload);
          }
          if (this.table === "relationship_observations") {
            const rk = payload["relationship_key"];
            if (typeof rk === "string" && rk) {
              await recomputeRelationshipSnapshot(db, rk);
            }
          }

        }

        if (this.selectColumns) {
          return { data: this.expectSingle ? inserted[0] : inserted, error: null };
        }
        return { data: null, error: null };
      }

      if (this.operation === "update" && this.updatePayload) {
        const payload = { ...this.updatePayload };
        const columns = Object.keys(payload);
        const updateValues = columns.map((column) => toDbValue(this.table, column, payload[column]));
        const updateSql = columns.map((column) => `${column} = ?`).join(", ");

        db.prepare(`UPDATE ${this.table} SET ${updateSql} ${whereSql}`).run([...updateValues, ...values]);

        if (this.selectColumns) {
          const rows = db.prepare(`SELECT ${this.selectColumns} FROM ${this.table} ${whereSql}`).all(values).map((row: any) => fromDbRow(this.table, row));
          if (this.expectSingle) {
            const row = rows[0] || null;
            if (!row && !this.allowNullSingle) {
              const detail =
                whereSql ||
                "no filter applied";
              return {
                data: null,
                error: {
                  message: `UPDATE on table '${this.table}' then SELECT returned no rows (expected exactly one). Query had: ${detail}.`,
                  code: "PGRST116",
                },
              };
            }
            return { data: row, error: null };
          }
          return { data: rows, error: null };
        }
        return { data: null, error: null };
      }

      if (this.operation === "upsert" && this.upsertPayload) {
        const inserted: Record<string, unknown>[] = [];
        for (const item of this.upsertPayload) {
          const payload = { ...item };

          if (this.table === "entity_snapshots" && !("canonical_name" in payload)) {
            const derived = deriveCanonicalNameFromObject(payload["snapshot"]);
            if (derived) payload["canonical_name"] = derived;
          }

          if (TABLES_WITH_ID.has(this.table) && !payload.id) {
            if (DETERMINISTIC_ID_TABLES.has(this.table)) {
              console.warn(
                `[DETERMINISM] Missing ID for ${this.table} upsert; falling back to randomUUID. Callers should provide deterministic IDs for domain tables.`
              );
            }
            payload.id = crypto.randomUUID();
          }
          const columns = Object.keys(payload);
          const values = columns.map((column) => toDbValue(this.table, column, payload[column]));
          const placeholders = columns.map(() => "?").join(", ");
          db.prepare(`INSERT OR REPLACE INTO ${this.table} (${columns.join(", ")}) VALUES (${placeholders})`).run(values);
          inserted.push(payload);

          if (this.table === "entity_snapshots") {
            await ensureEntityRowForSnapshot(db, payload);
          }
        }
        if (this.selectColumns) {
          return { data: this.expectSingle ? inserted[0] : inserted, error: null };
        }
        return { data: null, error: null };
      }

      if (this.operation === "delete") {
        db.prepare(`DELETE FROM ${this.table} ${whereSql}`).run(values);
        return { data: null, error: null };
      }

      return { data: null, error: { message: "Unsupported operation" } };
    } catch (error: any) {
      const msg = error.message || String(error);
      const code = mapSqliteErrorToPostgres(error);
      return { data: null, error: { message: msg, ...(code ? { code } : {}) } };
    }
  }

  then<TResult1 = QueryResult<any>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<any>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class LocalStorageBucket {
  private bucket: string;

  constructor(bucket: string) {
    this.bucket = bucket;
  }

  private resolvePath(objectPath: string): string {
    if (this.bucket === "sources") {
      return path.join(config.rawStorageDir, objectPath);
    }
    return path.join(config.dataDir, "storage", this.bucket, objectPath);
  }

  async upload(objectPath: string, data: Buffer, options?: { upsert?: boolean; contentType?: string }): Promise<QueryResult<null>> {
    const targetPath = this.resolvePath(objectPath);
    const dir = path.dirname(targetPath);
    mkdirSync(dir, { recursive: true });

    try {
      if (!options?.upsert) {
        try {
          await fs.access(targetPath);
          return { data: null, error: { message: "File already exists", code: "STORAGE_FILE_EXISTS" } };
        } catch {
          // continue
        }
      }
      await fs.writeFile(targetPath, data);
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message || String(error) } };
    }
  }

  async download(objectPath: string): Promise<QueryResult<{ arrayBuffer: () => Promise<ArrayBuffer> }>> {
    const targetPath = this.resolvePath(objectPath);
    try {
      const file = await fs.readFile(targetPath);
      return {
        data: {
          arrayBuffer: async () => file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
        },
        error: null,
      };
    } catch (error: any) {
      return { data: null, error: { message: error.message || String(error) } };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createSignedUrl(objectPath: string, _expiresIn: number): Promise<QueryResult<{ signedUrl: string }>> {
    const targetPath = this.resolvePath(objectPath);
    const signedUrl = `file://${targetPath}`;
    return { data: { signedUrl }, error: null };
  }
}

class LocalStorageClient {
  from(bucket: string): LocalStorageBucket {
    return new LocalStorageBucket(bucket);
  }
}

class LocalAuthAdmin {
  async getUserById(userId: string): Promise<QueryResult<{ user: { id: string; email?: string | null } | null }>> {
    const db = getSqliteDb();
    const user = db.prepare("SELECT id, email FROM auth_users WHERE id = ?").get(userId) as { id: string; email?: string | null } | undefined;
    if (!user) {
      return { data: null, error: { message: "User not found", code: "PGRST116" } };
    }
    return { data: { user }, error: null };
  }

  async createUser(payload: { id?: string; email?: string; email_confirm?: boolean }): Promise<QueryResult<{ user: { id: string; email?: string | null } }>> {
    const db = getSqliteDb();
    const id = payload.id || crypto.randomUUID();
    const email = payload.email || null;
    db.prepare("INSERT INTO auth_users (id, email, created_at) VALUES (?, ?, ?)").run(
      id,
      email,
      new Date().toISOString()
    );
    return { data: { user: { id, email } }, error: null };
  }

  async listUsers(): Promise<QueryResult<{ users: Array<{ id: string; email?: string | null }> }>> {
    const db = getSqliteDb();
    const users = db.prepare("SELECT id, email FROM auth_users").all();
    return { data: { users: users as any }, error: null };
  }

  async generateLink(payload: { type: string; email: string; options?: { redirectTo?: string } }): Promise<QueryResult<{ properties: { action_link: string } }>> {
    const db = getSqliteDb();
    const user = db.prepare("SELECT id, email FROM auth_users WHERE email = ?").get(payload.email) as { id: string; email?: string } | undefined;
    if (!user) {
      return { data: null, error: { message: "User not found", code: "PGRST116" } };
    }

    const accessToken = `local_${crypto.randomUUID()}`;
    const refreshToken = `local_refresh_${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const sessionId = crypto.randomUUID();

    db.prepare(
      "INSERT INTO auth_sessions (id, user_id, access_token, refresh_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(sessionId, user.id, accessToken, refreshToken, expiresAt, new Date().toISOString());

    const redirectTo = payload.options?.redirectTo || "http://localhost:5173";
    const actionLink = `${redirectTo}#access_token=${accessToken}&refresh_token=${refreshToken}`;

    return { data: { properties: { action_link: actionLink } }, error: null };
  }
}

class LocalAuthClient {
  admin = new LocalAuthAdmin();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async refreshSession(_opts: { refresh_token: string }): Promise<QueryResult<{ session: null }>> {
    return {
      data: { session: null },
      error: { message: "Token refresh not supported in local backend", code: "AUTH_LOCAL" },
    };
  }

  async getUser(token: string): Promise<QueryResult<{ user: { id: string; email?: string | null } }>> {
    const db = getSqliteDb();
    const session = db.prepare("SELECT user_id, access_token, expires_at FROM auth_sessions WHERE access_token = ?").get(token) as { user_id: string; expires_at: string | null } | undefined;
    if (!session) {
      return { data: null, error: { message: "Invalid token", code: "AUTH_INVALID" } };
    }
    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
      return { data: null, error: { message: "Token expired", code: "AUTH_EXPIRED" } };
    }
    const user = db.prepare("SELECT id, email FROM auth_users WHERE id = ?").get(session.user_id) as { id: string; email?: string | null } | undefined;
    if (!user) {
      return { data: null, error: { message: "User not found", code: "PGRST116" } };
    }
    return { data: { user: user as any }, error: null };
  }
}

export class LocalDbClient {
  storage = new LocalStorageClient();
  auth = new LocalAuthClient();

  from(table: string): LocalQueryBuilder {
    return new LocalQueryBuilder(table);
  }
}

export function createLocalDbClient(): LocalDbClient {
  return new LocalDbClient();
}
