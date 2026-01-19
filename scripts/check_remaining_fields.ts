import { supabase } from '../src/db.js';

async function checkRemaining() {
  // Get all unique fragment_keys for task
  const { data: fragments } = await supabase
    .from('raw_fragments')
    .select('fragment_key, frequency_count')
    .eq('fragment_type', 'task')
    .or('user_id.is.null,user_id.eq.00000000-0000-0000-0000-000000000000');

  if (!fragments) {
    console.log('No fragments found');
    return;
  }

  // Group by fragment_key
  const fieldMap = new Map();
  for (const frag of fragments) {
    const key = frag.fragment_key;
    const freq = frag.frequency_count || 1;
    fieldMap.set(key, (fieldMap.get(key) || 0) + freq);
  }

  console.log('All fields in raw_fragments:');
  console.log('Total unique fields:', fieldMap.size);
  console.log('');
  
  // Schema fields (from the list we saw)
  const schemaFields = new Set([
    'tags', 'notes', 'title', 'domain', 'status', 'task_id', 'urgency', 'assignee',
    'due_date', 'priority', 'created_at', 'project_id', 'recurrence', 'start_date',
    'updated_at', 'description', 'import_date', 'outcome_ids', 'assignee_gid',
    'created_date', 'updated_date', 'assignee_name', 'permalink_url', 'completed_date',
    'follower_names', 'parent_task_id', 'schema_version', 'asana_workspace', 'import_source_file'
  ]);

  const remaining = Array.from(fieldMap.entries())
    .filter(([key]) => !schemaFields.has(key))
    .sort((a, b) => b[1] - a[1]);

  const inSchema = Array.from(fieldMap.entries())
    .filter(([key]) => schemaFields.has(key))
    .sort((a, b) => b[1] - a[1]);

  console.log('Fields IN schema (auto-enhanced):');
  console.log(`Total: ${inSchema.length} fields`);
  inSchema.forEach(([key, freq]) => {
    console.log(`  ✅ ${key}: frequency ${freq}`);
  });

  console.log('\nFields NOT in schema (still in raw_fragments):');
  console.log(`Total: ${remaining.length} fields`);
  remaining.forEach(([key, freq]) => {
    console.log(`  ⚠️  ${key}: frequency ${freq}`);
  });
}

checkRemaining().catch(console.error);
