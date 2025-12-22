# Neotoma Sources-First Architecture

_(Content-Addressed Storage and Versioned Interpretation)_

---

## Purpose

This document defines the **sources-first ingestion architecture**. It specifies:

- Content-addressed raw storage
- Versioned interpretations
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
Raw Content → Sources → Interpretations → Observations → Entity Snapshots
```

**Layers:**

1. **Sources**: Raw content stored with content hash for deduplication
2. **Interpretations**: Versioned interpretation attempts with config logging (stored in `interpretation_runs` table)
3. **Observations**: Granular facts extracted from sources (via interpretations)
4. **Entity Snapshots**: Deterministic reducer output

### 1.2 Key Principles

| Principle | Description |
|-----------|-------------|
| Content-Addressed | Same bytes = same hash; deduplication per user |
| Immutable Sources | Raw content never modified after storage |
| Versioned Interpretation | Each interpretation creates a new interpretation record |
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

## 3. Interpretations Table (`interpretation_runs`)

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
  user_id UUID NOT NULL
);
```

**Note:** `timeout_at` and `heartbeat_at` columns are deferred to v0.3.0 (see Section 7.3).

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
| `pending` | Interpretation created, not yet started |
| `running` | Interpretation in progress |
| `completed` | Interpretation finished successfully |
| `failed` | Interpretation failed (see `error_message`) |

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

**Rule:** `reinterpret()` always creates a new interpretation and new observations. Existing observations remain unchanged and linked to their original interpretation.

```
Source A
  └─ Interpretation 1 (2024-01-01)
  │    └─ Observation X → Entity E1
  └─ Interpretation 2 (2024-06-01, new model)
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
2. No concurrent interpretation with `status = 'running'` for this source (else `INTERPRETATION_IN_PROGRESS`)
3. User has not exceeded `interpretation_limit_month` (else `INTERPRETATION_QUOTA_EXCEEDED`)

---

## 6. Quota Enforcement (v0.2.0: Simple Hard-Coded Limit)

### 6.1 Interpretation Quota (Soft Limit)

In v0.2.0, quota enforcement is minimal:

```typescript
const INTERPRETATION_LIMIT = 100; // Hard-coded global limit per month

async function checkQuota(userId: string): Promise<boolean> {
  const count = await countInterpretationsThisMonth(userId);
  
  if (count >= INTERPRETATION_LIMIT) {
    logger.warn(`User ${userId} exceeded interpretation quota: ${count}/${INTERPRETATION_LIMIT}`);
    // Soft limit: log warning but allow (for now)
  }
  
  return true; // Always allow in v0.2.0
}
```

**Rationale:** Simple quota check validates the pattern before investing in strict enforcement.

### 6.2 Storage Quota

No storage quota enforcement in v0.2.0. Uploads always succeed (if storage backend succeeds).

### 6.3 Deferred: Strict Quota Enforcement

**See Section 7.2** for v0.3.0 plans:
- `storage_usage` table with per-user tracking
- Strict enforcement (reject on exceed)
- Per-plan limits (free, pro, enterprise)
- Billing month reset automation

---

## 7. Deferred Features (v0.3.0 Operational Hardening)

The following features are intentionally deferred to v0.3.0 to keep v0.2.0 minimal:

### 7.1 Upload Queue + Async Retry

**Deferred to v0.3.0.** In v0.2.0, storage uploads are synchronous only. If upload fails, ingestion fails (no queue fallback).

**v0.3.0 will add:**
- `upload_queue` table for async retry
- Background worker with exponential backoff
- `storage_status = 'pending'` support

### 7.2 Storage Usage Tracking

**Deferred to v0.3.0.** In v0.2.0, quota enforcement is simple: hard-coded soft limit with logging only.

**v0.3.0 will add:**
- `storage_usage` table with per-user byte tracking
- Strict quota enforcement (reject on exceed)
- Billing month reset automation

### 7.3 Interpretation Timeout Handling

**Deferred to v0.3.0.** In v0.2.0, interpretation runs have no timeout columns or heartbeat monitoring.

**v0.3.0 will add:**
- `timeout_at`, `heartbeat_at` columns to `interpretation_runs`
- Stale interpretation cleanup worker
- Automatic failure marking for hung jobs

**Rationale:** Validate the core ingestion + correction loop before adding operational complexity.

---

## 8. MCP Tools (v0.2.0 Minimal Set)

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

## 9. Ingestion Validation Contract

### 9.1 ETL → Truth Layer Boundary

**Policy:** All AI-produced records MUST pass strict schema validation before observations are written. The `schema_registry` is the single source of truth.

### 9.2 Validation Requirements

**For AI Interpretation (via `interpretation_runs`):**

1. **Schema Validation:** Extract fields MUST match active schema version exactly
2. **Type Validation:** Field types MUST match schema definitions (string, number, date, etc.)
3. **Required Fields:** All required fields per schema MUST be present
4. **Unknown Field Routing:** Fields not in schema → `raw_fragments` (not silently dropped)
5. **Provenance Enforcement:** Every observation MUST have valid `source_id` and `interpretation_run_id`

**For Structured Ingestion (via `ingest_structured()`):**

1. **Schema Validation:** Properties MUST match registered schema for `entity_type`
2. **Type Validation:** Field types MUST match schema definitions
3. **Rejection Policy:** Invalid records are rejected with error code (not quarantined)

### 9.3 Failure Paths

| Validation Failure | Action | Error Code |
|-------------------|--------|------------|
| Schema not found | Reject | `SCHEMA_NOT_FOUND` |
| Invalid field type | Reject | `SCHEMA_VALIDATION_FAILED` |
| Missing required field | Reject | `SCHEMA_VALIDATION_FAILED` |
| Unknown entity_type | Route to generic fallback | N/A |

### 9.4 Provenance Enforcement

**Foreign Key Constraints:**

```sql
ALTER TABLE observations
  ADD CONSTRAINT fk_source_id FOREIGN KEY (source_id) REFERENCES sources(id),
  ADD CONSTRAINT fk_interpretation_run_id FOREIGN KEY (interpretation_run_id) REFERENCES interpretation_runs(id);

ALTER TABLE raw_fragments
  ADD CONSTRAINT fk_source_id FOREIGN KEY (source_id) REFERENCES sources(id),
  ADD CONSTRAINT fk_interpretation_run_id FOREIGN KEY (interpretation_run_id) REFERENCES interpretation_runs(id);
```

**NOT NULL Constraints:**

- `observations.source_id` — MUST link to source
- `observations.interpretation_run_id` — MUST link to interpretation (for AI-derived; NULL for corrections)
- `raw_fragments.source_id` — MUST link to source
- `raw_fragments.interpretation_run_id` — MUST link to interpretation

### 9.5 Validation Service

```typescript
async function validateAndIngest(
  sourceId: string,
  extractedFields: Record<string, any>,
  schemaType: string,
  interpretationRunId: string
): Promise<{ observations: Observation[], fragments: RawFragment[] }> {
  // 1. Load schema
  const schema = await schemaRegistry.getSchema(schemaType);
  if (!schema) {
    throw new Error(`SCHEMA_NOT_FOUND: ${schemaType}`);
  }
  
  // 2. Separate known vs unknown fields
  const { validFields, unknownFields } = separateFields(extractedFields, schema);
  
  // 3. Validate known fields
  const validationResult = validateFields(validFields, schema);
  if (!validationResult.valid) {
    throw new Error(`SCHEMA_VALIDATION_FAILED: ${validationResult.errors.join(', ')}`);
  }
  
  // 4. Create observations for valid fields
  const observations = await createObservations(validFields, sourceId, interpretationRunId);
  
  // 5. Route unknown fields to raw_fragments
  const fragments = await createRawFragments(unknownFields, sourceId, interpretationRunId);
  
  return { observations, fragments };
}
```

### 9.6 Testing Requirements

**Integration Tests:**

1. **Valid Record:** Verify observation created with correct provenance
2. **Invalid Type:** Verify rejection with `SCHEMA_VALIDATION_FAILED`
3. **Unknown Fields:** Verify routing to `raw_fragments`
4. **Missing Provenance:** Verify FK constraint violation
5. **Prompt Change Test:** Verify prompt/model changes do NOT silently alter record shapes without schema version bump

---

## 10. Security Model

- **RLS**: Client keys (`anon`, `authenticated`) have SELECT-only access
- **MCP Server**: All mutations via `service_role`; user identity stamped into rows
- **Storage URLs**: Opaque, never returned to clients; reads via MCP server + ownership check
- **Cross-User Prevention**: All operations validate `user_id` match

---

## 11. Related Documents

- [`docs/subsystems/schema.md`](./schema.md) — Database schema (includes sources, interpretation_runs tables)
- [`docs/subsystems/observation_architecture.md`](./observation_architecture.md) — Observation layer
- [`docs/subsystems/ingestion/ingestion.md`](./ingestion/ingestion.md) — Ingestion pipeline
- [`docs/subsystems/entity_merge.md`](./entity_merge.md) — Entity merge mechanism
- [`docs/architecture/determinism.md`](../architecture/determinism.md) — Determinism doctrine

---

## 12. Agent Instructions

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

