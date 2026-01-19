import { supabase } from '../src/db.js';

async function check() {
  // Check raw_fragments for task
  const { data: fragments, error } = await supabase
    .from('raw_fragments')
    .select('fragment_type, entity_type, fragment_key, source_id, interpretation_id, user_id')
    .or('fragment_type.eq.task,entity_type.eq.task')
    .limit(10);

  console.log('Sample raw_fragments:');
  if (fragments) {
    fragments.forEach(f => {
      console.log(`  ${f.fragment_key}: fragment_type=${f.fragment_type}, entity_type=${f.entity_type}, source_id=${f.source_id}, user_id=${f.user_id}`);
    });
  } else {
    console.log('  No fragments found');
  }
  console.log('');
  console.log('Error:', error);
  
  // Count total
  const { count } = await supabase
    .from('raw_fragments')
    .select('*', { count: 'exact', head: true })
    .or('fragment_type.eq.task,entity_type.eq.task');
  
  console.log('Total fragments for task:', count);
  
  // Check for specific field
  const { data: taskIdFrags } = await supabase
    .from('raw_fragments')
    .select('*')
    .or('fragment_type.eq.task,entity_type.eq.task')
    .eq('fragment_key', 'task_id')
    .limit(3);
  
  console.log('\nSample task_id fragments:');
  if (taskIdFrags) {
    taskIdFrags.forEach(f => {
      console.log(`  fragment_type: ${f.fragment_type}, entity_type: ${f.entity_type}, source_id: ${f.source_id}, user_id: ${f.user_id}`);
    });
  }
}

check().catch(console.error);
