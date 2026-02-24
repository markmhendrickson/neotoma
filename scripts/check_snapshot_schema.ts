import { db } from '../src/db.js';

async function check() {
  const { data } = await db
    .from('entity_snapshots')
    .select('entity_id, schema_version, snapshot')
    .eq('entity_id', 'ent_c5042fb1197f4ce6677084ac')
    .single();
  
  console.log('Snapshot metadata schema_version (column):', data?.schema_version);
  console.log('Snapshot data schema_version field (in JSONB):', data?.snapshot?.schema_version);
  console.log('');
  console.log('These are different:');
  console.log('  - Column schema_version = schema version used for computation (should be 22.0)');
  console.log('  - Field schema_version = data field from observation (is 1.0)');
}

check().catch(console.error);
