import { schemaRegistry } from '../src/services/schema_registry.js';
import { db } from '../src/db.js';

/**
 * One-time migration script to migrate raw_fragments to observations
 * for fields that were already auto-enhanced but not migrated
 */
async function migrateAutoEnhancedFields() {
  console.log('Migrating auto-enhanced fields from raw_fragments to observations...\n');

  // Get all auto-applied schema recommendations for task entity
  const { data: recommendations } = await db
    .from('schema_recommendations')
    .select('fields_to_add, entity_type, user_id')
    .eq('entity_type', 'task')
    .eq('status', 'auto_applied')
    .or('user_id.is.null,user_id.eq.00000000-0000-0000-0000-000000000000');

  if (!recommendations || recommendations.length === 0) {
    console.log('No auto-applied recommendations found');
    return;
  }

  // Extract unique field names
  const fieldNames = new Set<string>();
  for (const rec of recommendations) {
    if (rec.fields_to_add && Array.isArray(rec.fields_to_add)) {
      for (const field of rec.fields_to_add) {
        if (field.field_name) {
          fieldNames.add(field.field_name);
        }
      }
    }
  }

  console.log(`Found ${fieldNames.size} auto-enhanced fields to migrate:`);
  Array.from(fieldNames).sort().forEach(field => {
    console.log(`  - ${field}`);
  });
  console.log('');

  // Handle default user ID
  const defaultUserId = "00000000-0000-0000-0000-000000000000";
  const userId = null; // Use null for global schemas

  // Migrate each field
  const fieldsToMigrate = Array.from(fieldNames).map(fieldName => {
    // Find the field type from recommendations
    for (const rec of recommendations) {
      if (rec.fields_to_add && Array.isArray(rec.fields_to_add)) {
        const field = rec.fields_to_add.find(f => f.field_name === fieldName);
        if (field) {
          return {
            field_name: fieldName,
            field_type: field.field_type || 'string',
          };
        }
      }
    }
    return {
      field_name: fieldName,
      field_type: 'string' as const,
    };
  });

  console.log('Starting migration...\n');

  try {
    const result = await schemaRegistry.migrateRawFragmentsToObservations({
      entity_type: 'task',
      field_names: Array.from(fieldNames),
      user_id: userId,
    });

    console.log(`\n✅ Migration complete!`);
    console.log(`   Migrated ${result.migrated_count} fragments} fragments to observations`);
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

migrateAutoEnhancedFields().catch(console.error);
