/**
 * Audit for raw_fragments rows that should have landed in the snapshot
 * but were misrouted due to the schema projection lag bug (issue #142).
 *
 * Root cause: register() with activate:true did not deactivate prior active
 * schema versions, so loadGlobalSchema/.single() returned the old schema and
 * fields added by the version bump were classified as unknown and written to
 * raw_fragments instead of observations.
 *
 * This script:
 *   1. Loads all active schemas.
 *   2. Queries raw_fragments where reason="unknown_field".
 *   3. Reports any fragment_key that is now a declared field in the active schema.
 *   4. Optionally migrates those fields back, stamping each observation with a
 *      _migration_run_id sentinel for clean rollback.
 *   5. Optionally rolls back a prior migration run by deleting its observations
 *      and recomputing affected snapshots.
 *
 * Usage:
 *   tsx scripts/audit_raw_fragments_schema_lag.ts                                    # dry-run
 *   tsx scripts/audit_raw_fragments_schema_lag.ts --migrate                          # migrate all
 *   tsx scripts/audit_raw_fragments_schema_lag.ts --migrate --types task,transaction  # subset
 *   tsx scripts/audit_raw_fragments_schema_lag.ts --rollback <run_id>                # undo
 *
 * The run_id is printed at the start of every --migrate run, e.g.:
 *   migration_run_id: schema_lag_2026-05-15T16:45:00.000Z
 */

import { createHash } from "node:crypto";
import { db } from "../src/db.js";
import { schemaRegistry } from "../src/services/schema_registry.js";
import { observationReducer } from "../src/reducers/observation_reducer.js";
import {
  prepareEntitySnapshotWithEmbedding,
  upsertEntitySnapshotWithEmbedding,
} from "../src/services/entity_snapshot_embedding.js";

const BATCH_SIZE = 100;
const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000000";

const args = process.argv.slice(2);
const MODE: "audit" | "migrate" | "rollback" = args.includes("--migrate")
  ? "migrate"
  : args.includes("--rollback")
    ? "rollback"
    : "audit";
const ROLLBACK_RUN_ID = MODE === "rollback" ? args[args.indexOf("--rollback") + 1] : null;
const ENTITY_TYPE_FILTER: Set<string> | null = (() => {
  const idx = args.indexOf("--types");
  if (idx === -1) return null;
  const val = args[idx + 1];
  return val ? new Set(val.split(",").map((s) => s.trim())) : null;
})();

// Sentinel field: not in any schema, so the reducer silently ignores it during
// snapshot projection. Its sole purpose is to make rollback queries exact.
const MIGRATION_RUN_ID = `schema_lag_${new Date().toISOString()}`;

/**
 * Deterministic observation ID: SHA-256 of (entity_id + run_id), formatted as
 * a UUID-shaped hex string. Same inputs → same ID, so re-running --migrate
 * hits the 23505 unique constraint instead of inserting duplicates.
 */
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

interface FragmentRow {
  id: string;
  entity_id: string | null;
  source_id: string | null;
  interpretation_id: string | null;
  entity_type: string;
  fragment_key: string;
  fragment_value: unknown;
  fragment_envelope: { reason: string } | null;
  user_id: string | null;
  frequency_count: number;
  first_seen: string | null;
  last_seen: string | null;
}

// ─── Rollback ────────────────────────────────────────────────────────────────

async function rollback(runId: string) {
  console.log(`audit_raw_fragments_schema_lag — ROLLBACK\nrun_id: ${runId}\n`);

  // Find all observations created by this migration run. Use ilike on the raw
  // fields column to avoid JSON-path operator quoting differences, then
  // re-filter in JS for an exact sentinel match.
  const { data: candidates, error } = await db
    .from("observations")
    .select("id, entity_id, entity_type, user_id, fields")
    .ilike("fields", `%${runId}%`);

  if (error) {
    console.error("Failed to query migrated observations:", error.message);
    process.exit(1);
  }

  const migrated = (candidates ?? []).filter((o: any) => {
    try {
      const fields = typeof o.fields === "string" ? JSON.parse(o.fields) : o.fields;
      return fields?._migration_run_id === runId;
    } catch { return false; }
  });

  if (migrated.length === 0) {
    console.log("No observations found for that run_id. Nothing to roll back.");
    return;
  }

  console.log(`Found ${migrated.length} observations to delete.\n`);

  // Collect affected entities for snapshot recompute after deletion.
  const affectedEntities = new Map<string, { entity_type: string; user_id: string }>();
  for (const obs of migrated) {
    affectedEntities.set(obs.entity_id, { entity_type: obs.entity_type, user_id: obs.user_id });
  }

  // Delete in batches.
  const ids = migrated.map((o) => o.id);
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const { error: delErr } = await db.from("observations").delete().in("id", batch);
    if (delErr) {
      console.error(`Failed to delete batch at offset ${i}:`, delErr.message);
      process.exit(1);
    }
  }
  console.log(`Deleted ${ids.length} observations.\n`);

  // Recompute snapshots for each affected entity.
  let recomputed = 0;
  for (const [entityId, { entity_type, user_id }] of affectedEntities) {
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
      console.warn(`  [WARN] Failed to recompute snapshot for ${entityId}:`, err.message);
    }
  }

  console.log(`✅ Rollback complete. Recomputed ${recomputed} snapshots.`);
}

// ─── Audit + migrate ──────────────────────────────────────────────────────────

async function main() {
  if (MODE === "rollback") {
    if (!ROLLBACK_RUN_ID) {
      console.error("Usage: --rollback <run_id>");
      process.exit(1);
    }
    await rollback(ROLLBACK_RUN_ID);
    return;
  }

  console.log(`audit_raw_fragments_schema_lag — ${MODE === "migrate" ? "MIGRATE" : "DRY RUN"}`);
  if (MODE === "migrate") {
    console.log(`migration_run_id: ${MIGRATION_RUN_ID}`);
  }
  console.log();

  // 1. Distinct (entity_type, user_id) pairs in raw_fragments.
  const { data: combos, error: comboErr } = await db
    .from("raw_fragments")
    .select("entity_type, user_id")
    .not("fragment_envelope", "is", null);

  if (comboErr) {
    console.error("Failed to query raw_fragments:", comboErr.message);
    process.exit(1);
  }
  if (!combos || combos.length === 0) {
    console.log("No raw_fragments rows found. Nothing to audit.");
    return;
  }

  const seen = new Set<string>();
  const pairs: Array<{ entity_type: string; user_id: string | null }> = [];
  for (const row of combos) {
    const key = `${row.entity_type}|${row.user_id ?? "null"}`;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push({ entity_type: row.entity_type, user_id: row.user_id });
    }
  }

  const filteredPairs = ENTITY_TYPE_FILTER
    ? pairs.filter((p) => ENTITY_TYPE_FILTER.has(p.entity_type))
    : pairs;

  if (ENTITY_TYPE_FILTER) {
    console.log(`Filtering to entity types: ${[...ENTITY_TYPE_FILTER].join(", ")}`);
  }
  console.log(`Found ${filteredPairs.length} matching (entity_type, user_id) combinations.\n`);

  type Hit = {
    entity_type: string;
    user_id: string | null;
    fields: string[];
    total_fragments: number;
  };

  const hits: Hit[] = [];

  // 2. Cross-reference against active schemas.
  for (const { entity_type, user_id } of filteredPairs) {
    const schema = await schemaRegistry.loadActiveSchema(entity_type, user_id ?? undefined);
    if (!schema) continue;

    const declaredFields = new Set(Object.keys(schema.schema_definition.fields ?? {}));
    if (declaredFields.size === 0) continue;

    let query = db
      .from("raw_fragments")
      .select("fragment_key, frequency_count, first_seen, last_seen, fragment_envelope")
      .eq("entity_type", entity_type);

    if (user_id === null || user_id === DEFAULT_USER_ID) {
      query = query.or(`user_id.is.null,user_id.eq.${DEFAULT_USER_ID}`);
    } else {
      query = query.eq("user_id", user_id);
    }

    const { data: fragments, error: fragErr } = await query;
    if (fragErr) {
      console.warn(`  [WARN] Could not query fragments for ${entity_type}:`, fragErr.message);
      continue;
    }
    if (!fragments || fragments.length === 0) continue;

    const misfiled = (fragments as FragmentRow[]).filter(
      (f) =>
        f.fragment_envelope?.reason === "unknown_field" &&
        declaredFields.has(f.fragment_key),
    );
    if (misfiled.length === 0) continue;

    const fieldNames = [...new Set(misfiled.map((f) => f.fragment_key))].sort();
    const totalFragments = misfiled.reduce((sum, f) => sum + (f.frequency_count ?? 1), 0);

    hits.push({ entity_type, user_id, fields: fieldNames, total_fragments: totalFragments });

    console.log(`⚠️  ${entity_type} (user_id=${user_id ?? "global"})`);
    console.log(`   Active schema version: ${schema.schema_version}`);
    console.log(`   Misfiled fields (${fieldNames.length}): ${fieldNames.join(", ")}`);
    console.log(`   Total fragment rows: ${totalFragments}`);
    const dates = misfiled.flatMap((f) => [f.first_seen, f.last_seen]).filter(Boolean).sort();
    console.log(`   Date range: ${dates[0] ?? "unknown"} → ${dates.at(-1) ?? "unknown"}`);
    console.log();
  }

  if (hits.length === 0) {
    console.log("✅ No misfiled raw_fragments found.");
    return;
  }

  console.log(`Summary: ${hits.length} entity type(s) have misfiled fragments.\n`);

  if (MODE !== "migrate") {
    console.log("Re-run with --migrate to promote misfiled fragments to observations.");
    console.log("Each observation will include _migration_run_id for clean rollback.\n");
    return;
  }

  // 3. Migrate: for each affected entity type, fetch full fragment rows and
  //    insert observations with the sentinel field.
  let totalInserted = 0;
  let totalEntities = 0;

  for (const hit of hits) {
    console.log(`Migrating ${hit.entity_type} (user_id=${hit.user_id ?? "global"})...`);

    const currentSchema = await schemaRegistry.loadActiveSchema(
      hit.entity_type,
      hit.user_id ?? undefined,
    );
    if (!currentSchema) {
      console.warn(`  [SKIP] No active schema for ${hit.entity_type}`);
      continue;
    }

    // Fetch full fragment rows for the misfiled fields.
    let fragQuery = db
      .from("raw_fragments")
      .select("*")
      .eq("entity_type", hit.entity_type)
      .in("fragment_key", hit.fields);

    if (hit.user_id === null || hit.user_id === DEFAULT_USER_ID) {
      fragQuery = fragQuery.or(`user_id.is.null,user_id.eq.${DEFAULT_USER_ID}`);
    } else {
      fragQuery = fragQuery.eq("user_id", hit.user_id);
    }

    const { data: allFragments, error: fErr } = await fragQuery;
    if (fErr || !allFragments) {
      console.warn(`  [WARN] Could not fetch fragments:`, fErr?.message);
      continue;
    }

    // Filter to unknown_field only.
    const fragments = (allFragments as FragmentRow[]).filter(
      (f) => f.fragment_envelope?.reason === "unknown_field",
    );

    // Group by (entity_id OR source_id:interpretation_id) → promoted fields.
    const entityGroups = new Map<
      string,
      { entityId: string | null; sourceId: string | null; interpId: string | null; userId: string | null; fields: Record<string, unknown> }
    >();

    for (const frag of fragments) {
      // Prefer explicit entity_id; fall back to source+interpretation lookup key.
      const groupKey = frag.entity_id
        ? `eid:${frag.entity_id}`
        : `src:${frag.source_id ?? "null"}:${frag.interpretation_id ?? "null"}`;

      if (!entityGroups.has(groupKey)) {
        entityGroups.set(groupKey, {
          entityId: frag.entity_id ?? null,
          sourceId: frag.source_id ?? null,
          interpId: frag.interpretation_id ?? null,
          userId: frag.user_id,
          fields: {},
        });
      }
      entityGroups.get(groupKey)!.fields[frag.fragment_key] = frag.fragment_value;
    }

    // Resolve entity_id for source-keyed groups via existing observations.
    for (const [key, group] of entityGroups) {
      if (group.entityId) continue;
      if (!group.sourceId) {
        entityGroups.delete(key);
        continue;
      }

      let obsQ = db
        .from("observations")
        .select("entity_id")
        .eq("source_id", group.sourceId)
        .eq("entity_type", hit.entity_type);

      if (group.interpId) {
        obsQ = obsQ.eq("interpretation_id", group.interpId);
      } else {
        obsQ = obsQ.is("interpretation_id", null);
      }

      const { data: existing } = await obsQ;
      const ids = new Set(
        (existing ?? [])
          .map((o: { entity_id?: unknown }) => o.entity_id)
          .filter((id): id is string => typeof id === "string"),
      );

      if (ids.size === 1) {
        group.entityId = Array.from(ids)[0];
      } else {
        // Ambiguous or no match — skip.
        entityGroups.delete(key);
      }
    }

    // Insert one observation per entity group.
    const affectedEntityIds = new Set<string>();
    let insertedForType = 0;

    for (const group of entityGroups.values()) {
      if (!group.entityId || Object.keys(group.fields).length === 0) continue;

      const fieldsWithSentinel = {
        ...group.fields,
        _migration_run_id: MIGRATION_RUN_ID,
      };

      const { error: insErr } = await db.from("observations").insert({
        id: deterministicObsId(group.entityId, MIGRATION_RUN_ID),
        entity_id: group.entityId,
        entity_type: hit.entity_type,
        schema_version: currentSchema.schema_version,
        source_id: group.sourceId,
        interpretation_id: group.interpId,
        observed_at: new Date().toISOString(),
        specificity_score: 0.8,
        source_priority: 0,
        fields: fieldsWithSentinel,
        user_id: group.userId ?? DEFAULT_USER_ID,
      });

      if (insErr) {
        if (insErr.code === "23505") continue; // already migrated (idempotent)
        console.warn(`  [WARN] Insert failed for entity ${group.entityId}:`, insErr.message);
        continue;
      }

      affectedEntityIds.add(group.entityId);
      insertedForType++;
      totalInserted++;
    }

    // Recompute snapshots for affected entities.
    let recomputed = 0;
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
        console.warn(`  [WARN] Snapshot recompute failed for ${entityId}:`, err.message);
      }
    }

    totalEntities += affectedEntityIds.size;
    console.log(`  ✅ Inserted ${insertedForType} observations, recomputed ${recomputed} snapshots`);
  }

  console.log(`\nDone.`);
  console.log(`  Inserted: ${totalInserted} observations across ${totalEntities} entities`);
  console.log(`  migration_run_id: ${MIGRATION_RUN_ID}`);
  console.log(`\nTo roll back: tsx scripts/audit_raw_fragments_schema_lag.ts --rollback "${MIGRATION_RUN_ID}"`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
