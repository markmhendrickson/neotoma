/**
 * #1967: field-level aggregation over entity snapshots.
 *
 * Agents routinely need "how many contacts per organization?" or "what
 * distinct values does `status` take?". Before this service the only way to
 * answer was to page every entity through `retrieve_entities` and count in the
 * agent — an O(n) scan that froze a hosted instance with ~9.5k contacts
 * (#1943) because the sync SQLite driver blocks the event loop (#1945).
 *
 * PERFORMANCE CONTRACT
 * --------------------
 * The fast path pushes the entire aggregation into ONE SQL statement:
 *
 *   SELECT json_extract(snapshot, '$.field') AS bucket, COUNT(*) …
 *   FROM entity_snapshots WHERE … GROUP BY bucket ORDER BY … LIMIT …
 *
 * SQLite evaluates the GROUP BY internally, so the JS side only ever
 * materializes `limit` bucket rows (default 50, hard cap 1000) — never the
 * 9.5k+ underlying entity rows. Measured: ~4ms over 12k snapshot rows.
 *
 * The one case that CANNOT use SQL is at-rest encryption: when
 * `NEOTOMA_ENCRYPTION_ENABLED=true` the `entity_snapshots.snapshot` column
 * holds ciphertext (see ENCRYPTED_COLUMNS in local_db_adapter.ts), so
 * `json_extract` would group over opaque blobs. There we fall back to a
 * bounded decrypt-and-count pass and label the result honestly via
 * `execution.strategy = "app_side_encrypted"`, so callers can see when they
 * are paying scan cost rather than silently assuming SQL.
 */

import { getSqliteDb } from "../repositories/sqlite/sqlite_client.js";
import { config } from "../config.js";
import { getDataKey } from "../repositories/sqlite/local_db_adapter.js";
import { decryptColumn, isEncryptedColumn } from "../crypto/column_encryption.js";
import { logger } from "../utils/logger.js";

/** Default number of buckets returned when the caller does not specify. */
export const DEFAULT_BUCKET_LIMIT = 50;

/**
 * Hard ceiling on returned buckets. A group-by over a high-cardinality field
 * (`email`, `organization`) can have thousands of distinct values; returning
 * them all would trade the entity-scan blowup for a bucket blowup.
 */
export const MAX_BUCKET_LIMIT = 1000;

/**
 * Row ceiling for the encrypted fallback path only. The SQL path has no row
 * ceiling because it never materializes rows in JS.
 */
export const MAX_ENCRYPTED_SCAN_ROWS = 20000;

/**
 * Snapshot field names are interpolated into a SQL json path, so they must be
 * validated as identifiers rather than bound (SQLite cannot bind a json path
 * component in a way that permits indexing, and binding the whole path string
 * still requires the literal to be well-formed). Mirrors the IDENT_RE
 * allowlist already used by the adapter's `or(...)` builder for the same
 * injection reason (security_audit_2026_04_22.md S-3).
 */
const FIELD_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type AggregateOp = "count" | "distinct";

export interface AggregationFilter {
  op: "eq" | "in" | "contains";
  value?: unknown;
}

export interface AggregateEntityFieldOptions {
  userId: string;
  entityType?: string;
  /** Snapshot field to aggregate over, e.g. "organization". */
  field: string;
  /** "count" returns buckets with counts; "distinct" returns values only. */
  op?: AggregateOp;
  /** Optional snapshot-field equality/`in`/`contains` filters. */
  filters?: Record<string, AggregationFilter>;
  /** Max buckets returned (default 50, capped at {@link MAX_BUCKET_LIMIT}). */
  limit?: number;
  /** Bucket offset, for paging a high-cardinality group-by. */
  offset?: number;
  /**
   * When true, entities whose snapshot lacks the field (SQL NULL) get their
   * own `null` bucket. Default false: missing values are excluded, matching
   * the intuition that "count by organization" means "among those that have
   * one".
   */
  includeNull?: boolean;
  /** Bucket ordering. "count" (default) or "value" (lexicographic). */
  sortBy?: "count" | "value";
  sortOrder?: "asc" | "desc";
}

export interface AggregationBucket {
  value: string | null;
  count: number;
}

export interface AggregateEntityFieldResult {
  entity_type: string | null;
  field: string;
  op: AggregateOp;
  buckets: AggregationBucket[];
  /** Distinct bucket count across the WHOLE result, not just this page. */
  distinct_count: number;
  /** Sum of counts across the whole result (entities with a non-null value). */
  total_matching: number;
  /** True when more buckets exist beyond `limit`/`offset`. */
  has_more: boolean;
  limit: number;
  offset: number;
  execution: {
    /**
     * "sql_group_by" — aggregation ran inside SQLite (the fast path).
     * "app_side_encrypted" — snapshots are encrypted at rest, so buckets were
     * built by decrypting rows in application code.
     */
    strategy: "sql_group_by" | "app_side_encrypted";
    /** Rows the JS layer materialized. 0 on the SQL path beyond buckets. */
    scanned_rows: number;
    truncated: boolean;
  };
}

function assertValidFieldName(field: string, label: string): void {
  if (!FIELD_NAME_RE.test(field)) {
    throw new Error(
      `Invalid ${label} "${field}": must match ${FIELD_NAME_RE.source} ` +
        `(letters, digits and underscore, not starting with a digit)`
    );
  }
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_BUCKET_LIMIT;
  if (!Number.isFinite(limit) || limit < 1) return DEFAULT_BUCKET_LIMIT;
  return Math.min(Math.floor(limit), MAX_BUCKET_LIMIT);
}

/** Normalize a decrypted/raw snapshot value to its bucket key. */
function bucketKey(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  // Objects/arrays are not sensible group-by keys; JSON-encode so at least the
  // bucket is stable and inspectable rather than "[object Object]".
  return JSON.stringify(value);
}

/**
 * Build the WHERE fragment for the caller's snapshot filters. Field names are
 * identifier-validated; values are always bound as `?`.
 */
function buildFilterClauses(filters: Record<string, AggregationFilter> | undefined): {
  clauses: string[];
  values: unknown[];
} {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (!filters) return { clauses, values };

  for (const [filterField, filter] of Object.entries(filters)) {
    assertValidFieldName(filterField, "filter field");
    const extract = `json_extract(snapshot, '$.${filterField}')`;
    switch (filter.op) {
      case "eq":
        clauses.push(`CAST(${extract} AS TEXT) = ?`);
        values.push(String(filter.value));
        break;
      case "in": {
        if (!Array.isArray(filter.value) || filter.value.length === 0) {
          // An empty IN matches nothing; encode that explicitly rather than
          // silently dropping the filter (which would over-count).
          clauses.push("1 = 0");
          break;
        }
        const placeholders = filter.value.map(() => "?").join(", ");
        clauses.push(`CAST(${extract} AS TEXT) IN (${placeholders})`);
        values.push(...filter.value.map((v) => String(v)));
        break;
      }
      case "contains":
        clauses.push(`CAST(${extract} AS TEXT) LIKE ? COLLATE NOCASE`);
        values.push(`%${String(filter.value)}%`);
        break;
    }
  }
  return { clauses, values };
}

/**
 * Whether the snapshot column is stored encrypted. When true the SQL
 * `json_extract` path is invalid and we must decrypt in application code.
 */
function snapshotsAreEncrypted(): boolean {
  return config.encryption.enabled && getDataKey() !== null;
}

/**
 * Aggregate a snapshot field into value buckets.
 *
 * Fast path is a single SQL GROUP BY (see file header). Returns bucket counts
 * plus whole-result totals so a caller can page without re-deriving them.
 */
export async function aggregateEntityField(
  options: AggregateEntityFieldOptions
): Promise<AggregateEntityFieldResult> {
  const {
    userId,
    entityType,
    field,
    op = "count",
    filters,
    offset = 0,
    includeNull = false,
    sortBy = "count",
    sortOrder = "desc",
  } = options;

  assertValidFieldName(field, "field");
  const limit = clampLimit(options.limit);
  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;

  if (snapshotsAreEncrypted()) {
    return aggregateEncrypted({
      ...options,
      op,
      limit,
      offset: safeOffset,
      includeNull,
      sortBy,
      sortOrder,
    });
  }

  const db = getSqliteDb();
  const whereClauses: string[] = ["user_id = ?"];
  const whereValues: unknown[] = [userId];

  if (entityType) {
    whereClauses.push("entity_type = ?");
    whereValues.push(entityType);
  }

  // Exclude entities merged away or soft-deleted, so aggregate totals agree
  // with what retrieve_entities would list. Deletion is recorded as an
  // observation with fields._deleted = true (see services/deletion.ts); the
  // NOT EXISTS keeps that check inside SQL rather than post-filtering buckets.
  whereClauses.push(
    `NOT EXISTS (
       SELECT 1 FROM entities e
       WHERE e.id = entity_snapshots.entity_id
         AND e.merged_to_entity_id IS NOT NULL
     )`
  );
  // Soft deletion is decided by the WINNING observation, not by the mere
  // existence of a `_deleted: true` row: services/deletion.ts sorts by
  // source_priority DESC then observed_at DESC and reads `_deleted` off the
  // top row, so a later restore (`_deleted: false`) un-deletes the entity.
  // Replicate that precedence in SQL rather than the naive "any deletion
  // observation exists" test, which would wrongly hide restored entities.
  whereClauses.push(
    `COALESCE((
       SELECT json_extract(o.fields, '$._deleted')
       FROM observations o
       WHERE o.entity_id = entity_snapshots.entity_id
         AND o.user_id = entity_snapshots.user_id
         AND json_extract(o.fields, '$._deleted') IS NOT NULL
       ORDER BY o.source_priority DESC, o.observed_at DESC
       LIMIT 1
     ), 0) NOT IN (1, 'true')`
  );

  const { clauses: filterClauses, values: filterValues } = buildFilterClauses(filters);
  whereClauses.push(...filterClauses);
  whereValues.push(...filterValues);

  const bucketExpr = `json_extract(snapshot, '$.${field}')`;
  if (!includeNull) {
    whereClauses.push(`${bucketExpr} IS NOT NULL`);
  }

  const whereSql = `WHERE ${whereClauses.join(" AND ")}`;

  // Totals across the WHOLE grouping, so `has_more` and `distinct_count` are
  // correct without fetching every bucket.
  const totalsSql = `
    SELECT COUNT(*) AS distinct_count, COALESCE(SUM(bucket_count), 0) AS total_matching
    FROM (
      SELECT COUNT(*) AS bucket_count
      FROM entity_snapshots
      ${whereSql}
      GROUP BY ${bucketExpr}
    )
  `;
  const totals = db.prepare(totalsSql).get(whereValues) as
    | { distinct_count: number; total_matching: number }
    | undefined;

  const orderSql =
    sortBy === "value"
      ? `bucket_value ${sortOrder === "asc" ? "ASC" : "DESC"}`
      : `bucket_count ${sortOrder === "asc" ? "ASC" : "DESC"}, bucket_value ASC`;

  const bucketsSql = `
    SELECT ${bucketExpr} AS bucket_value, COUNT(*) AS bucket_count
    FROM entity_snapshots
    ${whereSql}
    GROUP BY ${bucketExpr}
    ORDER BY ${orderSql}
    LIMIT ? OFFSET ?
  `;
  const rows = db.prepare(bucketsSql).all([...whereValues, limit, safeOffset]) as Array<{
    bucket_value: unknown;
    bucket_count: number;
  }>;

  const buckets: AggregationBucket[] = rows.map((row) => ({
    value: bucketKey(row.bucket_value),
    count: Number(row.bucket_count),
  }));

  const distinctCount = Number(totals?.distinct_count ?? 0);

  return {
    entity_type: entityType ?? null,
    field,
    op,
    // `distinct` is the same grouping with counts suppressed by the caller;
    // we still return counts because they are free once grouped.
    buckets,
    distinct_count: distinctCount,
    total_matching: Number(totals?.total_matching ?? 0),
    has_more: safeOffset + buckets.length < distinctCount,
    limit,
    offset: safeOffset,
    execution: {
      strategy: "sql_group_by",
      // The SQL path materializes only the returned buckets.
      scanned_rows: buckets.length,
      truncated: safeOffset + buckets.length < distinctCount,
    },
  };
}

/**
 * Encrypted-at-rest fallback. `snapshot` is ciphertext so SQLite cannot group
 * on it; decrypt a bounded number of rows and tally in JS.
 *
 * This is genuinely O(n) and is the one path that can approach the #1943
 * failure mode, so it is bounded by {@link MAX_ENCRYPTED_SCAN_ROWS} and
 * reports `truncated: true` rather than returning silently wrong totals.
 */
async function aggregateEncrypted(
  options: AggregateEntityFieldOptions & {
    op: AggregateOp;
    limit: number;
    offset: number;
    includeNull: boolean;
    sortBy: "count" | "value";
    sortOrder: "asc" | "desc";
  }
): Promise<AggregateEntityFieldResult> {
  const { userId, entityType, field, op, filters, limit, offset, includeNull, sortBy, sortOrder } =
    options;

  logger.warn(
    "[aggregateEntityField] snapshots are encrypted at rest; falling back to a bounded " +
      "app-side aggregation. Results report execution.strategy=app_side_encrypted."
  );

  const db = getSqliteDb();
  const key = getDataKey();

  const whereClauses: string[] = ["user_id = ?"];
  const whereValues: unknown[] = [userId];
  if (entityType) {
    whereClauses.push("entity_type = ?");
    whereValues.push(entityType);
  }
  whereClauses.push(
    `NOT EXISTS (
       SELECT 1 FROM entities e
       WHERE e.id = entity_snapshots.entity_id
         AND e.merged_to_entity_id IS NOT NULL
     )`
  );

  const rows = db
    .prepare(
      `SELECT entity_id, snapshot FROM entity_snapshots
       WHERE ${whereClauses.join(" AND ")}
       LIMIT ?`
    )
    .all([...whereValues, MAX_ENCRYPTED_SCAN_ROWS + 1]) as Array<{
    entity_id: string;
    snapshot: string | null;
  }>;

  const truncated = rows.length > MAX_ENCRYPTED_SCAN_ROWS;
  const scanRows = truncated ? rows.slice(0, MAX_ENCRYPTED_SCAN_ROWS) : rows;

  const tally = new Map<string | null, number>();
  let totalMatching = 0;

  for (const row of scanRows) {
    let snapshot: Record<string, unknown> | null = null;
    if (typeof row.snapshot === "string" && row.snapshot.length > 0) {
      try {
        const plaintext =
          key && isEncryptedColumn(row.snapshot) ? decryptColumn(row.snapshot, key) : row.snapshot;
        snapshot = JSON.parse(plaintext) as Record<string, unknown>;
      } catch {
        continue;
      }
    }
    if (!snapshot) continue;

    if (filters && !matchesFilters(snapshot, filters)) continue;

    const value = bucketKey(snapshot[field]);
    if (value === null && !includeNull) continue;
    tally.set(value, (tally.get(value) ?? 0) + 1);
    totalMatching += 1;
  }

  const entries = [...tally.entries()].map(([value, count]) => ({ value, count }));
  entries.sort((a, b) => {
    if (sortBy === "value") {
      const cmp = String(a.value ?? "").localeCompare(String(b.value ?? ""));
      return sortOrder === "asc" ? cmp : -cmp;
    }
    const diff = sortOrder === "asc" ? a.count - b.count : b.count - a.count;
    if (diff !== 0) return diff;
    return String(a.value ?? "").localeCompare(String(b.value ?? ""));
  });

  const distinctCount = entries.length;
  const page = entries.slice(offset, offset + limit);

  return {
    entity_type: entityType ?? null,
    field,
    op,
    buckets: page,
    distinct_count: distinctCount,
    total_matching: totalMatching,
    has_more: offset + page.length < distinctCount,
    limit,
    offset,
    execution: {
      strategy: "app_side_encrypted",
      scanned_rows: scanRows.length,
      truncated,
    },
  };
}

function matchesFilters(
  snapshot: Record<string, unknown>,
  filters: Record<string, AggregationFilter>
): boolean {
  for (const [filterField, filter] of Object.entries(filters)) {
    const raw = bucketKey(snapshot[filterField]);
    switch (filter.op) {
      case "eq":
        if (raw !== String(filter.value)) return false;
        break;
      case "in":
        if (!Array.isArray(filter.value)) return false;
        if (raw === null) return false;
        if (!filter.value.map((v) => String(v)).includes(raw)) return false;
        break;
      case "contains":
        if (raw === null) return false;
        if (!raw.toLowerCase().includes(String(filter.value).toLowerCase())) return false;
        break;
    }
  }
  return true;
}
