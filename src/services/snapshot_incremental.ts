/**
 * Incremental snapshot update for a correction (Domain Layer)
 *
 * A full snapshot rebuild reads and reduces every observation of an entity.
 * A correction runs inside a write transaction, so that rebuild holds the
 * process-wide write gate for a time that grows with the entity's history.
 *
 * A correction is the one write whose effect on the snapshot can be stated
 * without the history: it carries exactly one field, and a correction that is
 * strictly newer than every stored observation is that field's winner under
 * every non-keyed merge strategy (the "corrections win" rule, with recency
 * deciding among corrections; see correction_identity.ts). Every other field,
 * and the entity's visibility, are unchanged by it. So the new snapshot is the
 * stored snapshot with that one field re-reduced from the correction alone,
 * the count advanced by one and the last observation time moved to it.
 *
 * That is only true when the stored snapshot really is the full reduction of
 * the stored observations under the current schema. This module proves that
 * cheaply, or declines:
 *
 *   - A certificate, kept in process memory, records the digest of the last
 *     snapshot row this process computed for the entity (by full rebuild or by
 *     this path) and the identity of the schema it was reduced under. The
 *     stored row must digest the same: any other writer that replaced it, a
 *     rolled-back transaction, or a process restart (which also covers a
 *     reducer code change) makes the next correction rebuild in full.
 *   - The schema identity is a content hash of the schema entry, not its
 *     version string, so a same-version schema change is detected.
 *   - The observation count and the latest `observed_at` of the entity's rows,
 *     read from the entity index without reading row bodies, must equal the
 *     stored snapshot's. An observation added, deleted, merged in or moved out
 *     without a snapshot rebuild changes one of them.
 *   - The correction must be strictly newer, by time and by text order, than
 *     the latest stored observation; it then sorts first in both the reducer's
 *     order and the database's `observed_at DESC` order.
 *   - The field must not be the lifecycle marker or any other reserved
 *     underscore field, must carry a value, and must not use
 *     `merge_array_by_key` (corrections combine there by key, which needs the
 *     per-item history).
 *
 * Whenever a check fails the caller falls back to the full rebuild, which
 * re-certifies the entity. The result is deterministic either way: the same
 * snapshot a full rebuild produces (tests/unit/snapshot_incremental_correction
 * compares the two over randomized histories).
 *
 * Accepted residual: an in-place rewrite of an observation's `fields` keeps
 * count and time. The only such writer is GDPR cryptographic erasure, which
 * clears this process's certificates for the user; an erasure run by another
 * process against the same database is not seen here.
 */

import { createHash } from "node:crypto";
import { db } from "../db.js";
import { getDb } from "../repositories/db/connection.js";
import { codeDefinedSchemaEntry, observationReducer } from "../reducers/observation_reducer.js";
import type { EntitySnapshot, Observation } from "../reducers/observation_reducer.js";
import type { SchemaRegistryEntry } from "./schema_registry.js";
import { stableSerialize } from "./stable_serialize.js";
import { isCorrectionObservation } from "./correction_identity.js";
import type { ObservationInsertRow } from "./observation_insert.js";

/** Bound on remembered certificates; the oldest is dropped beyond it. */
export const MAX_SNAPSHOT_CERTIFICATES = 10_000;

/** Merge strategies under which a strictly newest correction alone decides the field. */
const SOLE_WINNER_STRATEGIES = new Set([
  "last_write",
  "highest_priority",
  "most_specific",
  "merge_array",
]);

/** The snapshot columns a reduction determines; derived columns are excluded. */
const DIGEST_COLUMNS = [
  "entity_id",
  "entity_type",
  "schema_version",
  "snapshot",
  "provenance",
  "computed_at",
  "observation_count",
  "last_observation_at",
  "user_id",
] as const;

interface SnapshotCertificate {
  digest: string;
  schemaIdentity: string;
}

const certificates = new Map<string, SnapshotCertificate>();

/** @internal Counters for tests and diagnosis. */
export const snapshotIncrementalStats: {
  applied: number;
  fallbacks: Record<string, number>;
} = { applied: 0, fallbacks: {} };

/** @internal */
export function resetSnapshotIncrementalStats(): void {
  snapshotIncrementalStats.applied = 0;
  snapshotIncrementalStats.fallbacks = {};
}

function certificateKey(entityId: string, userId: string): string {
  return `${userId}\u0000${entityId}`;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Content identity of the schema entry a reduction ran under. */
export function schemaIdentity(entry: SchemaRegistryEntry): string {
  return sha256(
    stableSerialize({
      id: entry.id ?? "",
      entity_type: entry.entity_type,
      schema_version: entry.schema_version,
      schema_definition: entry.schema_definition,
      reducer_config: entry.reducer_config,
      user_id: entry.user_id ?? null,
      scope: entry.scope ?? null,
    })
  );
}

/**
 * Digest of a snapshot row's reduced columns. Taken through a JSON round trip
 * so a row digests the same when written (an object) and when read back.
 */
export function snapshotRowDigest(row: Record<string, unknown>): string {
  const projected: Record<string, unknown> = {};
  for (const column of DIGEST_COLUMNS) projected[column] = row[column] ?? null;
  return sha256(stableSerialize(JSON.parse(JSON.stringify(projected))));
}

/**
 * Record that `row` is the full reduction of the entity's stored observations
 * under `schema`. Called after a full rebuild and after an incremental update.
 */
export function certifySnapshot(
  row: EntitySnapshot | Record<string, unknown>,
  schema: SchemaRegistryEntry
): void {
  const record = row as Record<string, unknown>;
  const key = certificateKey(String(record.entity_id), String(record.user_id));
  certificates.delete(key);
  certificates.set(key, {
    digest: snapshotRowDigest(record),
    schemaIdentity: schemaIdentity(schema),
  });
  if (certificates.size > MAX_SNAPSHOT_CERTIFICATES) {
    const oldest = certificates.keys().next().value;
    if (oldest !== undefined) certificates.delete(oldest);
  }
}

/** Forget certificates (all, or one user's), forcing full rebuilds next time. */
export function forgetSnapshotCertificates(filter: { userId?: string } = {}): void {
  if (filter.userId === undefined) {
    certificates.clear();
    return;
  }
  const prefix = `${filter.userId}\u0000`;
  for (const key of [...certificates.keys()]) if (key.startsWith(prefix)) certificates.delete(key);
}

export interface IncrementalCorrectionPlan {
  readonly stored: Record<string, unknown>;
  readonly schema: SchemaRegistryEntry;
  /** The registry entry, when the schema came from the registry (timeline events use it). */
  readonly registered: SchemaRegistryEntry | null;
  readonly field: string;
}

function decline(reason: string): null {
  snapshotIncrementalStats.fallbacks[reason] =
    (snapshotIncrementalStats.fallbacks[reason] ?? 0) + 1;
  return null;
}

function hasLifecycleColumns(row: Record<string, unknown>): boolean {
  return (
    (row.entity_lifecycle_kind ?? null) !== null ||
    (row.entity_lifecycle_sequence ?? null) !== null ||
    (row.entity_lifecycle_target_id ?? null) !== null
  );
}

/**
 * Decide, before the correction row is inserted and inside the same write
 * transaction, whether the snapshot can be updated from the row alone.
 * Returns null (and counts the reason) when it cannot.
 */
export async function planIncrementalCorrection(params: {
  entityId: string;
  entityType: string;
  userId: string;
  field: string;
  row: ObservationInsertRow;
}): Promise<IncrementalCorrectionPlan | null> {
  // The plan only reads. A failed read declines rather than failing the
  // correction: the full rebuild then runs exactly as it did before this path.
  try {
    return await planOrDecline(params);
  } catch {
    return decline("error");
  }
}

async function planOrDecline(params: {
  entityId: string;
  entityType: string;
  userId: string;
  field: string;
  row: ObservationInsertRow;
}): Promise<IncrementalCorrectionPlan | null> {
  const { entityId, entityType, userId, field, row } = params;

  if (!isCorrectionObservation(row) || hasLifecycleColumns(row)) return decline("not_correction");
  const fieldNames = Object.keys(row.fields);
  if (fieldNames.length !== 1 || fieldNames[0] !== field) return decline("field_shape");
  if (field.startsWith("_")) return decline("reserved_field");
  if (row.fields[field] === undefined) return decline("field_shape");
  if (row.entity_id !== entityId || row.entity_type !== entityType || row.user_id !== userId)
    return decline("field_shape");

  const certificate = certificates.get(certificateKey(entityId, userId));
  if (!certificate) return decline("no_certificate");

  const { schemaRegistry } = await import("./schema_registry.js");
  const registered = await schemaRegistry.loadActiveSchema(entityType, userId);
  const schema = registered ?? codeDefinedSchemaEntry(entityType);
  if (!schema) return decline("no_schema");
  if (schemaIdentity(schema) !== certificate.schemaIdentity) return decline("schema_changed");
  if (Object.prototype.hasOwnProperty.call(schema.schema_definition.fields, field)) {
    const strategy = schema.reducer_config.merge_policies[field]?.strategy || "last_write";
    if (!SOLE_WINNER_STRATEGIES.has(strategy)) return decline("strategy");
  }

  const { data: stored, error: storedError } = await db
    .from("entity_snapshots")
    .select("*")
    .eq("entity_id", entityId)
    .eq("user_id", userId)
    .maybeSingle();
  if (storedError || !stored) return decline("no_snapshot");
  const snapshotRow = stored as Record<string, unknown>;
  if (
    snapshotRow.entity_type !== entityType ||
    snapshotRow.user_id !== userId ||
    snapshotRow.schema_version !== schema.schema_version ||
    snapshotRowDigest(snapshotRow) !== certificate.digest
  )
    return decline("snapshot_changed");

  const database = await getDb();
  const entityRow = (await database
    .prepare("SELECT user_id, merged_to_entity_id FROM entities WHERE id = ?")
    .get(entityId)) as { user_id: string | null; merged_to_entity_id: string | null } | undefined;
  if (!entityRow || entityRow.user_id !== userId || entityRow.merged_to_entity_id)
    return decline("entity_unavailable");

  // Index-only on idx_observations_entity_id (entity_id, source_priority,
  // observed_at): no row bodies are read. Rows of another owner under this id
  // are counted too, so their presence declines rather than slipping past.
  const history = (await database
    .prepare(
      "SELECT COUNT(*) AS n, MAX(observed_at) AS latest FROM observations WHERE entity_id = ?"
    )
    .get(entityId)) as { n: number; latest: string | null } | undefined;
  const latest = history?.latest ?? null;
  if (
    !history ||
    Number(history.n) !== Number(snapshotRow.observation_count) ||
    latest === null ||
    latest !== snapshotRow.last_observation_at
  )
    return decline("observations_changed");

  const latestMs = Date.parse(latest);
  const rowMs = Date.parse(row.observed_at);
  if (
    !Number.isFinite(latestMs) ||
    !Number.isFinite(rowMs) ||
    !(rowMs > latestMs) ||
    !(row.observed_at > latest)
  )
    return decline("not_strictly_newer");

  return { stored: snapshotRow, schema, registered, field };
}

/**
 * The snapshot after inserting `row`, from the stored one and the row alone.
 * Only valid for a plan {@link planIncrementalCorrection} returned in the same
 * transaction, with the row inserted since.
 */
export function buildIncrementalSnapshot(
  plan: IncrementalCorrectionPlan,
  row: ObservationInsertRow
): EntitySnapshot {
  const stored = plan.stored;
  const snapshot = { ...((stored.snapshot as Record<string, unknown> | null) ?? {}) };
  const provenance = { ...((stored.provenance as Record<string, string> | null) ?? {}) };
  const observation: Observation = {
    id: row.id,
    entity_id: row.entity_id,
    entity_type: row.entity_type,
    schema_version: row.schema_version,
    source_id: row.source_id ?? "",
    interpretation_id: row.interpretation_id,
    observed_at: row.observed_at,
    specificity_score: row.specificity_score,
    source_priority: row.source_priority,
    observation_source: null,
    fields: row.fields,
    created_at: row.observed_at,
    user_id: row.user_id,
  };
  const reduced = observationReducer.reduceFieldFromSoleObservation(
    plan.field,
    observation,
    plan.schema
  );
  if (reduced === null) {
    delete snapshot[plan.field];
    delete provenance[plan.field];
  } else if (reduced !== undefined) {
    snapshot[plan.field] = reduced.value;
    provenance[plan.field] = reduced.source_observation_id;
  }
  snapshotIncrementalStats.applied += 1;
  return {
    entity_id: String(stored.entity_id),
    entity_type: String(stored.entity_type),
    schema_version: plan.schema.schema_version,
    snapshot,
    computed_at: row.observed_at,
    observation_count: Number(stored.observation_count) + 1,
    last_observation_at: row.observed_at,
    provenance,
    user_id: String(stored.user_id),
  };
}
