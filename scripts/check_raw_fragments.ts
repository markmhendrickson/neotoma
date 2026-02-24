import { db } from "../src/db.js";

async function check() {
  // Check raw_fragments for task
  const { data: fragments, error } = await db
    .from('raw_fragments')
    .select('entity_type, fragment_key, source_id, interpretation_id, user_id')
    .eq('entity_type', 'task')
    .limit(10);

  console.log('Sample raw_fragments:');
  if (fragments) {
    fragments.forEach(f => {
      console.log(`  ${f.fragment_key}: entity_type=${f.entity_type}, source_id=${f.source_id}, user_id=${f.user_id}`);
    });
  } else {
    console.log('  No fragments found');
  }
  console.log('');
  console.log('Error:', error);
  
  // Count total
  const { count } = await db
    .from('raw_fragments')
    .select('*', { count: 'exact', head: true })
    .eq('entity_type', 'task');
  
  console.log('Total fragments for task:', count);
  
  // Check for specific field
  const { data: taskIdFrags } = await db
    .from('raw_fragments')
    .select('*')
    .eq('entity_type', 'task')
    .eq('fragment_key', 'task_id')
    .limit(3);
  
  console.log('\nSample task_id fragments:');
  if (taskIdFrags) {
    taskIdFrags.forEach(f => {
      console.log(`  entity_type: ${f.entity_type}, source_id: ${f.source_id}, user_id: ${f.user_id}`);
    });
  }
}

check().catch(console.error);
