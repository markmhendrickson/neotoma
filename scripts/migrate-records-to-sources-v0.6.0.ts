/**
 * Migration Script: Records to Sources Architecture
 * 
 * Migrates data from legacy records table to new sources/observations architecture.
 * 
 * Usage:
 *   npm run migrate:records-to-sources -- --user-id <uuid> [--dry-run] [--batch-size 100]
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface MigrationOptions {
  userId: string;
  batchSize?: number;
  dryRun?: boolean;
  startFromRecordId?: string;
}

interface MigrationResult {
  recordsProcessed: number;
  sourcesCreated: number;
  observationsCreated: number;
  entitiesResolved: number;
  graphEdgesMigrated: number;
  timelineEventsMigrated: number;
  errors: Array<{ recordId: string; error: string }>;
  skipped: Array<{ recordId: string; reason: string }>;
}

/**
 * Compute content hash for record data
 */
function computeContentHash(data: any): string {
  const normalized = JSON.stringify(data, Object.keys(data).sort());
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Main migration function
 */
export async function migrateRecordsToSources(
  options: MigrationOptions
): Promise<MigrationResult> {
  const { userId, batchSize = 100, dryRun = false, startFromRecordId } = options;
  
  const result: MigrationResult = {
    recordsProcessed: 0,
    sourcesCreated: 0,
    observationsCreated: 0,
    entitiesResolved: 0,
    graphEdgesMigrated: 0,
    timelineEventsMigrated: 0,
    errors: [],
    skipped: [],
  };

  console.log(`Starting migration for user ${userId}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Batch size: ${batchSize}`);
  
  // 1. Query all records for user
  let query = supabase
    .from('records')
    .select('*')
    .order('created_at', { ascending: true });
  
  if (startFromRecordId) {
    query = query.gt('id', startFromRecordId);
  }

  const { data: records, error: fetchError } = await query;
  
  if (fetchError) {
    throw new Error(`Failed to fetch records: ${fetchError.message}`);
  }

  console.log(`Found ${records?.length || 0} records to migrate`);

  if (!records || records.length === 0) {
    return result;
  }

  // Process in batches
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} records)`);

    for (const record of batch) {
      try {
        await migrateRecord(record, userId, dryRun, result);
        result.recordsProcessed++;
      } catch (error) {
        result.errors.push({
          recordId: record.id,
          error: error instanceof Error ? error.message : String(error),
        });
        console.error(`Error migrating record ${record.id}:`, error);
      }
    }

    // Small delay between batches
    if (i + batchSize < records.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log('\nMigration Summary:');
  console.log(`Records processed: ${result.recordsProcessed}`);
  console.log(`Sources created: ${result.sourcesCreated}`);
  console.log(`Observations created: ${result.observationsCreated}`);
  console.log(`Entities resolved: ${result.entitiesResolved}`);
  console.log(`Graph edges migrated: ${result.graphEdgesMigrated}`);
  console.log(`Timeline events migrated: ${result.timelineEventsMigrated}`);
  console.log(`Errors: ${result.errors.length}`);
  console.log(`Skipped: ${result.skipped.length}`);

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    result.errors.forEach(({ recordId, error }) => {
      console.log(`  ${recordId}: ${error}`);
    });
  }

  return result;
}

/**
 * Migrate a single record
 */
async function migrateRecord(
  record: any,
  userId: string,
  dryRun: boolean,
  result: MigrationResult
): Promise<void> {
  // Check if already migrated
  const { data: existingSource } = await supabase
    .from('sources')
    .select('id')
    .eq('user_id', userId)
    .eq('provenance->>migrated_from_record_id', record.id)
    .maybeSingle();

  if (existingSource) {
    result.skipped.push({
      recordId: record.id,
      reason: 'Already migrated',
    });
    return;
  }

  // 1. Create or find source
  let sourceId: string;
  
  if (record.file_urls && record.file_urls.length > 0) {
    // Record has files - create source from file
    const fileUrl = record.file_urls[0];
    const contentHash = computeContentHash({
      file_url: fileUrl,
      record_id: record.id,
    });

    if (!dryRun) {
      const { data: source, error: sourceError } = await supabase
        .from('sources')
        .insert({
          user_id: userId,
          content_hash: contentHash,
          mime_type: 'application/octet-stream', // TODO: Detect from file
          storage_url: fileUrl,
          file_size: 0, // Unknown for migrated records
          original_filename: record.properties?.filename || `record-${record.id}`,
          provenance: {
            migrated_from_record_id: record.id,
            migrated_at: new Date().toISOString(),
            original_created_at: record.created_at,
          },
        })
        .select()
        .single();

      if (sourceError) {
        throw new Error(`Failed to create source: ${sourceError.message}`);
      }

      sourceId = source.id;
      result.sourcesCreated++;
    } else {
      sourceId = 'dry-run-source-id';
      console.log(`  [DRY RUN] Would create source for record ${record.id}`);
    }
  } else {
    // Record has no files - create synthetic source
    const contentHash = computeContentHash({
      type: record.type,
      properties: record.properties,
      record_id: record.id,
    });

    if (!dryRun) {
      const { data: source, error: sourceError } = await supabase
        .from('sources')
        .insert({
          user_id: userId,
          content_hash: contentHash,
          mime_type: 'application/json',
          storage_url: `synthetic/${contentHash}`,
          file_size: JSON.stringify(record.properties).length,
          original_filename: `${record.type}-${record.id}.json`,
          provenance: {
            migrated_from_record_id: record.id,
            migrated_at: new Date().toISOString(),
            original_created_at: record.created_at,
            synthetic: true,
          },
        })
        .select()
        .single();

      if (sourceError) {
        throw new Error(`Failed to create synthetic source: ${sourceError.message}`);
      }

      sourceId = source.id;
      result.sourcesCreated++;
    } else {
      sourceId = 'dry-run-source-id';
      console.log(`  [DRY RUN] Would create synthetic source for record ${record.id}`);
    }
  }

  // 2. Create interpretation run
  let interpretationId: string;

  if (!dryRun) {
    const { data: interpretationRun, error: runError } = await supabase
      .from('interpretation_runs')
      .insert({
        user_id: userId,
        source_id: sourceId,
        interpretation_config: {
          migration: true,
          original_record_type: record.type,
        },
        status: 'completed',
        started_at: record.created_at,
        completed_at: record.created_at,
        observations_created: 1,
        unknown_fields_count: 0,
      })
      .select()
      .single();

    if (runError) {
      throw new Error(`Failed to create interpretation run: ${runError.message}`);
    }

    interpretationId = interpretationRun.id;
  } else {
    interpretationId = 'dry-run-interpretation-id';
  }

  // 3. Resolve entity for this record
  const entityType = record.type;
  const entityName = record.properties?.name || 
                     record.properties?.title || 
                     record.properties?.description?.substring(0, 50) ||
                     `${record.type}-${record.id}`;
  
  const normalizedName = entityName.toLowerCase().trim();
  const entityId = `ent_${createHash('sha256')
    .update(`${entityType}:${normalizedName}`)
    .digest('hex')
    .substring(0, 24)}`;

  if (!dryRun) {
    // Upsert entity
    const { error: entityError } = await supabase
      .from('entities')
      .upsert({
        id: entityId,
        entity_type: entityType,
        canonical_name: normalizedName,
        aliases: [],
        user_id: userId,
      }, {
        onConflict: 'id',
        ignoreDuplicates: false,
      });

    if (entityError) {
      console.warn(`Failed to upsert entity: ${entityError.message}`);
    } else {
      result.entitiesResolved++;
    }
  }

  // 4. Create observation from record properties
  if (!dryRun) {
    const { error: obsError } = await supabase
      .from('observations')
      .insert({
        entity_id: entityId,
        entity_type: entityType,
        schema_version: '1.0',
        source_id: sourceId,
        interpretation_run: interpretationId,
        observed_at: record.created_at,
        specificity_score: 0.8,
        source_priority: 0,
        fields: record.properties,
        user_id: userId,
      });

    if (obsError) {
      throw new Error(`Failed to create observation: ${obsError.message}`);
    }

    result.observationsCreated++;
  } else {
    console.log(`  [DRY RUN] Would create observation for entity ${entityId}`);
  }

  // 5. Migrate graph edges
  await migrateGraphEdges(record.id, sourceId, entityId, dryRun, result);

  // 6. Update timeline events
  await migrateTimelineEvents(record.id, sourceId, dryRun, result);

  console.log(`  ✓ Migrated record ${record.id} → source ${sourceId}`);
}

/**
 * Migrate graph edges from record-based to source-based
 */
async function migrateGraphEdges(
  recordId: string,
  sourceId: string,
  entityId: string,
  dryRun: boolean,
  result: MigrationResult
): Promise<void> {
  // Migrate record_entity_edges → source_entity_edges
  const { data: recordEntityEdges } = await supabase
    .from('record_entity_edges')
    .select('*')
    .eq('record_id', recordId);

  if (recordEntityEdges && recordEntityEdges.length > 0) {
    if (!dryRun) {
      for (const edge of recordEntityEdges) {
        const { error } = await supabase
          .from('source_entity_edges')
          .insert({
            source_id: sourceId,
            entity_id: edge.entity_id,
            edge_type: edge.edge_type,
            interpretation_run: null, // Unknown for migrated data
            created_at: edge.created_at,
          });

        if (error) {
          console.warn(`Failed to migrate entity edge: ${error.message}`);
        } else {
          result.graphEdgesMigrated++;
        }
      }
    } else {
      result.graphEdgesMigrated += recordEntityEdges.length;
      console.log(`  [DRY RUN] Would migrate ${recordEntityEdges.length} entity edges`);
    }
  }

  // Migrate record_event_edges → source_event_edges
  const { data: recordEventEdges } = await supabase
    .from('record_event_edges')
    .select('*')
    .eq('record_id', recordId);

  if (recordEventEdges && recordEventEdges.length > 0) {
    if (!dryRun) {
      for (const edge of recordEventEdges) {
        const { error } = await supabase
          .from('source_event_edges')
          .insert({
            source_id: sourceId,
            event_id: edge.event_id,
            edge_type: edge.edge_type,
            created_at: edge.created_at,
          });

        if (error) {
          console.warn(`Failed to migrate event edge: ${error.message}`);
        } else {
          result.graphEdgesMigrated++;
        }
      }
    } else {
      result.graphEdgesMigrated += recordEventEdges.length;
      console.log(`  [DRY RUN] Would migrate ${recordEventEdges.length} event edges`);
    }
  }
}

/**
 * Update timeline events to reference source instead of record
 */
async function migrateTimelineEvents(
  recordId: string,
  sourceId: string,
  dryRun: boolean,
  result: MigrationResult
): Promise<void> {
  const { data: events } = await supabase
    .from('timeline_events')
    .select('id')
    .eq('source_record_id', recordId);

  if (events && events.length > 0) {
    if (!dryRun) {
      const { error } = await supabase
        .from('timeline_events')
        .update({ source_id: sourceId })
        .eq('source_record_id', recordId);

      if (error) {
        console.warn(`Failed to update timeline events: ${error.message}`);
      } else {
        result.timelineEventsMigrated += events.length;
      }
    } else {
      result.timelineEventsMigrated += events.length;
      console.log(`  [DRY RUN] Would update ${events.length} timeline events`);
    }
  }
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);
  
  const options: MigrationOptions = {
    userId: '',
    batchSize: 100,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--user-id':
        options.userId = args[++i];
        break;
      case '--batch-size':
        options.batchSize = parseInt(args[++i], 10);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--start-from':
        options.startFromRecordId = args[++i];
        break;
      case '--help':
        console.log(`
Usage: npm run migrate:records-to-sources -- [options]

Options:
  --user-id <uuid>       User ID to migrate records for (required)
  --batch-size <number>  Number of records to process per batch (default: 100)
  --dry-run              Run without making changes
  --start-from <uuid>    Start from specific record ID (for resuming)
  --help                 Show this help message
        `);
        process.exit(0);
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  if (!options.userId) {
    console.error('Error: --user-id is required');
    process.exit(1);
  }

  try {
    const result = await migrateRecordsToSources(options);
    
    if (result.errors.length > 0) {
      console.error('\nMigration completed with errors');
      process.exit(1);
    } else {
      console.log('\nMigration completed successfully');
      process.exit(0);
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

