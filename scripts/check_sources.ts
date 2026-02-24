import { db } from '../src/db.js';

const sourceIds = [
  'b585e7e6-4a89-42c8-a5fe-beba617c936e',
  '619590fa-9616-4816-85e0-744639adb429',
  '93ed92f2-2e09-4c6f-ba27-4c786a516de2'
];

async function checkSources() {
  for (const sourceId of sourceIds) {
    const { data, error } = await db
      .from('sources')
      .select('id, content_hash, mime_type, file_size, original_filename, created_at, storage_url')
      .eq('id', sourceId)
      .single();
    
    if (error) {
      console.log(`Source ${sourceId}: Error - ${error.message}`);
    } else if (data) {
      console.log(`Source ${sourceId}:`);
      console.log(`  Filename: ${data.original_filename || 'N/A'}`);
      console.log(`  MIME Type: ${data.mime_type || 'N/A'}`);
      console.log(`  Size: ${data.file_size ? (data.file_size / 1024).toFixed(2) + ' KB' : 'N/A'}`);
      console.log(`  Created: ${data.created_at || 'N/A'}`);
      console.log(`  Content Hash: ${data.content_hash?.substring(0, 16) || 'N/A'}...`);
      console.log(`  Storage URL: ${data.storage_url || 'N/A'}`);
      console.log('');
    } else {
      console.log(`Source ${sourceId}: Not found`);
    }
  }
}

checkSources().catch(console.error);
