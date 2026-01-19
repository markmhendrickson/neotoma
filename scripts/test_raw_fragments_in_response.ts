import { getEntityWithProvenance } from '../src/services/entity_queries.js';

async function test() {
  const entity = await getEntityWithProvenance('ent_c5042fb1197f4ce6677084ac');
  
  console.log('Entity ID:', entity?.entity_id);
  console.log('Entity Type:', entity?.entity_type);
  console.log('');
  console.log('Snapshot fields:', entity?.snapshot ? Object.keys(entity.snapshot).length : 0);
  console.log('Raw fragments:', entity?.raw_fragments ? Object.keys(entity.raw_fragments).length : 0);
  console.log('');
  
  if (entity?.raw_fragments) {
    console.log('Raw fragments keys:');
    Object.keys(entity.raw_fragments).sort().forEach(key => {
      console.log(`  - ${key}`);
    });
    console.log('');
    console.log('Sample raw fragments (first 3):');
    const entries = Object.entries(entity.raw_fragments).slice(0, 3);
    entries.forEach(([key, value]) => {
      console.log(`  ${key}:`, typeof value === 'string' && value.length > 50 
        ? `${value.substring(0, 50)}...` 
        : value);
    });
  } else {
    console.log('No raw fragments found');
  }
}

test().catch(console.error);
