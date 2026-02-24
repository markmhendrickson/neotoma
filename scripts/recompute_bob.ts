import { db } from '../src/db.js';
import { observationReducer } from '../src/reducers/observation_reducer.js';

async function recomputeBob() {
  const entityId = 'ent_8aca4ec27d6bf99b404c27c4';
  
  console.log(`Recomputing snapshot for ${entityId}...\n`);
  
  // Get all observations for this entity
  const { data: observations, error: obsError } = await db
    .from('observations')
    .select('*')
    .eq('entity_id', entityId)
    .order('observed_at', { ascending: false });
  
  if (obsError) {
    console.error('Error fetching observations:', obsError);
    return;
  }
  
  console.log(`Found ${observations?.length || 0} observations`);
  
  if (!observations || observations.length === 0) {
    console.log('No observations found');
    return;
  }
  
  console.log('Observations:', JSON.stringify(observations, null, 2));
  
  // Compute snapshot
  const snapshot = await observationReducer.computeSnapshot(
    entityId,
    observations as any,
  );
  
  console.log('Computed snapshot:', JSON.stringify(snapshot, null, 2));
  
  // Save snapshot
  const { error: upsertError } = await db.from('entity_snapshots').upsert(
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
  
  if (upsertError) {
    console.error('Error saving snapshot:', upsertError);
    return;
  }
  
  console.log(`✅ Recomputed snapshot for ${entityId}`);
}

recomputeBob().catch(console.error);
