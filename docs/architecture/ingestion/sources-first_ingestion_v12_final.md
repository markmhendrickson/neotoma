# Sources-First Ingestion v12 (Final - Production Ready)
> **Status**: Approved for immediate implementation
> **Context**: Pre-release greenfield. AI agent execution. No migration.
## Scope
Greenfield build. No migration. AI agent execution via MCP. Uses existing Truth Layer primitives (`observations`, `entity_snapshots`, `schema_registry`, `entities`) and adds sources-first storage + interpretation runs.
## Goals
1. Accept any raw data type without schema friction at ingest time
2. Content-addressed storage with deterministic deduplication
3. Versioned, auditable interpretation (non-deterministic, but traceable)
4. Corrections via high-priority observations
5. User isolation from day one (all tables user-scoped with RLS)
6. Prevent schema pollution from interpretation
7. Bound entity-duplication damage with a minimal merge mechanism
8. Prevent unbounded interpretation costs
## Determinism Doctrine
| Component | Deterministic? | Notes |
|-----------|----------------|-------|
| Content hashing (SHA-256) | Yes | Same bytes = same hash |
| Deduplication | Yes | `(user_id, content_hash)` uniqueness |
| Storage path | Yes | `{user_id}/{content_hash}` |
| Observation creation (given fixed validated fields + entity_id) | Yes | Pure insert |
| Reducer computation | Yes | Same observations + same merge rules → same snapshot |
| Entity merge | Yes | Deterministic rewrite of observations + snapshot recompute |
| AI interpretation | No | Outputs vary; config logged for audit |
| Entity resolution | No | Heuristic; may drift |
**Policy**: The system never claims replay determinism for interpretation.
## Architectural Invariants
### 1. Reinterpretation Never Moves or Deletes Prior Observations
**Rule**: `reinterpret()` always creates a new `interpretation_run` and new observations. Existing observations remain unchanged and linked to their original run.
```
Source A
  └─ Interpretation Run 1 (2024-01-01)
  │    └─ Observation X → Entity E1
  └─ Interpretation Run 2 (2024-06-01, new model)
       └─ Observation Y → Entity E1 (same entity, new observation)
```
**Why**: Moving observations would violate immutability and break audit trails.
### 2. Interpretation Output Must Be Schema-Valid
**Rule**: Interpretation MUST validate extracted fields against `schema_registry` before observation creation. Only **schema-valid fields** are written to observations.
### 3. Unknown/Invalid Fields Are Preserved Durably Without Duplication
**Authoritative store for unknown fields**: `raw_fragments` table.
`interpretation_runs` stores only summary metrics (`unknown_field_count`), not a second copy of unknown field payloads.
### 4. Entity Duplication Is Expected; Merge Tool Is First-Class
Entity resolution is heuristic and will create duplicates. A minimal `merge_entities()` capability exists to repair duplicates deterministically. Merges are flat (no chains), user-scoped.
### 5. Interpretation Has Cost and Time Limits
Interpretation runs are bounded by:
- Monthly quota per user
- Timeout per run (10 minutes)
### 6. All Core Tables Are User-Scoped
Every table containing user data has `user_id` column with RLS:
- `sources`
- `interpretation_runs`
- `observations`
- `entity_snapshots`
- `entities`
- `raw_fragments`
- `entity_merges`
## Data Model
### A. `sources`
```sql
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  storage_status TEXT NOT NULL DEFAULT 'uploaded',
  mime_type TEXT NOT NULL,
  file_name TEXT,
  byte_size INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_agent_id TEXT,
  source_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL,
  CONSTRAINT unique_content_per_user UNIQUE(content_hash, user_id)
);
CREATE INDEX idx_sources_hash ON sources(content_hash);
CREATE INDEX idx_sources_user ON sources(user_id);
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own sources" ON sources
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access" ON sources
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
Storage path convention: `sources/{user_id}/{content_hash}`
### B. `interpretation_runs`
```sql
CREATE TABLE interpretation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id),
  interpretation_config JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  extracted_entities JSONB DEFAULT '[]',
  confidence NUMERIC(3,2),
  unknown_field_count INTEGER NOT NULL DEFAULT 0,
  extraction_completeness TEXT DEFAULT 'unknown' 
    CHECK (extraction_completeness IN ('complete', 'partial', 'failed', 'unknown')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  user_id UUID NOT NULL,
  
  -- Timeout handling
  timeout_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ
);
CREATE INDEX idx_runs_source ON interpretation_runs(source_id);
CREATE INDEX idx_runs_status ON interpretation_runs(status);
CREATE INDEX idx_runs_active ON interpretation_runs(source_id) WHERE archived_at IS NULL;
CREATE INDEX idx_runs_stale ON interpretation_runs(heartbeat_at) 
  WHERE status = 'running';
ALTER TABLE interpretation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own runs" ON interpretation_runs
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access" ON interpretation_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
### C. `entities` Extension (User-Scoped + Merge Tracking)
**Critical**: `entities.id` is TEXT (not UUID) in the baseline schema.
```sql
ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL,
  ADD COLUMN IF NOT EXISTS merged_to_entity_id TEXT REFERENCES entities(id),
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_entities_user ON entities(user_id);
CREATE INDEX IF NOT EXISTS idx_entities_user_type ON entities(user_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_user_type_name ON entities(user_id, entity_type, canonical_name);
CREATE INDEX IF NOT EXISTS idx_entities_merged ON entities(user_id, merged_to_entity_id)
  WHERE merged_to_entity_id IS NOT NULL;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read - entities" ON entities;
CREATE POLICY "Users read own entities" ON entities
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access - entities" ON entities
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
### D. `observations` Extension
```sql
ALTER TABLE observations
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES sources(id),
  ADD COLUMN IF NOT EXISTS interpretation_run_id UUID REFERENCES interpretation_runs(id);
CREATE INDEX IF NOT EXISTS idx_observations_source ON observations(source_id) 
  WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_observations_run ON observations(interpretation_run_id) 
  WHERE interpretation_run_id IS NOT NULL;
ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read - observations" ON observations;
CREATE POLICY "Users read own observations" ON observations
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access" ON observations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
### E. `entity_snapshots` RLS
```sql
ALTER TABLE entity_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read - entity_snapshots" ON entity_snapshots;
CREATE POLICY "Users read own snapshots" ON entity_snapshots
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access" ON entity_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
### F. `raw_fragments` Extension (Authoritative Unknown-Field Store)
```sql
ALTER TABLE raw_fragments
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES sources(id),
  ADD COLUMN IF NOT EXISTS interpretation_run_id UUID REFERENCES interpretation_runs(id),
  ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_fragments_source ON raw_fragments(source_id) 
  WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fragments_run ON raw_fragments(interpretation_run_id) 
  WHERE interpretation_run_id IS NOT NULL;
ALTER TABLE raw_fragments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read - raw_fragments" ON raw_fragments;
CREATE POLICY "Users read own raw_fragments" ON raw_fragments
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access" ON raw_fragments
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
### G. `upload_queue`
```sql
CREATE TABLE upload_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id),
  temp_file_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 5,
  next_retry_at TIMESTAMPTZ DEFAULT NOW(),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL
);
CREATE INDEX idx_upload_queue_retry ON upload_queue(next_retry_at) 
  WHERE retry_count < max_retries;
CREATE INDEX idx_upload_queue_user ON upload_queue(user_id);
```
### H. `storage_usage`
```sql
CREATE TABLE storage_usage (
  user_id UUID PRIMARY KEY,
  total_bytes BIGINT DEFAULT 0,
  total_sources INTEGER DEFAULT 0,
  last_calculated TIMESTAMPTZ DEFAULT NOW(),
  
  -- Interpretation cost controls
  interpretation_count_month INTEGER DEFAULT 0,
  interpretation_limit_month INTEGER DEFAULT 100,
  billing_month TEXT DEFAULT to_char(NOW(), 'YYYY-MM')
);
CREATE OR REPLACE FUNCTION increment_storage_usage(
  p_user_id UUID,
  p_bytes BIGINT
) RETURNS void AS $$
BEGIN
  INSERT INTO storage_usage (user_id, total_bytes, total_sources, last_calculated)
  VALUES (p_user_id, p_bytes, 1, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    total_bytes = storage_usage.total_bytes + p_bytes,
    total_sources = storage_usage.total_sources + 1,
    last_calculated = NOW();
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION increment_interpretation_count(
  p_user_id UUID
) RETURNS void AS $$
DECLARE
  current_billing_month TEXT := to_char(NOW(), 'YYYY-MM');
BEGIN
  INSERT INTO storage_usage (user_id, interpretation_count_month, billing_month)
  VALUES (p_user_id, 1, current_billing_month)
  ON CONFLICT (user_id) DO UPDATE SET
    interpretation_count_month = CASE 
      WHEN storage_usage.billing_month = current_billing_month 
      THEN storage_usage.interpretation_count_month + 1
      ELSE 1
    END,
    billing_month = current_billing_month;
END;
$$ LANGUAGE plpgsql;
```
### I. `entity_merges` (Audit Log)
**Critical**: `from_entity_id` and `to_entity_id` are TEXT (matching `entities.id`).
```sql
CREATE TABLE entity_merges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  from_entity_id TEXT NOT NULL REFERENCES entities(id),
  to_entity_id TEXT NOT NULL REFERENCES entities(id),
  reason TEXT,
  merged_by TEXT NOT NULL,
  observations_rewritten INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT entity_merges_no_self_merge CHECK (from_entity_id <> to_entity_id)
);
-- Unique per user (prevents merge chains within a user's data)
CREATE UNIQUE INDEX idx_entity_merges_from_unique ON entity_merges(user_id, from_entity_id);
CREATE INDEX idx_entity_merges_user ON entity_merges(user_id);
CREATE INDEX idx_entity_merges_to ON entity_merges(user_id, to_entity_id);
ALTER TABLE entity_merges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own entity_merges" ON entity_merges
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access" ON entity_merges
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
## Source Priority Levels
| Source | Priority | Use Case |
|--------|----------|----------|
| AI interpretation | 0 | Automated extraction |
| `ingest_structured()` | 100 | Agent-provided facts |
| `correct()` | 1000 | User corrections (always wins) |
Higher priority wins in reducer conflicts.
## Schema Registry Alignment
### Allowed Field Types
Constrained to existing types: `string | number | date | boolean | array | object`
No `jsonb` type.
### Seeded Schemas (Base)
| Entity Type | Fields |
|-------------|--------|
| `transaction` | date (date), amount (number), description (string), merchant (string), external_id (string, optional) |
| `merchant` | name (string), category (string, optional), external_id (string, optional) |
| `invoice` | vendor (string), amount (number), date (date), due_date (date, optional), items (array, optional) |
| `receipt` | vendor (string), amount (number), date (date), items (array, optional) |
### `generic` Fallback Schema
```typescript
{
  entity_type: 'generic',
  schema_version: '1.0',
  schema_definition: {
    fields: {
      raw_data: { type: 'object', required: true },
      suggested_type: { type: 'string', required: false },
      extraction_notes: { type: 'string', required: false },
      needs_schema_refinement: { type: 'boolean', required: false }
    }
  },
  reducer_config: {
    merge_policies: {
      raw_data: { strategy: 'last_write' }
    }
  }
}
```
## Entity Resolution (User-Scoped)
All entity resolution queries MUST include `user_id`:
```typescript
async function resolveEntity(
  entityType: string,
  extractedFields: Record<string, unknown>,
  userId: string
): Promise<string> {
  // 1. Exact match on external_id (user-scoped)
  if (extractedFields.external_id) {
    const existing = await findEntityByExternalId(
      entityType, 
      extractedFields.external_id, 
      userId  // Always filter by user
    );
    if (existing) return existing.id;
  }
  // 2. Heuristic match on key fields (user-scoped)
  const matchKey = getMatchKey(entityType, extractedFields);
  if (matchKey) {
    const existing = await findEntityByMatchKey(
      entityType, 
      matchKey, 
      userId  // Always filter by user
    );
    if (existing) return existing.id;
  }
  // 3. Create new entity (stamp user_id)
  return await createEntity(entityType, extractedFields, userId);
}
async function findEntityByExternalId(
  entityType: string,
  externalId: string,
  userId: string
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('entities')
    .select('id')
    .eq('entity_type', entityType)
    .eq('external_id', externalId)
    .eq('user_id', userId)
    .is('merged_to_entity_id', null)  // Exclude merged entities
    .single();
  return data;
}
async function findEntityByMatchKey(
  entityType: string,
  matchKey: string,
  userId: string
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('entities')
    .select('id')
    .eq('entity_type', entityType)
    .eq('match_key', matchKey)
    .eq('user_id', userId)
    .is('merged_to_entity_id', null)  // Exclude merged entities
    .single();
  return data;
}
async function createEntity(
  entityType: string,
  fields: Record<string, unknown>,
  userId: string
): Promise<string> {
  const { data } = await supabase
    .from('entities')
    .insert({
      entity_type: entityType,
      canonical_name: fields.name || fields.description || 'Unknown',
      user_id: userId  // Stamp user
    })
    .select('id')
    .single();
  return data.id;
}
function getMatchKey(entityType: string, fields: Record<string, unknown>): string | null {
  switch (entityType) {
    case 'transaction':
      return fields.date && fields.amount && fields.description
        ? `${fields.date}:${fields.amount}:${fields.description}`
        : null;
    case 'merchant':
      return fields.name ? normalizeString(fields.name as string) : null;
    default:
      return null;
  }
}
```
## Interpretation Pipeline
For each extracted entity candidate:
1. Determine `entity_type` (or fall back to `generic` if unknown)
2. Validate fields against schema
3. Resolve entity (user-scoped, excludes merged entities)
4. Write **valid fields** into observation with `source_priority = 0`
5. Write **unknown/type-mismatch fields** into `raw_fragments` with `source_id` + `interpretation_run_id`
6. Increment `interpretation_runs.unknown_field_count`
7. Set `extraction_completeness` based on extraction success
8. Recompute snapshot for affected entities
## MCP Tools
### `ingest()`
```typescript
ingest({
  file_path?: string,
  content?: string,          // Base64, <1MB
  external_url?: string,
  mime_type: string,
  file_name?: string,
  interpret?: boolean,       // Default: true
  interpretation_config?: { model?: string, extractor_type?: string }
})
→ {
  source_id: string,
  content_hash: string,
  storage_status: 'uploaded' | 'pending',
  deduplicated: boolean,
  interpretation?: {
    run_id: string,
    entities: Array<{ entity_id: string, entity_type: string, fields: object }>,
    unknown_field_count: number,
    extraction_completeness: string,
    confidence: number
  } | null
}
```
### `ingest_structured()`
```typescript
ingest_structured({
  entity_type: string,
  properties: object,
  raw_content?: string,
  raw_file_path?: string
})
→ { entity_id: string, observation_id: string, source_id?: string }
```
- Validates against `schema_registry`; rejects on schema violation
- Creates observation with `source_priority = 100`
- Optional raw attachment creates a `source`
### `reinterpret()`
```typescript
reinterpret({
  source_id: string,
  interpretation_config?: { model?: string, extractor_type?: string }
})
→ {
  run_id: string,
  entities: Array<{ entity_id: string, entity_type: string, fields: object }>,
  unknown_field_count: number,
  extraction_completeness: string,
  confidence: number,
  previous_run_id?: string
}
```
**Preconditions**:
1. `storage_status = 'uploaded'` (else `STORAGE_PENDING`)
2. No concurrent run with `status = 'running'` for this source (else `INTERPRETATION_IN_PROGRESS`)
3. User has not exceeded `interpretation_limit_month` (else `INTERPRETATION_QUOTA_EXCEEDED`)
**Invariant**: Creates NEW observations. Never touches prior observations.
### `correct()`
```typescript
correct({
  entity_id: string,
  field: string,
  value: any,
  reason?: string
})
→ { observation_id: string, priority: 1000 }
```
- Validates against schema
- Validates entity belongs to user
- Writes correction observation with `source_priority = 1000`, `specificity_score = 1.0`
### `merge_entities()`
```typescript
merge_entities({
  from_entity_id: string,
  to_entity_id: string,
  reason?: string
})
→ {
  merged: true,
  observations_rewritten: number,
  snapshots_recomputed: string[]
}
```
**Validation**:
```typescript
async function validateMerge(
  fromId: string, 
  toId: string, 
  userId: string
): Promise<void> {
  // 1. Both entities must exist and belong to same user
  const fromEntity = await supabase
    .from('entities')
    .select('id, user_id, merged_to_entity_id')
    .eq('id', fromId)
    .single();
    
  const toEntity = await supabase
    .from('entities')
    .select('id, user_id, merged_to_entity_id')
    .eq('id', toId)
    .single();
  if (!fromEntity.data || !toEntity.data) {
    throw new IngestionError({ code: 'ENTITY_NOT_FOUND' });
  }
  if (fromEntity.data.user_id !== userId || toEntity.data.user_id !== userId) {
    throw new IngestionError({ 
      code: 'ENTITY_ACCESS_DENIED',
      message: 'Cannot merge entities belonging to different users'
    });
  }
  // 2. from_entity must not be already merged
  if (fromEntity.data.merged_to_entity_id) {
    throw new IngestionError({
      code: 'ENTITY_ALREADY_MERGED',
      message: `Entity ${fromId} was already merged to ${fromEntity.data.merged_to_entity_id}`
    });
  }
  // 3. to_entity must not be already merged (prevent merge-to-dead-entity)
  if (toEntity.data.merged_to_entity_id) {
    throw new IngestionError({
      code: 'MERGE_TARGET_ALREADY_MERGED',
      message: `Cannot merge to ${toId}: it was already merged to ${toEntity.data.merged_to_entity_id}`
    });
  }
}
```
**Execution**:
```typescript
async function executeMerge(
  fromId: string,
  toId: string,
  userId: string,
  reason?: string,
  mergedBy: string
): Promise<{ observations_rewritten: number }> {
  return await db.transaction(async (tx) => {
    // 1. Insert audit log
    await tx.query(`
      INSERT INTO entity_merges (user_id, from_entity_id, to_entity_id, reason, merged_by)
      VALUES ($1, $2, $3, $4, $5)
    `, [userId, fromId, toId, reason, mergedBy]);
    // 2. Rewrite observations
    const rewriteResult = await tx.query(`
      UPDATE observations 
      SET entity_id = $1 
      WHERE user_id = $2 AND entity_id = $3
      RETURNING id
    `, [toId, userId, fromId]);
    const observationsRewritten = rewriteResult.rowCount;
    // 3. Mark from_entity as merged
    await tx.query(`
      UPDATE entities 
      SET merged_to_entity_id = $1, merged_at = NOW() 
      WHERE user_id = $2 AND id = $3
    `, [toId, userId, fromId]);
    // 4. Delete stale snapshot for from_entity
    await tx.query(`
      DELETE FROM entity_snapshots 
      WHERE user_id = $1 AND entity_id = $2
    `, [userId, fromId]);
    // 5. Update audit log with count
    await tx.query(`
      UPDATE entity_merges 
      SET observations_rewritten = $1 
      WHERE user_id = $2 AND from_entity_id = $3
    `, [observationsRewritten, userId, fromId]);
    return { observations_rewritten: observationsRewritten };
  });
  // 6. Recompute snapshot for to_entity (outside transaction)
  await recomputeSnapshot(toId, userId);
  logMetric('entity.merges_total', 1, { user_id: userId });
}
```
### `list_untyped_entities()` (Post-Launch)
```typescript
list_untyped_entities({
  limit?: number  // Default: 50
})
→ {
  entities: Array<{
    entity_id: string,
    source_id: string,
    raw_data: object,
    created_at: string
  }>
}
```
## Merged Entity Behavior
### Query Behavior
By default, queries should **exclude merged entities**:
```typescript
async function queryEntities(userId: string, filters: any) {
  return await supabase
    .from('entities')
    .select('*')
    .eq('user_id', userId)
    .is('merged_to_entity_id', null)  // Exclude merged
    .match(filters);
}
```
### Observation Creation
If an observation targets a merged entity, **redirect to the target**:
```typescript
async function createObservation(entityId: string, userId: string, fields: any) {
  // Check if entity is merged
  const entity = await supabase
    .from('entities')
    .select('id, merged_to_entity_id')
    .eq('id', entityId)
    .eq('user_id', userId)
    .single();
  // Redirect if merged
  const targetEntityId = entity.data?.merged_to_entity_id || entityId;
  await supabase.from('observations').insert({
    entity_id: targetEntityId,
    user_id: userId,
    fields,
    // ...
  });
}
```
## Error Codes
```typescript
enum IngestionErrorCode {
  STORAGE_UPLOAD_FAILED = 'STORAGE_UPLOAD_FAILED',
  STORAGE_QUOTA_EXCEEDED = 'STORAGE_QUOTA_EXCEEDED',
  STORAGE_PENDING = 'STORAGE_PENDING',
  UPLOAD_QUEUE_FULL = 'UPLOAD_QUEUE_FULL',
  UPLOAD_QUEUE_DISK_FULL = 'UPLOAD_QUEUE_DISK_FULL',
  INVALID_CONTENT = 'INVALID_CONTENT',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INTERPRETATION_FAILED = 'INTERPRETATION_FAILED',
  INTERPRETATION_IN_PROGRESS = 'INTERPRETATION_IN_PROGRESS',
  INTERPRETATION_QUOTA_EXCEEDED = 'INTERPRETATION_QUOTA_EXCEEDED',
  INTERPRETATION_TIMEOUT = 'INTERPRETATION_TIMEOUT',
  SCHEMA_VALIDATION_FAILED = 'SCHEMA_VALIDATION_FAILED',
  ENTITY_NOT_FOUND = 'ENTITY_NOT_FOUND',
  ENTITY_ACCESS_DENIED = 'ENTITY_ACCESS_DENIED',
  ENTITY_ALREADY_MERGED = 'ENTITY_ALREADY_MERGED',
  MERGE_TARGET_ALREADY_MERGED = 'MERGE_TARGET_ALREADY_MERGED'
}
```
## Security Model
- **RLS**: Client keys (`anon`, `authenticated`) have SELECT-only access. No write policies for non-service roles.
- **MCP Server**: All mutations via `service_role`. User identity enforced at MCP layer and stamped into rows.
- **Storage URLs**: Opaque, never returned to clients. Reads go through MCP server + ownership check.
- **Cross-User Prevention**: All operations validate `user_id` match. Merge cannot cross users.
## Monitoring
```typescript
function logMetric(name: string, value: number, tags: Record<string, string>) {
  console.log(JSON.stringify({
    metric: name,
    value,
    tags,
    timestamp: new Date().toISOString()
  }));
}
```
| Metric | Type | Description |
|--------|------|-------------|
| `storage.upload.latency_ms` | histogram | Upload time |
| `storage.upload.success_total` | counter | Successful uploads |
| `storage.upload.failure_total` | counter | Failed uploads |
| `storage.queue.depth` | gauge | Pending queue items |
| `storage.queue.disk_available_bytes` | gauge | Available disk for queue |
| `interpretation.latency_ms` | histogram | Interpretation time |
| `interpretation.success_total` | counter | Successful interpretations |
| `interpretation.failure_total` | counter | Failed interpretations |
| `interpretation.timeout_total` | counter | Timed out interpretations |
| `interpretation.unknown_fields_total` | counter | Fields failing schema validation |
| `interpretation.generic_entities_total` | counter | Entities created as generic type |
| `interpretation.quota_exceeded_total` | counter | Quota exceeded rejections |
| `storage_usage.bytes` | gauge | Per-user storage |
| `entity.potential_duplicates` | gauge | Entities flagged as potential duplicates |
| `entity.duplicate_ratio` | gauge | Ratio of potential duplicates to total |
| `entity.merges_total` | counter | Entity merges performed |
## Background Workers
### Upload Queue Processor
**Trigger**: Cron every 5 minutes
```typescript
export async function processUploadQueue(): Promise<void> {
  const RETRY_INTERVALS = [30, 60, 120, 300, 600];
  
  const pending = await supabase
    .from('upload_queue')
    .select('*')
    .lte('next_retry_at', new Date().toISOString())
    .lt('retry_count', 5)
    .order('next_retry_at')
    .limit(10);
  for (const item of pending.data ?? []) {
    try {
      const content = await fs.readFile(item.temp_file_path);
      const url = await uploadToStorage(content, item.source_id, item.content_hash);
      await supabase
        .from('sources')
        .update({ storage_url: url, storage_status: 'uploaded' })
        .eq('id', item.source_id);
      await supabase.from('upload_queue').delete().eq('id', item.id);
      await fs.unlink(item.temp_file_path).catch(() => {});
      logMetric('storage.queue.processed', 1, { status: 'success' });
    } catch (error) {
      const nextRetry = RETRY_INTERVALS[item.retry_count] ?? 600;
      await supabase
        .from('upload_queue')
        .update({
          retry_count: item.retry_count + 1,
          next_retry_at: new Date(Date.now() + nextRetry * 1000).toISOString(),
          error_message: error.message
        })
        .eq('id', item.id);
      if (item.retry_count + 1 >= 5) {
        await supabase
          .from('sources')
          .update({ storage_status: 'failed' })
          .eq('id', item.source_id);
        await fs.unlink(item.temp_file_path).catch(() => {});
      }
      logMetric('storage.queue.processed', 1, { status: 'failure' });
    }
  }
}
```
### Stale Interpretation Cleanup
**Trigger**: Cron every 5 minutes
```typescript
export async function cleanupStaleInterpretations(): Promise<void> {
  const TIMEOUT_MINUTES = 10;
  const cutoff = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000);
  const { data, count } = await supabase
    .from('interpretation_runs')
    .update({ 
      status: 'failed', 
      error_message: 'Timeout - no heartbeat',
      completed_at: new Date().toISOString()
    })
    .eq('status', 'running')
    .lt('heartbeat_at', cutoff.toISOString())
    .select('id');
  if (count && count > 0) {
    logMetric('interpretation.timeout_total', count, {});
  }
}
```
### Archival Job
**Trigger**: Cron weekly (Sunday 3am)
```typescript
export async function archiveOldRuns(): Promise<void> {
  const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  
  const { count } = await supabase
    .from('interpretation_runs')
    .update({ archived_at: new Date().toISOString() })
    .lt('created_at', cutoff.toISOString())
    .is('archived_at', null);
  logMetric('archival.runs_archived', count ?? 0, {});
}
```
### Duplicate Detection
**Trigger**: Cron weekly
```typescript
export async function detectPotentialDuplicates(): Promise<void> {
  // Per-user duplicate detection for merchants
  const users = await supabase
    .from('entities')
    .select('user_id')
    .is('merged_to_entity_id', null)  // Only active entities
    .distinct();
  
  for (const { user_id } of users.data ?? []) {
    const merchants = await supabase
      .from('entities')
      .select('id, canonical_name')
      .eq('entity_type', 'merchant')
      .eq('user_id', user_id)
      .is('merged_to_entity_id', null);
    const candidates = findSimilarNames(merchants.data ?? [], 0.85);
    
    logMetric('entity.potential_duplicates', candidates.length, { 
      entity_type: 'merchant',
      user_id 
    });
    
    const ratio = candidates.length / (merchants.data?.length || 1);
    logMetric('entity.duplicate_ratio', ratio, { 
      entity_type: 'merchant',
      user_id 
    });
  }
}
```
## Quota Enforcement
### Storage Quota
```typescript
const STORAGE_LIMITS: Record<string, number> = {
  free: 1 * 1024 * 1024 * 1024,      // 1GB
  pro: 50 * 1024 * 1024 * 1024,      // 50GB
  enterprise: Infinity
};
async function checkStorageQuota(userId: string, newBytes: number): Promise<void> {
  const usage = await supabase
    .from('storage_usage')
    .select('total_bytes')
    .eq('user_id', userId)
    .single();
  const currentBytes = usage.data?.total_bytes ?? 0;
  const limit = await getUserStorageLimit(userId);
  if (currentBytes + newBytes > limit) {
    throw new IngestionError({
      code: 'STORAGE_QUOTA_EXCEEDED',
      message: `Storage quota exceeded. Current: ${formatBytes(currentBytes)}, Limit: ${formatBytes(limit)}`
    });
  }
}
```
### Interpretation Quota
```typescript
const INTERPRETATION_LIMITS: Record<string, number> = {
  free: 100,
  pro: 1000,
  enterprise: Infinity
};
async function checkInterpretationQuota(userId: string): Promise<void> {
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  
  const usage = await supabase
    .from('storage_usage')
    .select('interpretation_count_month, interpretation_limit_month, billing_month')
    .eq('user_id', userId)
    .single();
  const count = usage.data?.billing_month === currentMonth 
    ? usage.data.interpretation_count_month 
    : 0;
  const limit = usage.data?.interpretation_limit_month ?? INTERPRETATION_LIMITS.free;
  if (count >= limit) {
    throw new IngestionError({
      code: 'INTERPRETATION_QUOTA_EXCEEDED',
      message: `Interpretation quota exceeded. Used: ${count}/${limit} this month`
    });
  }
}
```
## Implementation Phases
### Phase 1: Schema + Storage (1-2 weeks)
**Migrations:**
- `sources` table with RLS
- `interpretation_runs` table with timeout/heartbeat columns
- `upload_queue` table
- `storage_usage` table with interpretation quotas
- `entity_merges` table (TEXT IDs, user-scoped unique index)
- Extend `entities` with user_id, merged_to_entity_id, merged_at + RLS
- Extend `observations` with source_id, interpretation_run_id
- Extend `raw_fragments` with source_id, interpretation_run_id, user_id
- Update RLS on `observations`, `entity_snapshots`, `raw_fragments`
**Schema Seeding:**
- Base types: transaction, merchant, invoice, receipt
- Generic fallback type (using `object`, not `jsonb`)
**Storage Service:**
- `raw_storage_service.ts`
- SHA-256 hashing
- Supabase Storage upload with retry
- File-based queue for failures with disk space check
- Transactional storage usage tracking (idempotent)
**Setup:**
- Create storage bucket `sources` with user-prefix structure
- Create temp directory for queue files
### Phase 2: MCP Tools + Workers (2-3 weeks)
**Interpretation Service:**
- Schema filtering (valid → observation, unknown → raw_fragments)
- Multi-entity extraction
- Advisory lock on source_id
- Heartbeat updates during long-running interpretation
- Extraction completeness tracking
- User-scoped entity resolution
**MCP Tools:**
- `ingest()` with quota check
- `ingest_structured()` with schema validation
- `reinterpret()` with quota + timeout handling
- `correct()` with schema validation + entity ownership check
- `merge_entities()` with validation + cascade updates + same-user check
**Background Workers:**
- Upload queue processor (every 5 min)
- Stale interpretation cleanup (every 5 min)
- Archival job (weekly)
- Duplicate detection (weekly, user-scoped)
**Monitoring:**
- Instrument all services with metrics logging
### Phase 3: Integration + Testing (2 weeks)
**Query Updates:**
- Update `query_records` to return `source_id` in provenance
- Add `get_source_metadata(source_id)` (no storage URL exposure)
- Update entity snapshot queries to include source chain
- Exclude merged entities from default queries
- Redirect observations to merged entity target
**Testing:**
- Unit tests: schema filtering, unknown routing, idempotent usage
- Integration tests: full ingest → query flow, reinterpret immutability, merge behavior
- Merge tests: cross-user prevention, merged entity redirect/exclusion
- Performance tests: concurrent uploads, large files
- Timeout tests: verify stale cleanup works
**Total: 5-7 weeks**
## Testing Strategy
### Unit Tests
```typescript
describe('InterpretationService', () => {
  it('validates fields against schema before creating observation');
  it('routes unknown fields to raw_fragments only (not interpretation_runs)');
  it('increments unknown_field_count correctly');
  it('creates new observations on reinterpret (never modifies existing)');
  it('updates heartbeat during long-running interpretation');
  it('resolves entities with user_id filter');
  it('excludes merged entities from resolution');
});
describe('MergeService', () => {
  it('rewrites all observations from from_entity to to_entity');
  it('recomputes snapshot for to_entity');
  it('marks from_entity as merged');
  it('deletes snapshot for from_entity');
  it('prevents circular merges');
  it('prevents merging already-merged entities');
  it('prevents cross-user merges');
  it('logs merge in entity_merges audit table');
});
describe('QuotaService', () => {
  it('rejects interpretation when monthly quota exceeded');
  it('resets quota count on new billing month');
  it('increments interpretation count atomically');
});
```
### Integration Tests
```typescript
describe('Full Ingestion Flow', () => {
  it('ingest → interpret → query with provenance');
  it('reinterpret creates new observations (immutability)');
  it('correction overrides AI extraction');
  it('unknown fields stored only in raw_fragments');
  it('merge_entities rewrites observations and recomputes snapshot');
  it('merged entities excluded from default queries');
  it('observations redirect to merged entity target');
  it('stale interpretation cleanup marks timed-out runs as failed');
  it('cannot merge entities across users');
});
```
## Known Limitations
1. **Entity resolution remains heuristic**: Merges are manual/agent-driven
2. **`generic` entities are visibility mechanism**: Not a substitute for schema design
3. **Interpretation is non-deterministic**: Auditability is the guarantee, not replay
4. **Merge chains not supported**: Each entity can only be merged once (flat merges only)
5. **Relationships/timeline_events**: Out of scope unless they become user-scoped
## Changelog from v11
| Change | Reason |
|--------|--------|
| `entity_merges.from_entity_id` and `to_entity_id` as TEXT | Type consistency with `entities.id` (TEXT, not UUID) |
| `(user_id, from_entity_id)` unique index | Prevent merge chains per-user, not globally |
| `entities.user_id` column + RLS | User isolation for entities (was missing) |
| User-scoped entity resolution queries | Prevent cross-user entity matching |
| Same-user validation in `merge_entities()` | Prevent cross-user merges |
| Exclude merged entities from queries | Merged entities should be hidden |
| Redirect observations to merged target | Observations shouldn't target dead entities |
| `ENTITY_ACCESS_DENIED` error code | Clear error for cross-user attempts |
| `idx_entities_user_type_name` index | Efficient entity resolution |
