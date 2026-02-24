import { db } from '../src/db.js';

/**
 * Check for entities with stale snapshots (observation_count: 0 but observations exist)
 */
async function checkStaleSnapshots() {
  console.log('Checking for entities with stale snapshots...\n');

  // Get all entity snapshots with observation_count = 0
  const { data: staleSnapshots, error: snapshotError } = await db
    .from('entity_snapshots')
    .select('entity_id, entity_type, observation_count, computed_at')
    .eq('observation_count', 0)
    .order('computed_at', { ascending: false });

  if (snapshotError) {
    console.error('Error fetching snapshots:', snapshotError);
    return;
  }

  if (!staleSnapshots || staleSnapshots.length === 0) {
    console.log('✅ No stale snapshots found (all snapshots have observation_count > 0)');
    return;
  }

  console.log(`Found ${staleSnapshots.length} snapshots with observation_count = 0\n`);

  let staleCount = 0;
  const staleEntities: Array<{
    entity_id: string;
    entity_type: string;
    observation_count_snapshot: number;
    observation_count_actual: number;
    computed_at: string;
  }> = [];

  for (const snapshot of staleSnapshots) {
    // Check if observations actually exist for this entity
    const { data: observations, error: obsError } = await db
      .from('observations')
      .select('id')
      .eq('entity_id', snapshot.entity_id);

    if (obsError) {
      console.error(`Error checking observations for ${snapshot.entity_id}:`, obsError);
      continue;
    }

    const actualObsCount = observations?.length || 0;

    if (actualObsCount > 0) {
      // Stale snapshot detected
      staleCount++;
      staleEntities.push({
        entity_id: snapshot.entity_id,
        entity_type: snapshot.entity_type,
        observation_count_snapshot: snapshot.observation_count,
        observation_count_actual: actualObsCount,
        computed_at: snapshot.computed_at,
      });

      console.log(`❌ Stale: ${snapshot.entity_id} (${snapshot.entity_type})`);
      console.log(`   Snapshot observation_count: ${snapshot.observation_count}`);
      console.log(`   Actual observations: ${actualObsCount}`);
      console.log(`   Computed at: ${snapshot.computed_at}\n`);
    }
  }

  if (staleCount === 0) {
    console.log('✅ No stale snapshots found (all entities with observation_count=0 have no observations)');
  } else {
    console.log(`\n⚠️  Found ${staleCount} stale snapshots that need recomputation\n`);
    console.log('Stale entities:');
    console.log(JSON.stringify(staleEntities, null, 2));
  }

  return staleEntities;
}

checkStaleSnapshots().catch(console.error);
