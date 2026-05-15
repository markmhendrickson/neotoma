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
 *   4. Optionally migrates those fields back via migrateRawFragmentsToObservations.
 *
 * Usage:
 *   tsx scripts/audit_raw_fragments_schema_lag.ts          # dry-run (report only)
 *   tsx scripts/audit_raw_fragments_schema_lag.ts --migrate # migrate affected fields
 */

import { db } from "../src/db.js";
import { schemaRegistry } from "../src/services/schema_registry.js";

const DRY_RUN = !process.argv.includes("--migrate");

interface FragmentRow {
  entity_type: string;
  fragment_key: string;
  fragment_envelope: { reason: string } | null;
  user_id: string | null;
  frequency_count: number;
  first_seen: string;
  last_seen: string;
}

async function main() {
  console.log(`audit_raw_fragments_schema_lag — ${DRY_RUN ? "DRY RUN" : "MIGRATE"}\n`);

  // 1. Fetch all distinct (entity_type, user_id) combos from raw_fragments
  //    where reason = "unknown_field".
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

  // Deduplicate (entity_type, user_id) pairs.
  const seen = new Set<string>();
  const pairs: Array<{ entity_type: string; user_id: string | null }> = [];
  for (const row of combos) {
    const key = `${row.entity_type}|${row.user_id ?? "null"}`;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push({ entity_type: row.entity_type, user_id: row.user_id });
    }
  }

  console.log(`Found ${pairs.length} distinct (entity_type, user_id) combinations in raw_fragments.\n`);

  // 2. For each combo, load the active schema and find fragment_keys that are
  //    now declared fields.
  type Hit = {
    entity_type: string;
    user_id: string | null;
    fields: string[];
    total_fragments: number;
  };

  const hits: Hit[] = [];

  for (const { entity_type, user_id } of pairs) {
    // Load active schema (user-scoped if user_id present, else global).
    const schema = await schemaRegistry.loadActiveSchema(entity_type, user_id ?? undefined);
    if (!schema) continue;

    const declaredFields = new Set(Object.keys(schema.schema_definition.fields ?? {}));
    if (declaredFields.size === 0) continue;

    // Query raw_fragments for unknown_field fragments for this entity_type/user_id.
    let query = db
      .from("raw_fragments")
      .select("fragment_key, frequency_count, first_seen, last_seen, fragment_envelope")
      .eq("entity_type", entity_type);

    const defaultUserId = "00000000-0000-0000-0000-000000000000";
    if (user_id === null || user_id === defaultUserId) {
      query = query.or(`user_id.is.null,user_id.eq.${defaultUserId}`);
    } else {
      query = query.eq("user_id", user_id);
    }

    const { data: fragments, error: fragErr } = await query;
    if (fragErr) {
      console.warn(`  [WARN] Could not query fragments for ${entity_type}:`, fragErr.message);
      continue;
    }
    if (!fragments || fragments.length === 0) continue;

    // Filter to unknown_field reason only, and only keys that are now declared.
    const misfiled = (fragments as FragmentRow[]).filter(
      (f) =>
        f.fragment_envelope?.reason === "unknown_field" &&
        declaredFields.has(f.fragment_key)
    );

    if (misfiled.length === 0) continue;

    const fieldNames = [...new Set(misfiled.map((f) => f.fragment_key))].sort();
    const totalFragments = misfiled.reduce((sum, f) => sum + (f.frequency_count ?? 1), 0);

    hits.push({ entity_type, user_id, fields: fieldNames, total_fragments: totalFragments });

    console.log(`⚠️  ${entity_type} (user_id=${user_id ?? "global"})`);
    console.log(`   Active schema version: ${schema.schema_version}`);
    console.log(`   Misfiled fields (${fieldNames.length}): ${fieldNames.join(", ")}`);
    console.log(`   Total fragment rows: ${totalFragments}`);
    console.log(`   Date range: ${misfiled.map(f => f.first_seen).sort()[0]} → ${misfiled.map(f => f.last_seen).sort().at(-1)}`);
    console.log();
  }

  if (hits.length === 0) {
    console.log("✅ No misfiled raw_fragments found. All unknown_field rows are for fields not yet in any active schema.");
    return;
  }

  console.log(`\nSummary: ${hits.length} entity type(s) have misfiled fragments.\n`);

  if (DRY_RUN) {
    console.log("Re-run with --migrate to call migrateRawFragmentsToObservations for each.\n");
    return;
  }

  // 3. Migrate each affected (entity_type, user_id, fields) group.
  let totalMigrated = 0;
  for (const hit of hits) {
    console.log(`Migrating ${hit.entity_type} (user_id=${hit.user_id ?? "global"}) — fields: ${hit.fields.join(", ")}`);
    try {
      const result = await schemaRegistry.migrateRawFragmentsToObservations({
        entity_type: hit.entity_type,
        field_names: hit.fields,
        user_id: hit.user_id ?? undefined,
      });
      console.log(`  ✅ Migrated ${result.migrated_count} fragments`);
      totalMigrated += result.migrated_count;
    } catch (err: any) {
      console.error(`  ❌ Migration failed for ${hit.entity_type}:`, err.message);
    }
  }

  console.log(`\nDone. Total migrated: ${totalMigrated} fragments across ${hits.length} entity type(s).`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
