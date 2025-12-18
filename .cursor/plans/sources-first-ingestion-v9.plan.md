# Sources-First Ingestion v9 (Final - Production Ready)

> **Status**: Approved for immediate implementation> **Context**: Pre-release greenfield. AI agent execution. No migration.---

## Goals

1. Accept any raw data type without schema friction
2. Content-addressed storage with deterministic deduplication
3. Versioned, auditable interpretation (non-deterministic, but traceable)
4. Corrections via high-priority observations
5. User isolation from day one

---

## Determinism Doctrine

| Component | Deterministic? | Notes ||-----------|----------------|-------|| Content hashing (SHA-256) | Yes | Same bytes = same hash || Deduplication | Yes | Hash + user_id uniqueness || Storage URL generation | Yes | `{user_id}/{content_hash}` || Reducer computation | Yes | Same observations = same snapshot || **AI interpretation** | **No** | Model outputs vary; config logged for audit || **Entity resolution** | **No** | Heuristic matching; may change |**Non-determinism is honest, not hidden.** The system never claims replay determinism for interpretation. Raw sources + interpretation_config enable audit, not exact replay.---

## Architectural Invariants

### 1. Reinterpretation Never Moves Observations

**Rule**: When `reinterpret()` is called, it creates NEW observations linked to a NEW interpretation_run. Old observations from previous runs remain unchanged and linked to their original interpretation_run.

```javascript
Source A
  └─ Interpretation Run 1 (2024-01-01)
  │    └─ Observation X → Entity E1
  └─ Interpretation Run 2 (2024-06-01, new model)
       └─ Observation Y → Entity E1 (same entity, new observation)
```

**Consequence**: Entity E1's snapshot is computed from BOTH observations X and Y via the reducer. The reducer uses `source_priority` and timestamps to resolve conflicts.**Why**: Moving observations would violate immutability and break audit trails.

### 2. Interpretation Output Must Be Schema-Valid

**Rule**: Interpretation service MUST validate extracted fields against `schema_registry` before creating observations.**Handling unknown fields**:

```typescript
async function validateInterpretationOutput(
  entityType: string,
  fields: Record<string, unknown>
): Promise<{ valid: Record<string, unknown>; unknown: Record<string, unknown> }> {
  const schema = await schemaRegistry.loadActiveSchema(entityType);
  const valid: Record<string, unknown> = {};
  const unknown: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (schema.fields[key]) {
      if (validateFieldType(value, schema.fields[key].type)) {
        valid[key] = value;
      } else {
        unknown[key] = value; // Type mismatch → treat as unknown
      }
    } else {
      unknown[key] = value; // Field not in schema
    }
  }

  return { valid, unknown };
}
```

**Unknown field handling**:

- Valid fields → Create observation
- Unknown fields → Store in `raw_fragments` table (preserves data without polluting schema)
```typescript
// Store unknown fields in raw_fragments with interpretation_run_id
async function storeUnknownFields(
  interpretationRunId: string,
  sourceId: string,
  unknownFields: Record<string, unknown>,
  userId: string
): Promise<void> {
  for (const [key, value] of Object.entries(unknownFields)) {
    await supabase.from('raw_fragments').insert({
      interpretation_run_id: interpretationRunId,  // NEW: link to run
      source_id: sourceId,                          // NEW: link to source
      fragment_type: 'unknown_field',
      fragment_key: key,
      fragment_value: value,
      fragment_envelope: { 
        detected_type: typeof value,
        extraction_context: 'interpretation'
      },
      user_id: userId
    });
  }
}
```


**Why**: Unvalidated interpretation output destabilizes reducers and queries. Linking to `interpretation_run_id` enables:

- Tracing which interpretation produced the unknown field
- Re-processing unknown fields when schemas expand
- Auditing extraction behavior over time

### 3. Entity Deduplication is Deferred (Known Limitation)

**Reality**: Heuristic entity resolution may create duplicates:

- "Starbucks" vs "Starbucks #1234" → 2 merchant entities
- Slight date/amount differences → duplicate transactions

**Consequence**: Without merge/alias tools, the system accumulates "fractured truth" - the same real-world entity exists as multiple database entities, each with partial observations.**Current workarounds**:

1. `correct()` tool for manual fixes
2. Provide `external_id` when available (exact match)

**Duplicate Detection Metrics**:

```typescript
// Track potential duplicates for monitoring
const DUPLICATE_METRICS = {
  'entity.potential_duplicates': gauge,      // Entities flagged as potential duplicates
  'entity.duplicate_ratio': gauge,           // potential_duplicates / total_entities
  'entity.new_duplicate_candidates': counter // New candidates detected this period
};

// Weekly job: detect potential duplicates via fuzzy match
async function detectPotentialDuplicates(userId: string): Promise<void> {
  const merchants = await getMerchantEntities(userId);
  const candidates = findSimilarNames(merchants, threshold: 0.85);
  
  logMetric('entity.potential_duplicates', candidates.length, { entity_type: 'merchant' });
  logMetric('entity.duplicate_ratio', candidates.length / merchants.length, { entity_type: 'merchant' });
}
```

**Urgency Threshold**: If `duplicate_ratio > 0.20` (20% of entities are potential duplicates), merge tool becomes P0.**Future**: Merge/alias mechanism for entities (post-launch roadmap, high priority)**Why**: Building deduplication into MVP adds 2-4 weeks. Acceptable trade-off for launch, but metrics ensure visibility into accumulating debt.

### 4. storage_usage Increment is Idempotent

**Rule**: Only increment `storage_usage` when a NEW `sources` row is created, NOT on deduplication hits or retries.

```typescript
async function createSourceWithUsageTracking(
  userId: string,
  contentHash: string,
  byteSize: number,
  // ... other fields
): Promise<{ source: Source; deduplicated: boolean }> {
  return await db.transaction(async (tx) => {
    // Check for existing source (deduplication)
    const existing = await tx.query(
      'SELECT id FROM sources WHERE user_id = $1 AND content_hash = $2',
      [userId, contentHash]
    );

    if (existing.rows.length > 0) {
      // Deduplicated - DO NOT increment usage
      return {
        source: existing.rows[0],
        deduplicated: true
      };
    }

    // New source - increment usage in same transaction
    const source = await tx.query(
      'INSERT INTO sources (...) VALUES (...) RETURNING *',
      [/* ... */]
    );

    await tx.query(
      'SELECT increment_storage_usage($1, $2)',
      [userId, byteSize]
    );

    return {
      source: source.rows[0],
      deduplicated: false
    };
  });
}
```

**Why**: Non-transactional or retry-prone incrementing causes quota drift.---

## Security Model

### RLS Policies

**Read (SELECT)**: User can only read own data via `auth.uid()` match.

```sql
CREATE POLICY "Users read own sources" ON sources
  FOR SELECT USING (user_id = auth.uid());
```

**Write (INSERT/UPDATE/DELETE)**: MCP server uses `service_role` key for all mutations.

```typescript
// MCP server uses service_role client
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// All writes go through service_role (bypasses RLS)
await supabaseAdmin.from('sources').insert({ ... });

// User authentication happens at MCP layer
const userId = await authenticateMCPRequest(request);
// Then userId is explicitly set in the row
await supabaseAdmin.from('sources').insert({ user_id: userId, ... });
```



### Client Access Restrictions

**Explicit rule**: Client-facing Supabase keys (`anon`, `authenticated`) have **SELECT-only** access to these tables:

- `sources`
- `interpretation_runs`
- `observations`
- `entity_snapshots`
- `raw_fragments`

All INSERT/UPDATE/DELETE operations **require `service_role`** and must go through the MCP server. Direct client mutations are blocked by RLS (no INSERT/UPDATE/DELETE policies for non-service roles).**Trust boundary**: MCP server. RLS protects against:

- Direct database access via Supabase client libraries
- SQL injection (if it somehow bypassed MCP)
- Malicious client-side code

### Storage URL Strategy

**Storage URLs are opaque references, not capabilities.**

```typescript
// URLs are NOT signed and NOT exposed to clients
// All reads go through MCP server using service_role

async function getSourceContent(sourceId: string, userId: string): Promise<Buffer> {
  // Verify ownership
  const source = await supabaseAdmin
    .from('sources')
    .select('storage_url')
    .eq('id', sourceId)
    .eq('user_id', userId)
    .single();

  if (!source.data) throw new Error('Not found or unauthorized');

  // Fetch from storage using service_role
  const { data } = await supabaseAdmin.storage
    .from('sources')
    .download(source.data.storage_url);

  return Buffer.from(await data.arrayBuffer());
}
```

**Why**: Signed URLs would expose storage paths and create capability tokens. Service_role reads keep data behind MCP auth.---

## Baseline Schema Assumption

This plan assumes the following tables **already exist** (per current schema.sql):

- `observations` (entity_id, fields, source_priority, user_id)
- `entity_snapshots` (entity_id, snapshot, provenance, user_id)
- `schema_registry` (entity_type, schema_definition, reducer_config)
- `entities` (id, entity_type, canonical_name)
- `raw_fragments` (record_id, fragment_type, fragment_key, fragment_value, frequency_count)

If these don't exist, create them first per `docs/subsystems/schema.md`.

### raw_fragments Migration

The existing `raw_fragments` table references `record_id`. This plan adds new columns to link to the sources-first architecture:

```sql
ALTER TABLE raw_fragments
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES sources(id),
  ADD COLUMN IF NOT EXISTS interpretation_run_id UUID REFERENCES interpretation_runs(id);

CREATE INDEX IF NOT EXISTS idx_fragments_source ON raw_fragments(source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fragments_run ON raw_fragments(interpretation_run_id) WHERE interpretation_run_id IS NOT NULL;
```

**New fragments** from interpretation use `interpretation_run_id` (preferred) or `source_id`. Legacy fragments keep `record_id`.---

## Data Model

### Sources

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



### Interpretation Runs

```sql
CREATE TABLE interpretation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id),
  interpretation_config JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  extracted_entities JSONB DEFAULT '[]',  -- [{entity_id, entity_type}]
  unknown_fields JSONB DEFAULT '{}',      -- Fields that failed schema validation
  confidence NUMERIC(3,2),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  user_id UUID NOT NULL
);

CREATE INDEX idx_runs_source ON interpretation_runs(source_id);
CREATE INDEX idx_runs_status ON interpretation_runs(status);
CREATE INDEX idx_runs_active ON interpretation_runs(source_id) WHERE archived_at IS NULL;

ALTER TABLE interpretation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own runs" ON interpretation_runs
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access" ON interpretation_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```



### Observations Extension

```sql
ALTER TABLE observations 
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES sources(id),
  ADD COLUMN IF NOT EXISTS interpretation_run_id UUID REFERENCES interpretation_runs(id);

CREATE INDEX idx_observations_source ON observations(source_id) WHERE source_id IS NOT NULL;

ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read - observations" ON observations;
CREATE POLICY "Users read own observations" ON observations
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access" ON observations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```



### Entity Snapshots RLS

```sql
ALTER TABLE entity_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read - entity_snapshots" ON entity_snapshots;
CREATE POLICY "Users read own snapshots" ON entity_snapshots
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access" ON entity_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```



### Upload Queue

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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_upload_queue_retry ON upload_queue(next_retry_at) 
  WHERE retry_count < max_retries;
```



### Storage Usage

```sql
CREATE TABLE storage_usage (
  user_id UUID PRIMARY KEY,
  total_bytes BIGINT DEFAULT 0,
  total_sources INTEGER DEFAULT 0,
  last_calculated TIMESTAMPTZ DEFAULT NOW()
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
```

---

## MCP Tools

### ingest()

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
  storage_status: "uploaded" | "pending",
  deduplicated: boolean,
  interpretation?: {
    run_id: string,
    entities: Array<{ entity_id: string, entity_type: string, fields: object }>,
    unknown_fields: object,  // Fields that failed schema validation
    confidence: number
  } | null
}
```



### ingest_structured()

```typescript
ingest_structured({
  entity_type: string,
  properties: object,
  raw_content?: string,
  raw_file_path?: string
})
→ { entity_id: string, observation_id: string, source_id?: string }
```

**Schema validation**: Validates `properties` against `schema_registry`. Rejects with `SCHEMA_VALIDATION_FAILED` if:

- `entity_type` not in registry
- Required fields missing
- Field types don't match schema

### reinterpret()

```typescript
reinterpret({
  source_id: string,
  interpretation_config?: { model?: string, extractor_type?: string }
})
→ {
  run_id: string,
  entities: Array<{ entity_id: string, entity_type: string, fields: object }>,
  unknown_fields: object,
  confidence: number,
  previous_run_id?: string
}
```

**Preconditions**:

1. `storage_status = 'uploaded'` (else `STORAGE_PENDING`)
2. No concurrent run with `status = 'running'` (else `INTERPRETATION_IN_PROGRESS`)

**Invariant**: Creates NEW observations. Does NOT modify or delete observations from previous runs.

### correct()

```typescript
correct({
  entity_id: string,
  field: string,
  value: any,
  reason?: string
})
→ { observation_id: string, priority: 1000 }
```

---

## Entity Resolution

```typescript
async function resolveEntity(
  entityType: string,
  extractedFields: Record<string, unknown>,
  userId: string
): Promise<string> {
  // 1. Exact match on external_id
  if (extractedFields.external_id) {
    const existing = await findEntityByExternalId(
      entityType, 
      extractedFields.external_id, 
      userId
    );
    if (existing) return existing.id;
  }

  // 2. Heuristic match on key fields
  const matchKey = getMatchKey(entityType, extractedFields);
  if (matchKey) {
    const existing = await findEntityByMatchKey(entityType, matchKey, userId);
    if (existing) return existing.id;
  }

  // 3. Create new entity
  return await createEntity(entityType, extractedFields, userId);
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

**Known limitation**: May create duplicates. See [Architectural Invariants](#3-entity-deduplication-is-deferred-known-limitation).---

## Error Codes

```typescript
enum IngestionErrorCode {
  STORAGE_UPLOAD_FAILED = "STORAGE_UPLOAD_FAILED",
  STORAGE_QUOTA_EXCEEDED = "STORAGE_QUOTA_EXCEEDED",
  STORAGE_PENDING = "STORAGE_PENDING",
  UPLOAD_QUEUE_FULL = "UPLOAD_QUEUE_FULL",
  UPLOAD_QUEUE_DISK_FULL = "UPLOAD_QUEUE_DISK_FULL",
  INVALID_CONTENT = "INVALID_CONTENT",
  FILE_TOO_LARGE = "FILE_TOO_LARGE",
  INTERPRETATION_FAILED = "INTERPRETATION_FAILED",
  INTERPRETATION_IN_PROGRESS = "INTERPRETATION_IN_PROGRESS",
  SCHEMA_VALIDATION_FAILED = "SCHEMA_VALIDATION_FAILED"
}
```

---

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

| Metric | Type | Description ||--------|------|-------------|| `storage.upload.latency_ms` | histogram | Upload time || `storage.upload.success_total` | counter | Successful uploads || `storage.upload.failure_total` | counter | Failed uploads || `storage.queue.depth` | gauge | Pending queue items || `storage.queue.disk_available_bytes` | gauge | Available disk for queue || `interpretation.latency_ms` | histogram | Interpretation time || `interpretation.success_total` | counter | Successful interpretations || `interpretation.failure_total` | counter | Failed interpretations || `interpretation.unknown_fields_total` | counter | Fields failing schema validation || `interpretation.generic_entities_total` | counter | Entities created as generic type || `storage_usage.bytes` | gauge | Per-user storage || `entity.potential_duplicates` | gauge | Entities flagged as potential duplicates || `entity.duplicate_ratio` | gauge | Ratio of potential duplicates to total |---

## Background Workers

### Upload Queue Processor

**Deployment**: Supabase Edge Function with cron trigger (every 5 minutes)

```typescript
const RETRY_INTERVALS = [30, 60, 120, 300, 600]; // seconds

export async function processUploadQueue(): Promise<void> {
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



### Archival Job

**Deployment**: Supabase Edge Function with cron trigger (Sunday 3am)

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



### Disk Space Check

```typescript
async function checkQueueDiskSpace(bytes: number): Promise<void> {
  const stats = await fs.statfs(CONFIG.queue.tempDir);
  const available = stats.bavail * stats.bsize;
  
  logMetric('storage.queue.disk_available_bytes', available, {});
  
  if (bytes > available * 0.8) {
    throw new IngestionError({
      code: 'UPLOAD_QUEUE_DISK_FULL',
      message: 'Queue disk space exhausted',
      retryable: true,
      retry_after_seconds: 300
    });
  }
}
```

---

## Quota Enforcement

```typescript
const STORAGE_LIMITS: Record<string, number> = {
  free: 1 * 1024 * 1024 * 1024,      // 1GB
  pro: 50 * 1024 * 1024 * 1024,      // 50GB
  enterprise: Infinity
};

async function checkQuota(userId: string, newBytes: number): Promise<void> {
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
      message: `Storage quota exceeded. Current: ${formatBytes(currentBytes)}, Limit: ${formatBytes(limit)}`,
      retryable: false
    });
  }
}
```

---

## Implementation Phases

### Phase 1: Schema + Storage (1-2 weeks)

1. **Migrations:**

- `sources` table with RLS
- `interpretation_runs` table with RLS (including `unknown_fields` column)
- `upload_queue` table
- `storage_usage` table
- Extend `observations` with source_id, interpretation_run_id
- Extend `raw_fragments` with source_id, interpretation_run_id
- Update RLS on `observations`, `entity_snapshots`, `raw_fragments`

2. **Schema Seeding:**
```bash
npm run seed-schemas
```


Seeds `schema_registry` with base entity types:

- `transaction` (date, amount, description, merchant)
- `merchant` (name, category)
- `invoice` (vendor, amount, date, due_date, items)
- `receipt` (vendor, amount, date, items)
- **`generic`** (fallback type - see below)

**Generic Entity Type (Fallback)**:

```typescript
{
  entity_type: 'generic',
  schema_version: '1.0',
  schema_definition: {
    fields: {
      raw_data: { type: 'jsonb', required: true },
      suggested_type: { type: 'string', required: false },
      extraction_notes: { type: 'string', required: false },
      needs_schema_refinement: { type: 'boolean', required: false, default: true }
    }
  },
  reducer_config: {
    merge_policies: {
      raw_data: { strategy: 'last_write' }
    }
  }
}
```

**Purpose**: When interpretation cannot determine entity type (type not in registry), it creates a `generic` entity instead of only writing to `raw_fragments`. This ensures:

- Ingestion always produces queryable observations
- Users see "untyped" data in their entity list
- Schema governance can later reclassify generic entities

3. **Storage Service:**

- `raw_storage_service.ts`
- SHA-256 hashing
- Supabase Storage upload with retry
- File-based queue for failures with disk space check
- Transactional storage usage tracking (idempotent)

4. **Setup:**

- Create storage bucket `sources` with user-prefix structure
- Create temp directory for queue files
- Deploy Edge Functions (queue processor, archival)

### Phase 2: MCP Tools (2-3 weeks)

1. **Interpretation Service:**

- `interpretation_service.ts`
- Pluggable extractors (PDF, image, JSON, text)
- Concurrent interpretation lock (advisory lock on source_id)
- Multi-entity extraction
- Entity resolution logic
- **Schema validation for interpretation output** (valid → observation, unknown → raw_fragments)

2. **MCP Tools:**

- `ingest()` with all input modes
- `ingest_structured()` with schema validation
- `reinterpret()` with precondition checks + immutability invariant
- `correct()`

3. **Background Workers:**

- Deploy upload queue processor Edge Function (cron: */5 * * * *)
- Deploy archival job Edge Function (cron: 0 3 * * 0)

4. **Monitoring:**

- Instrument all services with metrics logging

### Phase 3: Integration (2 weeks)

**Week 1: Query Updates**

- Update `query_records` MCP tool to return `source_id` in provenance
- Add `get_source(source_id)` tool to retrieve source metadata
- Update entity snapshot queries to include source chain
- Functions to update:
- `queryRecords()` in server.ts
- `getEntitySnapshot()` if exists
- Any search/filter endpoints

**Week 2: Testing + Bug Fixes**

- Run full integration test suite
- Fix bugs discovered in testing
- Performance validation
- Documentation updates

**Total: 5-7 weeks**---

## Testing Strategy

### Fixtures

Create `fixtures/` directory:| File | Purpose ||------|---------|| `invoice.pdf` | Simple 1-page invoice ($1,500, Acme Corp) || `statement.pdf` | Bank statement (5 transactions) || `small.pdf` | <1MB for concurrent upload testing || `large-100mb.pdf` | Exactly 100MB for size limit testing || `corrupted.pdf` | Invalid PDF for error handling |Generate via: `npm run generate-fixtures`

### Unit Tests

```typescript
describe('RawStorageService', () => {
  it('hashes content deterministically');
  it('retries on transient failures');
  it('queues after max retries');
  it('checks disk space before queueing');
  it('increments usage only on new source (not dedup)');
});

describe('InterpretationService', () => {
  it('extracts fields from PDF');
  it('blocks concurrent interpretation');
  it('validates output against schema');
  it('routes unknown fields to raw_fragments');
  it('creates new observations on reinterpret (not modify)');
});
```



### Integration Tests

```typescript
describe('Full Ingestion Flow', () => {
  it('ingest → interpret → query');
  it('reinterpret creates new observations (immutability)');
  it('correction overrides AI extraction');
  it('queue recovers from storage failure');
  it('deduplicated upload does not increment usage');
});
```



### Performance Tests

```typescript
describe('Performance', () => {
  it('handles 10 concurrent uploads in <30s');
  it('uploads 100MB file in <60s');
});
```

---

## Configuration

```typescript
const CONFIG = {
  storage: {
    bucket: 'sources',
    pathTemplate: '{user_id}/{content_hash}',
    maxFileSize: 100 * 1024 * 1024,  // 100MB
  },
  queue: {
    maxItems: 1000,
    maxBytes: 10 * 1024 * 1024 * 1024,  // 10GB
    tempDir: process.env.QUEUE_TEMP_DIR || '/tmp/neotoma-upload-queue',
    retryIntervals: [30, 60, 120, 300, 600],
    diskSpaceThreshold: 0.8,  // Use max 80% of available
  },
  archival: {
    retentionDays: 180,
  },
  quotas: {
    free: 1 * 1024 * 1024 * 1024,
    pro: 50 * 1024 * 1024 * 1024,
    enterprise: Infinity,
  }
};
```

---

## Implementation Order

```javascript
Phase 1 (1-2 weeks):
    1. sources-migration
    2. interpretation-runs-migration
    3. upload-queue-migration
    4. storage-usage-migration
    5. observations-extension
    6. raw-fragments-extension (add source_id, interpretation_run_id)
    7. rls-updates (observations, entity_snapshots, raw_fragments)
    8. schema-seeding (including generic fallback type)
    9. raw-storage-service (with idempotent usage tracking)

Phase 2 (2-3 weeks):
    10. interpretation-service (with schema validation + unknown field routing)
    11. entity-resolution (with generic fallback)
    12. mcp-ingest-tool
    13. mcp-ingest-structured
    14. mcp-reinterpret-tool (with immutability invariant)
    15. mcp-correct-tool
    16. background-workers (Edge Functions)
    17. duplicate-detection-job (weekly)
    18. metrics-instrumentation

Phase 3 (2 weeks):
    19. query-layer-update
    20. integration-tests
    21. performance-tests
    22. bug-fixes
```

---

## Known Limitations

### Entity Deduplication (Deferred)

Entity resolution is heuristic and may create duplicates when:

- Merchant names vary ("Starbucks" vs "Starbucks #1234")
- Dates or amounts differ slightly
- External IDs not provided

**Workarounds:**

1. Use `correct()` to fix individual entities
2. Provide `external_id` when available

**Monitoring**: Weekly duplicate detection job tracks `entity.duplicate_ratio`. If ratio exceeds 20%, merge tool becomes P0.**Roadmap:** Merge/alias mechanism (post-launch, high priority)

### Schema Dependency

If interpretation encounters an entity type not in `schema_registry`:

- Creates `generic` entity with all fields in `raw_data`
- Flags entity with `needs_schema_refinement: true`
- Unknown fields still go to `raw_fragments` for schema discovery

**Long-term**: Schema governance process for adding new types based on `generic` entity patterns and `raw_fragments` frequency.

### Interpretation Non-Determinism

AI interpretation outputs vary between runs. The system logs `interpretation_config` for audit but does NOT guarantee replay determinism.**Mitigation:** Corrections via high-priority observations.---

## Changelog from v8

| Addition | Reason ||----------|--------|| Explicit client access restrictions | Agent: RLS write semantics ambiguous || raw_fragments migration (add source_id, interpretation_run_id) | Agent: Table mismatch with current schema || `generic` fallback entity type | Agent: Schema dependency can block ingestion utility || Duplicate detection metrics + 20% threshold | Agent: Fractured truth needs quantified risk || `storeUnknownFields()` with interpretation_run_id | Agent: Link unknown fields to interpretation run || Schema governance note | Agent: Long-term need for schema expansion process |

## Changelog from v7

| Addition | Reason ||----------|--------|| Reinterpretation immutability invariant | Agent 1: Must never "move" old observations || Schema validation for interpretation output | Agent 1: Unvalidated output destabilizes reducers || Unknown fields → raw_fragments routing | Agent 1: Handle schema-violating fields || RLS write semantics clarified (service_role) | Agent 1: Trust boundary must be explicit || Storage URL strategy (opaque, service_role reads) | Agent 1: URLs are not capabilities || storage_usage idempotency (transactional) | Agent 1: Prevent quota drift || Disk space check for queue | Agent 2: /tmp might be limited || Schema seeding step | Agent 2: What if registry empty? || Fixture documentation | Agent 2: Test fixtures needed |