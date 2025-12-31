# v0.2.3 Migration Guide: .cursor/memory/ to Neotoma

## Overview

This guide details the process for migrating foundation agent memory from the lightweight `.cursor/memory/` directory to Neotoma's unified memory system.

**Why Migrate:**
- Unified memory system for real-world and codebase entities
- Entity resolution and deduplication
- Timeline generation for development history
- Cross-session persistence
- Query capabilities via MCP

**When to Migrate:**
- After v0.2.3 is deployed
- When Neotoma MCP server is confirmed running
- Before removing `.cursor/memory/` fallback

## Pre-Migration

### 1. Verify Prerequisites

#### Check Neotoma Version

```bash
# Verify Neotoma v0.2.3 is installed
npm list neotoma
# Should show: neotoma@0.2.3 or higher
```

#### Confirm MCP Server Running

```bash
# Start MCP server (if not running)
npm run dev:mcp

# Verify MCP server is accessible
curl http://localhost:3000/mcp/health
# Should return: {"status": "ok"}
```

#### Verify Schema Extensions

```typescript
// Test schema extensions are available
const result = await mcpClient.retrieve_records({
  type: "feature_unit",
  limit: 1
});
// Should not error (even if empty results)
```

### 2. Back Up Current Memory

```bash
# Create backup of .cursor/memory/
cp -r .cursor/memory/ .cursor/memory.backup-$(date +%Y%m%d)

# Verify backup
ls -la .cursor/memory.backup-*/
```

### 3. Audit Current Memory Structure

```bash
# List all memory files
find .cursor/memory/ -type f

# Count files by type
find .cursor/memory/ -type f | grep -E '(feature_units|releases|decisions|sessions|validations|codebase|architecture)' | wc -l
```

Example `.cursor/memory/` structure:

```
.cursor/memory/
├── feature_units/
│   ├── FU-061.json
│   ├── FU-062.json
│   └── FU-063.json
├── releases/
│   ├── v0.2.0.json
│   ├── v0.2.1.json
│   └── v0.2.3.json
├── decisions/
│   ├── 20251201-use-neotoma.json
│   └── 20251215-event-sourcing.json
├── sessions/
│   ├── session-abc123.json
│   └── session-def456.json
├── validations/
│   ├── FU-061-test-results.json
│   └── v0.2.3-compliance.json
├── codebase/
│   ├── crypto-subsystem.json
│   └── interpretation-service.json
└── architecture/
    ├── event-sourcing.json
    └── content-addressing.json
```

### 4. Document Field Mappings

Review each entity type and document how fields map from `.cursor/memory/` files to Neotoma schema:

| Memory File | Neotoma Entity Type | Field Mapping Notes |
|-------------|---------------------|---------------------|
| `feature_units/*.json` | `feature_unit` | Direct mapping |
| `releases/*.json` | `release` | Direct mapping |
| `decisions/*.json` | `agent_decision` | May need timestamp extraction from filename |
| `sessions/*.json` | `agent_session` | May need session_id from filename |
| `validations/*.json` | `validation_result` | May need target extraction |
| `codebase/*.json` | `codebase_entity` | May need entity_type inference |
| `architecture/*.json` | `architectural_decision` | May need timestamp extraction |

## Migration Process

### Step 1: Parse Memory Files

Create a migration script to parse `.cursor/memory/` files:

```typescript
// scripts/migrate_memory_to_neotoma.ts
import * as fs from 'fs';
import * as path from 'path';

interface MemoryFile {
  path: string;
  type: string;
  data: any;
}

async function parseMemoryFiles(memoryDir: string): Promise<MemoryFile[]> {
  const files: MemoryFile[] = [];
  
  // Parse feature_units/
  const featureUnitsDir = path.join(memoryDir, 'feature_units');
  if (fs.existsSync(featureUnitsDir)) {
    const featureUnitFiles = fs.readdirSync(featureUnitsDir);
    for (const file of featureUnitFiles) {
      if (file.endsWith('.json')) {
        const data = JSON.parse(
          fs.readFileSync(path.join(featureUnitsDir, file), 'utf-8')
        );
        files.push({
          path: path.join(featureUnitsDir, file),
          type: 'feature_unit',
          data
        });
      }
    }
  }
  
  // Parse releases/
  const releasesDir = path.join(memoryDir, 'releases');
  if (fs.existsSync(releasesDir)) {
    const releaseFiles = fs.readdirSync(releasesDir);
    for (const file of releaseFiles) {
      if (file.endsWith('.json')) {
        const data = JSON.parse(
          fs.readFileSync(path.join(releasesDir, file), 'utf-8')
        );
        files.push({
          path: path.join(releasesDir, file),
          type: 'release',
          data
        });
      }
    }
  }
  
  // Parse decisions/
  const decisionsDir = path.join(memoryDir, 'decisions');
  if (fs.existsSync(decisionsDir)) {
    const decisionFiles = fs.readdirSync(decisionsDir);
    for (const file of decisionFiles) {
      if (file.endsWith('.json')) {
        const data = JSON.parse(
          fs.readFileSync(path.join(decisionsDir, file), 'utf-8')
        );
        files.push({
          path: path.join(decisionsDir, file),
          type: 'agent_decision',
          data
        });
      }
    }
  }
  
  // Parse sessions/
  const sessionsDir = path.join(memoryDir, 'sessions');
  if (fs.existsSync(sessionsDir)) {
    const sessionFiles = fs.readdirSync(sessionsDir);
    for (const file of sessionFiles) {
      if (file.endsWith('.json')) {
        const data = JSON.parse(
          fs.readFileSync(path.join(sessionsDir, file), 'utf-8')
        );
        files.push({
          path: path.join(sessionsDir, file),
          type: 'agent_session',
          data
        });
      }
    }
  }
  
  // Parse validations/
  const validationsDir = path.join(memoryDir, 'validations');
  if (fs.existsSync(validationsDir)) {
    const validationFiles = fs.readdirSync(validationsDir);
    for (const file of validationFiles) {
      if (file.endsWith('.json')) {
        const data = JSON.parse(
          fs.readFileSync(path.join(validationsDir, file), 'utf-8')
        );
        files.push({
          path: path.join(validationsDir, file),
          type: 'validation_result',
          data
        });
      }
    }
  }
  
  // Parse codebase/
  const codebaseDir = path.join(memoryDir, 'codebase');
  if (fs.existsSync(codebaseDir)) {
    const codebaseFiles = fs.readdirSync(codebaseDir);
    for (const file of codebaseFiles) {
      if (file.endsWith('.json')) {
        const data = JSON.parse(
          fs.readFileSync(path.join(codebaseDir, file), 'utf-8')
        );
        files.push({
          path: path.join(codebaseDir, file),
          type: 'codebase_entity',
          data
        });
      }
    }
  }
  
  // Parse architecture/
  const architectureDir = path.join(memoryDir, 'architecture');
  if (fs.existsSync(architectureDir)) {
    const architectureFiles = fs.readdirSync(architectureDir);
    for (const file of architectureFiles) {
      if (file.endsWith('.json')) {
        const data = JSON.parse(
          fs.readFileSync(path.join(architectureDir, file), 'utf-8')
        );
        files.push({
          path: path.join(architectureDir, file),
          type: 'architectural_decision',
          data
        });
      }
    }
  }
  
  return files;
}
```

### Step 2: Map to New Schema

Transform parsed data to match Neotoma schema:

```typescript
function transformToNeotomaSchema(file: MemoryFile): any {
  switch (file.type) {
    case 'feature_unit':
      return {
        id: file.data.id,
        description: file.data.description || file.data.overview,
        status: file.data.status,
        dependencies: file.data.dependencies || [],
        risk_level: file.data.risk_level || file.data.risk,
        created_at: file.data.created_at || file.data.created || new Date().toISOString(),
        updated_at: file.data.updated_at || file.data.updated || new Date().toISOString()
      };
      
    case 'release':
      return {
        id: file.data.id || file.data.release_id,
        version: file.data.version,
        feature_units: file.data.feature_units || file.data.fus || [],
        status: file.data.status,
        acceptance_criteria: file.data.acceptance_criteria || [],
        target_ship_date: file.data.target_ship_date,
        created_at: file.data.created_at || new Date().toISOString(),
        updated_at: file.data.updated_at || new Date().toISOString()
      };
      
    case 'agent_decision':
      // Extract timestamp from filename if not in data
      let timestamp = file.data.timestamp;
      if (!timestamp) {
        const filenameMatch = path.basename(file.path).match(/^(\d{8})/);
        if (filenameMatch) {
          const dateStr = filenameMatch[1];
          timestamp = new Date(
            `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`
          ).toISOString();
        } else {
          timestamp = new Date().toISOString();
        }
      }
      
      return {
        decision: file.data.decision,
        rationale: file.data.rationale,
        context: file.data.context || {},
        decision_type: file.data.decision_type || file.data.type || 'technical',
        timestamp: timestamp,
        agent_id: file.data.agent_id
      };
      
    case 'agent_session':
      // Extract session_id from filename if not in data
      let sessionId = file.data.session_id;
      if (!sessionId) {
        sessionId = path.basename(file.path, '.json').replace(/^session-/, '');
      }
      
      return {
        session_id: sessionId,
        actions: file.data.actions || [],
        checkpoints: file.data.checkpoints || [],
        outcomes: file.data.outcomes || [],
        duration: file.data.duration,
        started_at: file.data.started_at || new Date().toISOString(),
        ended_at: file.data.ended_at
      };
      
    case 'validation_result':
      return {
        validation_type: file.data.validation_type || file.data.type || 'custom',
        status: file.data.status,
        details: file.data.details || {},
        target: file.data.target || extractTargetFromFilename(file.path),
        timestamp: file.data.timestamp || new Date().toISOString()
      };
      
    case 'codebase_entity':
      return {
        entity_type: file.data.entity_type || inferEntityType(file.data),
        name: file.data.name,
        description: file.data.description,
        path: file.data.path,
        relationships: file.data.relationships || []
      };
      
    case 'architectural_decision':
      // Extract timestamp from filename if not in data
      let archTimestamp = file.data.timestamp;
      if (!archTimestamp) {
        archTimestamp = new Date().toISOString();
      }
      
      return {
        decision: file.data.decision,
        rationale: file.data.rationale,
        impact: file.data.impact,
        alternatives: file.data.alternatives || [],
        status: file.data.status || 'accepted',
        timestamp: archTimestamp
      };
      
    default:
      throw new Error(`Unknown file type: ${file.type}`);
  }
}

function extractTargetFromFilename(filepath: string): string {
  const filename = path.basename(filepath, '.json');
  // Extract FU-XXX or vX.X.X from filename
  const fuMatch = filename.match(/FU-\d+/);
  if (fuMatch) return fuMatch[0];
  
  const versionMatch = filename.match(/v\d+\.\d+\.\d+/);
  if (versionMatch) return versionMatch[0];
  
  return filename;
}

function inferEntityType(data: any): string {
  if (data.path && data.path.includes('/services/')) return 'service';
  if (data.path && data.path.includes('/components/')) return 'component';
  if (data.path && data.path.includes('.test.')) return 'module';
  if (data.type) return data.type;
  return 'subsystem';
}
```

### Step 3: Submit via MCP Actions

Submit transformed data to Neotoma:

```typescript
async function migrateToNeotoma(mcpClient: any, files: MemoryFile[]) {
  const results = {
    success: 0,
    failure: 0,
    errors: [] as Array<{ file: string; error: string }>
  };
  
  for (const file of files) {
    try {
      const transformed = transformToNeotomaSchema(file);
      
      switch (file.type) {
        case 'feature_unit':
          await mcpClient.submit_payload({
            capability_id: "neotoma:store_feature_unit:v1",
            body: transformed,
            provenance: {
              source_refs: [],
              extracted_at: new Date().toISOString(),
              extractor_version: "neotoma-mcp:v0.2.3"
            }
          });
          break;
          
        case 'release':
          await mcpClient.submit_payload({
            capability_id: "neotoma:store_release:v1",
            body: transformed,
            provenance: {
              source_refs: [],
              extracted_at: new Date().toISOString(),
              extractor_version: "neotoma-mcp:v0.2.3"
            }
          });
          break;
          
        case 'agent_decision':
          await mcpClient.submit_agent_decision(transformed);
          break;
          
        case 'agent_session':
          await mcpClient.submit_agent_session(transformed);
          break;
          
        case 'validation_result':
        case 'codebase_entity':
        case 'architectural_decision':
          await mcpClient.submit_payload({
            capability_id: 'neotoma:submit_codebase_metadata:v1',
            body: {
              entity_type: file.type,
              data: transformed
            }
          });
          break;
      }
      
      results.success++;
      console.log(`✓ Migrated: ${file.path}`);
    } catch (error) {
      results.failure++;
      results.errors.push({
        file: file.path,
        error: error.message
      });
      console.error(`✗ Failed: ${file.path} - ${error.message}`);
    }
  }
  
  return results;
}
```

### Step 4: Validate Migration

Verify all entities were migrated correctly:

```typescript
async function validateMigration(mcpClient: any, originalFiles: MemoryFile[]) {
  const validation = {
    feature_units: { expected: 0, actual: 0 },
    releases: { expected: 0, actual: 0 },
    agent_decisions: { expected: 0, actual: 0 },
    agent_sessions: { expected: 0, actual: 0 },
    validation_results: { expected: 0, actual: 0 },
    codebase_entities: { expected: 0, actual: 0 },
    architectural_decisions: { expected: 0, actual: 0 }
  };
  
  // Count expected entities
  for (const file of originalFiles) {
    switch (file.type) {
      case 'feature_unit':
        validation.feature_units.expected++;
        break;
      case 'release':
        validation.releases.expected++;
        break;
      case 'agent_decision':
        validation.agent_decisions.expected++;
        break;
      case 'agent_session':
        validation.agent_sessions.expected++;
        break;
      case 'validation_result':
        validation.validation_results.expected++;
        break;
      case 'codebase_entity':
        validation.codebase_entities.expected++;
        break;
      case 'architectural_decision':
        validation.architectural_decisions.expected++;
        break;
    }
  }
  
  // Query actual entities from Neotoma
  for (const entityType of Object.keys(validation)) {
    const result = await mcpClient.retrieve_records({
      entity_type: entityType,
      limit: 1000
    });
    validation[entityType].actual = result.total;
  }
  
  // Report validation results
  console.log('\n=== Migration Validation ===');
  for (const [entityType, counts] of Object.entries(validation)) {
    const status = counts.expected === counts.actual ? '✓' : '✗';
    console.log(`${status} ${entityType}: ${counts.actual}/${counts.expected}`);
  }
  
  return validation;
}
```

### Step 5: Verify Entity Resolution

Test that entity resolution is working correctly:

```typescript
async function verifyEntityResolution(mcpClient: any) {
  console.log('\n=== Verifying Entity Resolution ===');
  
  // Test Feature Unit resolution
  const featureUnits = await mcpClient.query_codebase_entities({
    entity_type: 'feature_unit',
    filters: { id: 'FU-061' }
  });
  
  if (featureUnits.entities.length === 1) {
    console.log('✓ Feature Unit FU-061 resolved to single entity');
  } else {
    console.log(`✗ Feature Unit FU-061 has ${featureUnits.entities.length} entities (expected 1)`);
  }
  
  // Test Release resolution
  const releases = await mcpClient.query_codebase_entities({
    entity_type: 'release',
    filters: { id: 'v0.2.3' }
  });
  
  if (releases.entities.length === 1) {
    console.log('✓ Release v0.2.3 resolved to single entity');
  } else {
    console.log(`✗ Release v0.2.3 has ${releases.entities.length} entities (expected 1)`);
  }
}
```

### Step 6: Verify Timeline Generation

Test that timelines are generated correctly:

```typescript
async function verifyTimelineGeneration(mcpClient: any) {
  console.log('\n=== Verifying Timeline Generation ===');
  
  // Test Feature Unit timeline
  const timeline = await mcpClient.list_timeline_events({
    entity_id: 'FU-061'
  });
  
  console.log(`Feature Unit FU-061 timeline has ${timeline.total} events`);
  
  for (const event of timeline.events) {
    console.log(`  - ${event.timestamp}: ${event.description}`);
  }
}
```

### Complete Migration Script

```typescript
// scripts/migrate_memory_to_neotoma.ts
import { Client } from '@modelcontextprotocol/sdk';

async function main() {
  console.log('=== Neotoma Memory Migration ===\n');
  
  // 1. Initialize MCP client
  const mcpClient = new Client({
    url: 'http://localhost:3000/mcp'
  });
  
  // 2. Parse memory files
  console.log('Parsing .cursor/memory/ files...');
  const files = await parseMemoryFiles('.cursor/memory/');
  console.log(`Found ${files.length} files to migrate\n`);
  
  // 3. Migrate to Neotoma
  console.log('Migrating to Neotoma...');
  const results = await migrateToNeotoma(mcpClient, files);
  console.log(`\nMigration Results:`);
  console.log(`  Success: ${results.success}`);
  console.log(`  Failure: ${results.failure}`);
  
  if (results.errors.length > 0) {
    console.log(`\nErrors:`);
    for (const error of results.errors) {
      console.log(`  - ${error.file}: ${error.error}`);
    }
  }
  
  // 4. Validate migration
  const validation = await validateMigration(mcpClient, files);
  
  // 5. Verify entity resolution
  await verifyEntityResolution(mcpClient);
  
  // 6. Verify timeline generation
  await verifyTimelineGeneration(mcpClient);
  
  console.log('\n=== Migration Complete ===');
}

main().catch(console.error);
```

### Running the Migration

```bash
# Run migration script
npx ts-node scripts/migrate_memory_to_neotoma.ts

# Expected output:
# === Neotoma Memory Migration ===
#
# Parsing .cursor/memory/ files...
# Found 42 files to migrate
#
# Migrating to Neotoma...
# ✓ Migrated: .cursor/memory/feature_units/FU-061.json
# ✓ Migrated: .cursor/memory/feature_units/FU-062.json
# ...
#
# Migration Results:
#   Success: 42
#   Failure: 0
#
# === Migration Validation ===
# ✓ feature_units: 15/15
# ✓ releases: 8/8
# ✓ agent_decisions: 12/12
# ✓ agent_sessions: 5/5
# ✓ validation_results: 2/2
# ✓ codebase_entities: 0/0
# ✓ architectural_decisions: 0/0
#
# === Verifying Entity Resolution ===
# ✓ Feature Unit FU-061 resolved to single entity
# ✓ Release v0.2.3 resolved to single entity
#
# === Verifying Timeline Generation ===
# Feature Unit FU-061 timeline has 4 events
#   - 2025-12-01T00:00:00Z: Feature Unit FU-061 created
#   - 2025-12-05T00:00:00Z: Status changed to in_progress
#   - 2025-12-15T00:00:00Z: Status changed to completed
#   - 2025-12-20T00:00:00Z: Status changed to deployed
#
# === Migration Complete ===
```

## Post-Migration

### 1. Verify Data Integrity

```bash
# Compare counts
find .cursor/memory/feature_units/ -name "*.json" | wc -l
# vs
# Query Neotoma for feature_unit count

# Spot check random entities
npx ts-node -e "
  import { mcpClient } from './src/mcp_client';
  const result = await mcpClient.retrieve_records({
    entity_type: 'feature_unit',
    filters: { id: 'FU-061' }
  });
  console.log(JSON.stringify(result, null, 2));
"
```

### 2. Update Foundation Agents

Remove fallback to `.cursor/memory/`:

```typescript
// Before migration (graceful degradation)
async function storeAgentMemory(data: AgentMemory) {
  if (await isNeotomaAvailable()) {
    // Use Neotoma via MCP (preferred)
    await mcpClient.submit_payload({
      capability_id: "neotoma:submit_agent_decision:v1",
      body: data
    });
  } else {
    // Fallback to lightweight memory
    await writeToLocalMemory(data);
  }
}

// After migration (Neotoma only)
async function storeAgentMemory(data: AgentMemory) {
  await mcpClient.submit_payload({
    capability_id: "neotoma:submit_agent_decision:v1",
    body: data
  });
}
```

### 3. Archive Old Memory

```bash
# Move .cursor/memory/ to archive
mv .cursor/memory/ .cursor/memory.archived-$(date +%Y%m%d)

# Or delete if confident
rm -rf .cursor/memory/

# Keep backup for safety
ls -la .cursor/memory.backup-*/
```

### 4. Monitor Post-Migration

```bash
# Monitor new entity creation
watch -n 5 'curl -s http://localhost:3000/mcp/stats | jq ".entities"'

# Check for errors
tail -f logs/neotoma.log | grep ERROR
```

## Rollback Plan

If migration fails or issues arise:

### 1. Stop Using Neotoma

```typescript
// Revert foundation agents to use .cursor/memory/
async function storeAgentMemory(data: AgentMemory) {
  await writeToLocalMemory(data);
}
```

### 2. Restore Backup

```bash
# Restore from backup
cp -r .cursor/memory.backup-*/ .cursor/memory/

# Verify restoration
find .cursor/memory/ -type f | wc -l
```

### 3. Clear Neotoma Data (Optional)

```bash
# Delete migrated entities (use with caution)
npx ts-node -e "
  import { supabase } from './src/db';
  // Delete observations created during migration
  await supabase
    .from('observations')
    .delete()
    .gte('created_at', '2026-01-15T00:00:00Z'); // Migration date
"
```

## Troubleshooting

### Issue: Entity Count Mismatch

**Symptom**: Expected 15 feature_units, but Neotoma shows 12

**Cause**: Migration script failed on some files

**Solution**:
1. Check migration error log
2. Fix failing files manually
3. Re-run migration script (idempotent)

### Issue: Entity Resolution Not Working

**Symptom**: Multiple entities for same Feature Unit ID

**Cause**: Entity resolution not matching correctly

**Solution**:
1. Check entity IDs in observations
2. Verify schema registry has correct resolution rules
3. Manually merge duplicate entities via `merge_entities()` MCP action

### Issue: Timeline Missing Events

**Symptom**: Timeline has fewer events than expected

**Cause**: Related entities not linked correctly

**Solution**:
1. Verify `context` fields in decisions reference correct entity IDs
2. Re-submit observations with corrected context
3. Check timeline query parameters

### Issue: MCP Server Not Responding

**Symptom**: Migration script hangs or times out

**Cause**: MCP server overloaded or not running

**Solution**:
1. Restart MCP server
2. Increase timeout in migration script
3. Run migration in smaller batches

## Success Criteria

Migration is successful when:

- ✅ All entity counts match (expected vs. actual)
- ✅ Entity resolution working (single entity per ID)
- ✅ Timelines generating correctly
- ✅ No migration errors
- ✅ Foundation agents can query migrated entities
- ✅ Cross-session persistence working
- ✅ `.cursor/memory/` can be safely archived

## Next Steps

After successful migration:

1. Update foundation agent documentation
2. Remove `.cursor/memory/` fallback code
3. Archive `.cursor/memory/` directory
4. Monitor Neotoma usage and performance
5. Train agents on new query patterns

## Support

For migration issues:
- Check migration error log
- Review Neotoma MCP server logs
- Test MCP actions manually
- Consult `docs/releases/v0.2.3/integration_guide.md`
