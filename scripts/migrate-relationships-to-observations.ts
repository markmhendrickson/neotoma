/**
 * Migration Script: Convert existing relationships to relationship observations
 *
 * This script:
 * 1. Reads all existing relationships from the relationships table
 * 2. Creates relationship_observations for each relationship
 * 3. Computes and stores relationship_snapshots
 *
 * Usage:
 *   npm run ts-node scripts/migrate-relationships-to-observations.ts [--dry-run]
 */

import { supabase } from "../src/db.js";
import { relationshipReducer } from "../src/reducers/relationship_reducer.js";
import { canonicalizeFields, hashCanonicalFields } from "../src/services/field_canonicalization.js";
import { createHash } from "crypto";

interface MigrationResult {
  relationshipsProcessed: number;
  observationsCreated: number;
  snapshotsCreated: number;
  errors: string[];
}

async function migrateRelationshipsToObservations(
  dryRun: boolean = false,
): Promise<MigrationResult> {
  const result: MigrationResult = {
    relationshipsProcessed: 0,
    observationsCreated: 0,
    snapshotsCreated: 0,
    errors: [],
  };

  console.log(`\n🔄 Starting relationship migration ${dryRun ? "(DRY RUN)" : ""}...\n`);

  // 1. Fetch all existing relationships
  const { data: relationships, error: fetchError } = await supabase
    .from("relationships")
    .select("*")
    .order("created_at", { ascending: true });

  if (fetchError) {
    throw new Error(`Failed to fetch relationships: ${fetchError.message}`);
  }

  if (!relationships || relationships.length === 0) {
    console.log("✅ No relationships to migrate.");
    return result;
  }

  console.log(`Found ${relationships.length} relationships to migrate.\n`);

  // 2. Process each relationship
  for (const relationship of relationships) {
    try {
      result.relationshipsProcessed++;

      // Generate relationship key
      const relationshipKey = `${relationship.relationship_type}:${relationship.source_entity_id}:${relationship.target_entity_id}`;

      // Canonicalize metadata
      const metadata = relationship.metadata || {};
      const canonicalMetadata = canonicalizeFields(metadata);
      const canonicalHash = hashCanonicalFields(canonicalMetadata);

      // Generate deterministic observation ID
      const sourceId = relationship.source_record_id || relationship.source_material_id || "00000000-0000-0000-0000-000000000000";
      const observationId = createHash("sha256")
        .update(
          JSON.stringify({
            source_id: sourceId,
            interpretation_id: null,
            relationship_key: relationshipKey,
            canonical_hash: canonicalHash,
          }),
        )
        .digest("hex")
        .substring(0, 32);

      console.log(
        `[${result.relationshipsProcessed}/${relationships.length}] Processing: ${relationship.relationship_type} (${relationship.source_entity_id} → ${relationship.target_entity_id})`,
      );

      if (!dryRun) {
        // Check if observation already exists
        const { data: existingObs } = await supabase
          .from("relationship_observations")
          .select("id")
          .eq("id", observationId)
          .maybeSingle();

        if (existingObs) {
          console.log(`  ⏭️  Observation already exists, skipping`);
          continue;
        }

        // Create relationship observation
        const { error: obsError } = await supabase
          .from("relationship_observations")
          .insert({
            id: observationId,
            relationship_key: relationshipKey,
            relationship_type: relationship.relationship_type,
            source_entity_id: relationship.source_entity_id,
            target_entity_id: relationship.target_entity_id,
            source_id: sourceId,
            interpretation_id: null, // Legacy relationships have no interpretation
            observed_at: relationship.created_at || new Date().toISOString(),
            specificity_score: 0.8,
            source_priority: 100, // Default priority for legacy relationships
            metadata: canonicalMetadata,
            canonical_hash: canonicalHash,
            user_id: relationship.user_id,
          });

        if (obsError) {
          const errorMsg = `Failed to create observation for relationship ${relationship.id}: ${obsError.message}`;
          console.error(`  ❌ ${errorMsg}`);
          result.errors.push(errorMsg);
          continue;
        }

        result.observationsCreated++;
        console.log(`  ✅ Created observation`);
      } else {
        console.log(`  [DRY RUN] Would create observation`);
      }
    } catch (error) {
      const errorMsg = `Failed to process relationship ${relationship.id}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`  ❌ ${errorMsg}`);
      result.errors.push(errorMsg);
    }
  }

  // 3. Compute snapshots for all unique relationship keys
  console.log(`\n📊 Computing relationship snapshots...\n`);

  const uniqueRelationshipKeys = new Set<string>(
    relationships.map(
      (r) => `${r.relationship_type}:${r.source_entity_id}:${r.target_entity_id}`,
    ),
  );

  let snapshotIndex = 0;
  for (const relationshipKey of uniqueRelationshipKeys) {
    snapshotIndex++;
    try {
      console.log(
        `[${snapshotIndex}/${uniqueRelationshipKeys.size}] Computing snapshot for: ${relationshipKey}`,
      );

      if (!dryRun) {
        // Get all observations for this relationship
        const { data: observations, error: fetchObsError } = await supabase
          .from("relationship_observations")
          .select("*")
          .eq("relationship_key", relationshipKey)
          .order("observed_at", { ascending: false });

        if (fetchObsError) {
          const errorMsg = `Failed to fetch observations for ${relationshipKey}: ${fetchObsError.message}`;
          console.error(`  ❌ ${errorMsg}`);
          result.errors.push(errorMsg);
          continue;
        }

        if (!observations || observations.length === 0) {
          console.log(`  ⏭️  No observations found, skipping`);
          continue;
        }

        // Compute snapshot
        const snapshot = await relationshipReducer.computeSnapshot(
          relationshipKey,
          observations as any,
        );

        // Save snapshot
        const { error: snapshotError } = await supabase
          .from("relationship_snapshots")
          .upsert(
            {
              relationship_key: snapshot.relationship_key,
              relationship_type: snapshot.relationship_type,
              source_entity_id: snapshot.source_entity_id,
              target_entity_id: snapshot.target_entity_id,
              schema_version: snapshot.schema_version,
              snapshot: snapshot.snapshot,
              computed_at: snapshot.computed_at,
              observation_count: snapshot.observation_count,
              last_observation_at: snapshot.last_observation_at,
              provenance: snapshot.provenance,
              user_id: snapshot.user_id,
            },
            {
              onConflict: "relationship_key",
            },
          );

        if (snapshotError) {
          const errorMsg = `Failed to save snapshot for ${relationshipKey}: ${snapshotError.message}`;
          console.error(`  ❌ ${errorMsg}`);
          result.errors.push(errorMsg);
          continue;
        }

        result.snapshotsCreated++;
        console.log(`  ✅ Created snapshot (${observations.length} observations merged)`);
      } else {
        console.log(`  [DRY RUN] Would compute and save snapshot`);
      }
    } catch (error) {
      const errorMsg = `Failed to compute snapshot for ${relationshipKey}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`  ❌ ${errorMsg}`);
      result.errors.push(errorMsg);
    }
  }

  return result;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Relationship to Observations Migration");
  console.log("═══════════════════════════════════════════════════════════");

  try {
    const result = await migrateRelationshipsToObservations(dryRun);

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("  Migration Summary");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`Relationships processed:   ${result.relationshipsProcessed}`);
    console.log(`Observations created:      ${result.observationsCreated}`);
    console.log(`Snapshots created:         ${result.snapshotsCreated}`);
    console.log(`Errors:                    ${result.errors.length}`);

    if (result.errors.length > 0) {
      console.log("\n❌ Errors encountered:");
      result.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }

    if (dryRun) {
      console.log("\n⚠️  This was a DRY RUN. No changes were made.");
      console.log("   Run without --dry-run to apply changes.");
    } else {
      console.log("\n✅ Migration completed successfully!");
    }
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  }
}

main();
