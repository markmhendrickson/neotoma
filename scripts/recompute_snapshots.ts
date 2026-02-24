import { db } from '../src/db.js';
import { observationReducer } from '../src/reducers/observation_reducer.js';

/**
 * Recompute snapshots for all task entities that have new observations
 */
async function recomputeSnapshots() {
  console.log('Recomputing snapshots for task entities...\n');

  // Get all task entities
  const { data: entities } = await db
    .from('entities')
    .select('id')
    .eq('entity_type', 'task')
    .limit(10); // Start with first 10

  if (!entities || entities.length === 0) {
    console.log('No task entities found');
    return;
  }

  console.log(`Found ${entities.length} task entities to recompute\n`);

  let recomputed = 0;
  for (const entity of entities) {
    try {
      // Get all observations for this entity
      const { data: observations } = await db
        .from('observations')
        .select('*')
        .eq('entity_id', entity.id)
        .order('observed_at', { ascending: false });

      if (!observations || observations.length === 0) {
        continue;
      }

      // Compute snapshot
      const snapshot = await observationReducer.computeSnapshot(
        entity.id,
        observations as any,
      );

      // Save snapshot
      await db.from('entity_snapshots').upsert(
        {
          entity_id: snapshot.entity_id,
          entity_type: snapshot.entity_type,
          schema_version: snapshot.schema_version,
          snapshot: snapshot.snapshot,
          computed_at: snapshot.computed_at,
          observation_count: snapshot.observation_count,
          last_observation_at: snapshot.last_observation_at,
          provenance: snapshot.provenance,
          user_id: snapshot.user_id,
        },
        {
          onConflict: 'entity_id',
        },
      );

      recomputed++;
      console.log(`✅ Recomputed snapshot for ${entity.id} (${Object.keys(snapshot.snapshot).length} fields)`);
    } catch (error: any) {
      console.error(`❌ Failed to recompute snapshot for ${entity.id}:`, error.message);
    }
  }

  console.log(`\n✅ Recomputed ${recomputed} snapshots`);
}

recomputeSnapshots().catch(console.error);
