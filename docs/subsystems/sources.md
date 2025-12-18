# Neotoma Sources-First Architecture

_(Content-Addressed Storage and Versioned Interpretation)_

---

## Purpose

This document defines the **sources-first ingestion architecture**. It specifies:

- Content-addressed raw storage
- Versioned interpretation runs
- Deduplication strategy
- Provenance chain
- Correction mechanism
- Quota enforcement

The sources-first architecture decouples raw content storage from interpretation, enabling reinterpretation, auditability, and cost control.

---

## Scope

This document covers:

- `sources` table structure and semantics
- `interpretation_runs` table structure and semantics
- Content-addressed storage with SHA-256 hashing
- Deduplication via `(user_id, content_hash)` uniqueness
- Interpretation immutability (reinterpretation creates NEW observations)
- Storage and interpretation quotas
- Upload queue for resilient storage

This document does NOT cover:

- Observation creation (see `docs/subsystems/observation_architecture.md`)
- Entity resolution (see `docs/subsystems/ingestion/ingestion.md`)
- Entity merge (see `docs/subsystems/entity_merge.md`)

---

## 1. Architecture Overview

### 1.1 Data Flow

```
Raw Content → Sources → Interpretation Runs → Observations → Entity Snapshots
```

**Layers:**

1. **Sources**: Raw content stored with content hash for deduplication
2. **Interpretation Runs**: Versioned interpretation attempts with config logging
3. **Observations**: Granular facts extracted from sources (via interpretation runs)
4. **Entity Snapshots**: Deterministic reducer output

### 1.2 Key Principles

| Principle | Description |
|-----------|-------------|
| Content-Addressed | Same bytes = same hash; deduplication per user |
| Immutable Sources | Raw content never modified after storage |
| Versioned Interpretation | Each interpretation creates a new run record |
| Observation Immutability | Reinterpretation creates NEW observations; never modifies existing |
| User Isolation | All tables user-scoped with RLS |
| Auditability | Interpretation config logged; can understand how data was extracted |

---

## 2. Sources Table

### 2.1 Schema

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
```

### 2.2 Content Hashing

Content hash is computed using SHA-256:

```typescript
import { createHash } from 'crypto';

function computeContentHash(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}
```

**Determinism:** Same bytes always produce the same hash.

### 2.3 Storage Path Convention

```
sources/{user_id}/{content_hash}
```

Example: `sources/usr_abc123/a1b2c3d4e5f6...`

### 2.4 Storage Status

| Status | Meaning |
|--------|---------|
| `uploaded` | Content successfully stored in object storage |
| `pending` | Initial upload failed; queued for retry |
| `failed` | All retries exhausted; content not available |

### 2.5 Deduplication

Per-user deduplication via `(user_id, content_hash)` unique constraint:

```typescript
async function ingestSource(content: Buffer, userId: string): Promise<Source> {
  const hash = computeContentHash(content);
  
  // Check for existing source
  const existing = await supabase
    .from('sources')
    .select('id')
    .eq('content_hash', hash)
    .eq('user_id', userId)
    .single();
  
  if (existing.data) {
    return { ...existing.data, deduplicated: true };
  }
  
  // Create new source
  // ...
}
```

---

## 3. Interpretation Runs Table

### 3.1 Schema

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
  extraction_completeness TEXT DEFAULT 'unknown',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  user_id UUID NOT NULL,
  timeout_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ
);
```

### 3.2 Interpretation Config

The `interpretation_config` JSONB field stores all parameters needed to understand how interpretation was performed:

```json
{
  "model": "gpt-4o-mini",
  "model_version": "2024-01-15",
  "extractor_type": "rule_based",
  "extractor_version": "1.2.0",
  "prompt_version": "v3",
  "temperature": 0,
  "schema_version": "1.0"
}
```

**Purpose:** Enables audit ("why was this extracted this way?") without guaranteeing replay determinism.

### 3.3 Interpretation Status

| Status | Meaning |
|--------|---------|
| `pending` | Run created, not yet started |
| `running` | Interpretation in progress |
| `completed` | Interpretation finished successfully |
| `failed` | Interpretation failed (see `error_message`) |

### 3.4 Timeout Handling

Long-running interpretations are bounded by timeout:

- `timeout_at`: When the run should be considered stale
- `heartbeat_at`: Last heartbeat from the interpretation process

Background worker marks runs as `failed` if `heartbeat_at` is too old:

```typescript
async function cleanupStaleInterpretations(): Promise<void> {
  const TIMEOUT_MINUTES = 10;
  const cutoff = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000);

  await supabase
    .from('interpretation_runs')
    .update({ 
      status: 'failed', 
      error_message: 'Timeout - no heartbeat',
      completed_at: new Date().toISOString()
    })
    .eq('status', 'running')
    .lt('heartbeat_at', cutoff.toISOString());
}
```

---

## 4. Determinism Doctrine

### 4.1 What Is Deterministic

| Component | Deterministic? | Notes |
|-----------|----------------|-------|
| Content hashing (SHA-256) | **Yes** | Same bytes = same hash |
| Deduplication | **Yes** | `(user_id, content_hash)` uniqueness |
| Storage path | **Yes** | `{user_id}/{content_hash}` |
| Observation creation (given fixed validated fields + entity_id) | **Yes** | Pure insert |
| Reducer computation | **Yes** | Same observations + same merge rules → same snapshot |

### 4.2 What Is NOT Deterministic

| Component | Deterministic? | Notes |
|-----------|----------------|-------|
| AI interpretation | **No** | Outputs vary; config logged for audit |
| Entity resolution (heuristic) | **No** | May drift; duplicates expected |

**Policy:** Neotoma never claims replay determinism for AI interpretation. Interpretation config is logged for audit, but outputs may vary across runs.

---

## 5. Reinterpretation

### 5.1 Immutability Invariant

**Rule:** `reinterpret()` always creates a new `interpretation_run` and new observations. Existing observations remain unchanged and linked to their original run.

```
Source A
  └─ Interpretation Run 1 (2024-01-01)
  │    └─ Observation X → Entity E1
  └─ Interpretation Run 2 (2024-06-01, new model)
       └─ Observation Y → Entity E1 (same entity, new observation)
```

### 5.2 MCP Tool

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

**Preconditions:**

1. `storage_status = 'uploaded'` (else `STORAGE_PENDING`)
2. No concurrent run with `status = 'running'` for this source (else `INTERPRETATION_IN_PROGRESS`)
3. User has not exceeded `interpretation_limit_month` (else `INTERPRETATION_QUOTA_EXCEEDED`)

---

## 6. Quota Enforcement

### 6.1 Storage Quota

```typescript
const STORAGE_LIMITS: Record<string, number> = {
  free: 1 * 1024 * 1024 * 1024,      // 1GB
  pro: 50 * 1024 * 1024 * 1024,      // 50GB
  enterprise: Infinity
};
```

### 6.2 Interpretation Quota

```typescript
const INTERPRETATION_LIMITS: Record<string, number> = {
  free: 100,     // 100 interpretations/month
  pro: 1000,     // 1000 interpretations/month
  enterprise: Infinity
};
```

### 6.3 Usage Tracking

```sql
CREATE TABLE storage_usage (
  user_id UUID PRIMARY KEY,
  total_bytes BIGINT DEFAULT 0,
  total_sources INTEGER DEFAULT 0,
  last_calculated TIMESTAMPTZ DEFAULT NOW(),
  interpretation_count_month INTEGER DEFAULT 0,
  interpretation_limit_month INTEGER DEFAULT 100,
  billing_month TEXT DEFAULT to_char(NOW(), 'YYYY-MM')
);
```

Interpretation quota resets monthly based on `billing_month`.

---

## 7. Upload Queue

### 7.1 Purpose

Handle transient storage failures without blocking ingestion:

1. Attempt upload to object storage
2. If failure, queue to `upload_queue` with `storage_status = 'pending'`
3. Background worker retries with exponential backoff
4. On success, update `storage_status = 'uploaded'`
5. On final failure, update `storage_status = 'failed'`

### 7.2 Schema

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
```

### 7.3 Retry Intervals

Exponential backoff: 30s, 60s, 120s, 300s, 600s

---

## 8. MCP Tools

### 8.1 `ingest()`

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

### 8.2 `ingest_structured()`

For pre-structured data (bypasses AI interpretation):

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

### 8.3 `correct()`

For user corrections:

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
- Creates correction observation with `source_priority = 1000`, `specificity_score = 1.0`

---

## 9. Security Model

- **RLS**: Client keys (`anon`, `authenticated`) have SELECT-only access
- **MCP Server**: All mutations via `service_role`; user identity stamped into rows
- **Storage URLs**: Opaque, never returned to clients; reads via MCP server + ownership check
- **Cross-User Prevention**: All operations validate `user_id` match

---

## Related Documents

- [`docs/subsystems/schema.md`](./schema.md) — Database schema (includes sources, interpretation_runs tables)
- [`docs/subsystems/observation_architecture.md`](./observation_architecture.md) — Observation layer
- [`docs/subsystems/ingestion/ingestion.md`](./ingestion/ingestion.md) — Ingestion pipeline
- [`docs/subsystems/entity_merge.md`](./entity_merge.md) — Entity merge mechanism
- [`docs/architecture/determinism.md`](../architecture/determinism.md) — Determinism doctrine

---

## Agent Instructions

### When to Load This Document

Load `docs/subsystems/sources.md` when:

- Implementing source storage or retrieval
- Working with interpretation runs
- Implementing deduplication logic
- Understanding provenance chain
- Implementing quota enforcement
- Working with upload queue

### Constraints Agents Must Enforce

1. **Content hash MUST use SHA-256**
2. **Deduplication MUST be per-user** (`user_id, content_hash` uniqueness)
3. **Reinterpretation MUST create NEW observations** (never modify existing)
4. **Storage URLs MUST NOT be exposed to clients**
5. **Quota MUST be checked before interpretation**
6. **All tables MUST have RLS enabled**

### Forbidden Patterns

- Modifying existing observations during reinterpretation
- Exposing storage URLs to clients
- Skipping quota checks
- Cross-user source access
- Deleting interpretation runs (archive instead)

