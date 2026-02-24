import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { db } from "../src/db.js";
import { observationReducer } from "../src/reducers/observation_reducer.js";

const __filename = fileURLToPath(import.meta.url);

/**
 * Background job to monitor and fix stale snapshots
 * 
 * This can be run:
 * 1. As a cron job (e.g., every 5 minutes)
 * 2. Via npm script: npm run monitor:snapshots
 * 3. As a one-time fix: npx tsx scripts/monitor_and_fix_snapshots.ts
 */

interface StaleSnapshot {
  entity_id: string;
  entity_type: string;
  observation_count_snapshot: number;
  observation_count_actual: number;
  computed_at: string;
}

async function monitorAndFixSnapshots() {
  console.log('🔍 Monitoring snapshots for staleness...\n');

  // Get all entity snapshots with observation_count = 0
  const { data: potentiallyStale, error: snapshotError } = await db
    .from('entity_snapshots')
    .select('entity_id, entity_type, observation_count, computed_at')
    .eq('observation_count', 0)
    .order('computed_at', { ascending: false });

  if (snapshotError) {
    console.error('❌ Error fetching snapshots:', snapshotError);
    return;
  }

  if (!potentiallyStale || potentiallyStale.length === 0) {
    console.log('✅ No snapshots with observation_count = 0 found');
    return;
  }

  console.log(`Found ${potentiallyStale.length} snapshots with observation_count = 0`);
  console.log('Checking for actual observations...\n');

  const staleSnapshots: StaleSnapshot[] = [];
  let fixedCount = 0;
  let errorCount = 0;

  for (const snapshot of potentiallyStale) {
    try {
      // Check if observations actually exist for this entity
      const { data: observations, error: obsError } = await db
        .from('observations')
        .select('*')
        .eq('entity_id', snapshot.entity_id)
        .order('observed_at', { ascending: false });

      if (obsError) {
        console.error(`❌ Error checking observations for ${snapshot.entity_id}:`, obsError);
        errorCount++;
        continue;
      }

      const actualObsCount = observations?.length || 0;

      if (actualObsCount > 0) {
        // Stale snapshot detected - recompute it
        console.log(`⚠️  Stale snapshot detected: ${snapshot.entity_id} (${snapshot.entity_type})`);
        console.log(`   Snapshot observation_count: ${snapshot.observation_count}`);
        console.log(`   Actual observations: ${actualObsCount}`);
        console.log(`   Computed at: ${snapshot.computed_at}`);

        staleSnapshots.push({
          entity_id: snapshot.entity_id,
          entity_type: snapshot.entity_type,
          observation_count_snapshot: snapshot.observation_count,
          observation_count_actual: actualObsCount,
          computed_at: snapshot.computed_at,
        });

        // Recompute snapshot
        console.log(`   🔧 Recomputing snapshot...`);
        const newSnapshot = await observationReducer.computeSnapshot(
          snapshot.entity_id,
          observations as any,
        );

        // Save snapshot
        const { error: upsertError } = await db.from('entity_snapshots').upsert(
          {
            entity_id: newSnapshot.entity_id,
            entity_type: newSnapshot.entity_type,
            schema_version: newSnapshot.schema_version,
            snapshot: newSnapshot.snapshot,
            computed_at: newSnapshot.computed_at,
            observation_count: newSnapshot.observation_count,
            last_observation_at: newSnapshot.last_observation_at,
            provenance: newSnapshot.provenance,
            user_id: newSnapshot.user_id,
          },
          {
            onConflict: 'entity_id',
          },
        );

        if (upsertError) {
          console.error(`   ❌ Failed to save snapshot:`, upsertError);
          errorCount++;
        } else {
          console.log(`   ✅ Fixed! New observation_count: ${newSnapshot.observation_count}\n`);
          fixedCount++;
        }
      }
    } catch (error: any) {
      console.error(`❌ Error processing ${snapshot.entity_id}:`, error.message);
      errorCount++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log('='.repeat(60));
  console.log(`Total snapshots checked: ${potentiallyStale.length}`);
  console.log(`Stale snapshots found: ${staleSnapshots.length}`);
  console.log(`Successfully fixed: ${fixedCount}`);
  console.log(`Errors encountered: ${errorCount}`);

  if (staleSnapshots.length > 0) {
    console.log('\n⚠️  Alert: Stale snapshots were detected and fixed.');
    console.log('This indicates a timing issue in snapshot computation.');
    console.log('Consider investigating why snapshots are being computed before observations are created.');
  } else {
    console.log('\n✅ No stale snapshots found - all systems healthy!');
  }

  return {
    checked: potentiallyStale.length,
    stale: staleSnapshots.length,
    fixed: fixedCount,
    errors: errorCount,
  };
}

// Run if executed directly (argv[1] may be relative or absolute)
const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(__filename);
if (isMain) {
  monitorAndFixSnapshots()
    .then((result) => {
      if (result && result.errors > 0) {
        process.exit(1); // Exit with error code if any errors occurred
      }
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { monitorAndFixSnapshots };
