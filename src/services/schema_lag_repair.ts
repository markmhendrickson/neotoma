/**
 * Schema lag repair service — fixes raw_fragments rows that were misrouted
 * due to the schema-projection-lag bug (issue #142).
 *
 * Root cause: register() with activate:true did not deactivate prior active
 * schema versions, so new fields were classified as unknown and written to
 * raw_fragments instead of observations. Fixed in v0.13.0.
 *
 * This service provides:
 *   - auditEntityType()  — returns misfiled fragment_keys for one entity type
 *   - repairEntityType() — promotes misfiled fragments to observations
 *   - auditAll()         — audit all entity types in raw_fragments
 *   - repairAll()        — repair all affected entity types
 *
 * Every observation created here carries a _migration_run_id sentinel in its
 * fields JSON so the run is fully rollback-safe via rollbackRun().
 */

import { createHash } from "node:crypto";
import { db } from "../db.js";
import { schemaRegistry } from "./schema_registry.js";
import { observationReducer } from "../reducers/observation_reducer.js";
import {
  prepareEntitySnapshotWithEmbedding,
  upsertEntitySnapshotWithEmbedding,
} from "./entity_snapshot_embedding.js";
import { logger } from "../utils/logger.js";

const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000000";
const BATCH_SIZE = 100;

export interface RepairAuditResult {
  entity_type: string;
  user_id: string | null;
  misfiled_fields: string[];
  fragment_count: number;
}

export interface RepairRunResult {
  run_id: string;
  repaired_entity_types: number;
  inserted_observations: number;
  recomputed_snapshots: number;
  errors: string[];
}

export interface RollbackResult {
  run_id: string;
  deleted_observations: number;
  recomputed_snapshots: number;
}

/** Deterministic observation id: SHA-256(entity_id:run_id) as UUID-shaped hex. */
function deterministicObsId(entityId: string, runId: string): string {
  const hash = createHash("sha256").update(`${entityId}:${runId}`).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-");
}

function userIdQuery(
  query: ReturnType<typeof db.from>,
  userId: string | null
): ReturnType<typeof db.from> {
  if (userId === null || userId === DEFAULT_USER_ID) {
    return (query as any).or(`user_id.is.null,user_id.eq.${DEFAULT_USER_ID}`);
  }
  return (query as any).eq("user_id", userId);
}

/** Returns misfiled fragment_keys for one entity type — fragments whose key is
 *  now a declared field in the active schema. */
export async function auditEntityType(
  entityType: string,
  userId: string | null = null
): Promise<RepairAuditResult | null> {
  const schema = await schemaRegistry.loadActiveSchema(entityType, userId ?? undefined);
  if (!schema) return null;

  const declaredFields = new Set(Object.keys(schema.schema_definition.fields ?? {}));
  if (declaredFields.size === 0) return null;

  let query = db
    .from("raw_fragments")
    .select("fragment_key, frequency_count, fragment_envelope")
    .eq("entity_type", entityType);
  query = userIdQuery(query, userId) as any;

  const { data: fragments } = await (query as any);
  if (!fragments || fragments.length === 0) return null;

  const misfiled = (fragments as any[]).filter(
    (f) => f.fragment_envelope?.reason === "unknown_field" && declaredFields.has(f.fragment_key)
  );
  if (misfiled.length === 0) return null;

  const misfiledFields = [...new Set(misfiled.map((f: any) => f.fragment_key as string))].sort();
  const fragmentCount = misfiled.reduce((s: number, f: any) => s + (f.frequency_count ?? 1), 0);

  return { entity_type: entityType, user_id: userId, misfiled_fields: misfiledFields, fragment_count: fragmentCount };
}

/** Audit all entity types present in raw_fragments. */
export async function auditAll(): Promise<RepairAuditResult[]> {
  const { data: combos } = await db
    .from("raw_fragments")
    .select("entity_type, user_id")
    .not("fragment_envelope", "is", null);

  if (!combos || combos.length === 0) return [];

  const seen = new Set<string>();
  const pairs: Array<{ entity_type: string; user_id: string | null }> = [];
  for (const row of combos as any[]) {
    const key = `${row.entity_type}|${row.user_id ?? "null"}`;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push({ entity_type: row.entity_type, user_id: row.user_id ?? null });
    }
  }

  const results: RepairAuditResult[] = [];
  for (const { entity_type, user_id } of pairs) {
    const r = await auditEntityType(entity_type, user_id);
    if (r) results.push(r);
  }
  return results;
}

/** Promote misfiled raw_fragments to observations for one entity type.
 *  Every observation created carries _migration_run_id for rollback. */
export async function repairEntityType(
  entityType: string,
  userId: string | null,
  runId: string,
  fieldNames: string[]
): Promise<{ inserted: number; recomputed: number; errors: string[] }> {
  let inserted = 0;
  let recomputed = 0;
  const errors: string[] = [];

  const schema = await schemaRegistry.loadActiveSchema(entityType, userId ?? undefined);
  if (!schema) return { inserted, recomputed, errors: [`No active schema for ${entityType}`] };

  // Fetch full fragment rows.
  let fragQuery = db
    .from("raw_fragments")
    .select("*")
    .eq("entity_type", entityType)
    .in("fragment_key", fieldNames);
  fragQuery = userIdQuery(fragQuery, userId) as any;

  const { data: allFragments } = await (fragQuery as any);
  if (!allFragments) return { inserted, recomputed, errors };

  const fragments = (allFragments as any[]).filter(
    (f) => f.fragment_envelope?.reason === "unknown_field"
  );

  // Group by entity_id or source+interpretation.
  const groups = new Map<
    string,
    { entityId: string | null; sourceId: string | null; interpId: string | null; userId: string | null; fields: Record<string, unknown> }
  >();

  for (const frag of fragments) {
    const groupKey = frag.entity_id
      ? `eid:${frag.entity_id}`
      : `src:${frag.source_id ?? "null"}:${frag.interpretation_id ?? "null"}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        entityId: frag.entity_id ?? null,
        sourceId: frag.source_id ?? null,
        interpId: frag.interpretation_id ?? null,
        userId: frag.user_id ?? null,
        fields: {},
      });
    }
    groups.get(groupKey)!.fields[frag.fragment_key] = frag.fragment_value;
  }

  // Resolve entity_id for source-keyed groups.
  for (const [key, group] of groups) {
    if (group.entityId) continue;
    if (!group.sourceId) { groups.delete(key); continue; }

    let obsQ = db
      .from("observations")
      .select("entity_id")
      .eq("source_id", group.sourceId)
      .eq("entity_type", entityType);

    if (group.interpId) {
      obsQ = (obsQ as any).eq("interpretation_id", group.interpId);
    } else {
      obsQ = (obsQ as any).is("interpretation_id", null);
    }

    const { data: existing } = await (obsQ as any);
    const ids = new Set(
      (existing ?? []).map((o: any) => o.entity_id).filter((id: unknown): id is string => typeof id === "string")
    );

    if (ids.size === 1) {
      group.entityId = Array.from(ids)[0] as string;
    } else {
      groups.delete(key);
    }
  }

  // Insert observations.
  const affectedEntityIds = new Set<string>();

  for (const group of groups.values()) {
    if (!group.entityId || Object.keys(group.fields).length === 0) continue;

    const fieldsWithSentinel = { ...group.fields, _migration_run_id: runId };

    const { error: insErr } = await db.from("observations").insert({
      id: deterministicObsId(group.entityId, runId),
      entity_id: group.entityId,
      entity_type: entityType,
      schema_version: schema.schema_version,
      source_id: group.sourceId,
      interpretation_id: group.interpId,
      observed_at: new Date().toISOString(),
      specificity_score: 0.8,
      source_priority: 0,
      fields: fieldsWithSentinel,
      user_id: group.userId ?? DEFAULT_USER_ID,
    });

    if (insErr) {
      if ((insErr as any).code === "23505") continue; // already migrated — idempotent
      errors.push(`Insert failed for ${group.entityId}: ${insErr.message}`);
      continue;
    }

    affectedEntityIds.add(group.entityId);
    inserted++;
  }

  // Recompute snapshots.
  for (const entityId of affectedEntityIds) {
    try {
      const { data: allObs } = await db
        .from("observations")
        .select("*")
        .eq("entity_id", entityId)
        .order("observed_at", { ascending: false });

      if (!allObs || allObs.length === 0) continue;

      const snapshot = await observationReducer.computeSnapshot(entityId, allObs as any);
      if (!snapshot) continue;

      const row = await prepareEntitySnapshotWithEmbedding({
        entity_id: snapshot.entity_id,
        entity_type: snapshot.entity_type,
        schema_version: snapshot.schema_version,
        snapshot: snapshot.snapshot,
        computed_at: snapshot.computed_at,
        observation_count: snapshot.observation_count,
        last_observation_at: snapshot.last_observation_at,
        provenance: snapshot.provenance,
        user_id: snapshot.user_id,
      });
      await upsertEntitySnapshotWithEmbedding(row);
      recomputed++;
    } catch (err: any) {
      errors.push(`Snapshot recompute failed for ${entityId}: ${err.message}`);
    }
  }

  return { inserted, recomputed, errors };
}

/** Repair all affected entity types. Returns a run_id usable for rollback. */
export async function repairAll(
  filterEntityTypes?: string[]
): Promise<RepairRunResult> {
  const runId = `schema_lag_${new Date().toISOString()}`;
  let repairedEntityTypes = 0;
  let insertedObservations = 0;
  let recomputedSnapshots = 0;
  const errors: string[] = [];

  const hits = await auditAll();
  const filtered = filterEntityTypes
    ? hits.filter((h) => filterEntityTypes.includes(h.entity_type))
    : hits;

  for (const hit of filtered) {
    const { inserted, recomputed, errors: errs } = await repairEntityType(
      hit.entity_type,
      hit.user_id,
      runId,
      hit.misfiled_fields
    );
    if (inserted > 0 || recomputed > 0) repairedEntityTypes++;
    insertedObservations += inserted;
    recomputedSnapshots += recomputed;
    errors.push(...errs);
  }

  return { run_id: runId, repaired_entity_types: repairedEntityTypes, inserted_observations: insertedObservations, recomputed_snapshots: recomputedSnapshots, errors };
}

/** Roll back a prior repair run by deleting its sentinel observations and
 *  recomputing affected snapshots. */
export async function rollbackRun(runId: string): Promise<RollbackResult> {
  // Use ilike on raw fields JSON to find sentinel rows, then re-filter in JS.
  const { data: candidates } = await db
    .from("observations")
    .select("id, entity_id, entity_type, user_id, fields")
    .ilike("fields", `%${runId}%`);

  const migrated = (candidates ?? []).filter((o: any) => {
    try {
      const fields = typeof o.fields === "string" ? JSON.parse(o.fields) : o.fields;
      return fields?._migration_run_id === runId;
    } catch { return false; }
  });

  if (migrated.length === 0) {
    return { run_id: runId, deleted_observations: 0, recomputed_snapshots: 0 };
  }

  const affectedEntities = new Map<string, { entity_type: string; user_id: string }>();
  for (const obs of migrated as any[]) {
    affectedEntities.set(obs.entity_id, { entity_type: obs.entity_type, user_id: obs.user_id });
  }

  // Delete in batches.
  const ids = (migrated as any[]).map((o) => o.id);
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    await db.from("observations").delete().in("id", ids.slice(i, i + BATCH_SIZE));
  }

  // Recompute snapshots.
  let recomputed = 0;
  for (const [entityId] of affectedEntities) {
    try {
      const { data: allObs } = await db
        .from("observations")
        .select("*")
        .eq("entity_id", entityId)
        .order("observed_at", { ascending: false });

      if (!allObs || allObs.length === 0) continue;

      const snapshot = await observationReducer.computeSnapshot(entityId, allObs as any);
      if (!snapshot) continue;

      const row = await prepareEntitySnapshotWithEmbedding({
        entity_id: snapshot.entity_id,
        entity_type: snapshot.entity_type,
        schema_version: snapshot.schema_version,
        snapshot: snapshot.snapshot,
        computed_at: snapshot.computed_at,
        observation_count: snapshot.observation_count,
        last_observation_at: snapshot.last_observation_at,
        provenance: snapshot.provenance,
        user_id: snapshot.user_id,
      });
      await upsertEntitySnapshotWithEmbedding(row);
      recomputed++;
    } catch (err: any) {
      logger.warn(`[SCHEMA_LAG_REPAIR] Snapshot recompute failed during rollback for ${entityId}: ${err.message}`);
    }
  }

  return { run_id: runId, deleted_observations: ids.length, recomputed_snapshots: recomputed };
}

/**
 * Queue a background schema-lag repair job for a single entity type.
 * Best-effort — failures are logged but not thrown.
 * Used by the store path to lazily trigger repair when misfiled fragments are detected.
 */
export async function queueSchemaLagRepair(
  entityType: string,
  userId: string | null
): Promise<void> {
  try {
    const normalizedUserId = userId === DEFAULT_USER_ID ? null : userId;
    const jobId = createHash("sha256")
      .update(`schema_lag_repair:${entityType}:${normalizedUserId ?? "null"}`)
      .digest("hex")
      .slice(0, 32);

    // Check if a pending/processing job already exists for this entity type.
    let q = db
      .from("auto_enhancement_queue")
      .select("id, status")
      .eq("entity_type", entityType)
      .eq("job_type", "schema_lag_repair");
    q = normalizedUserId ? (q as any).eq("user_id", normalizedUserId) : (q as any).is("user_id", null);

    const { data: existing } = await (q as any).maybeSingle();

    if (existing && ["pending", "processing"].includes(existing.status)) return; // already queued

    if (existing) {
      await db
        .from("auto_enhancement_queue")
        .update({ status: "pending", updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await db.from("auto_enhancement_queue").insert({
        id: jobId,
        entity_type: entityType,
        fragment_key: "__schema_lag_repair__",
        user_id: normalizedUserId,
        job_type: "schema_lag_repair",
        status: "pending",
        priority: 50, // higher priority than default auto-enhance (100)
        retry_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  } catch (err: any) {
    logger.warn(`[SCHEMA_LAG_REPAIR] Failed to queue repair for ${entityType}: ${err.message}`);
  }
}
