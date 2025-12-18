---
name: Raw-First Ingestion Architecture
overview: "Decouple ingestion from interpretation: store raw data immediately (deterministic), interpret on-demand (auditable), curate explicitly (canonical truth). Simpler, more honest architecture that accepts any data type without schema friction while maintaining determinism where it matters."
todos:
  - id: raw-storage-service
    content: Create raw_storage_service.ts with hash-based dedup and blob storage
    status: pending
  - id: raw-records-migration
    content: Add database migration for raw_records table
    status: pending
  - id: mcp-ingest-tool
    content: Create ingest() MCP tool for raw byte storage
    status: pending
    dependencies:
      - raw-storage-service
      - raw-records-migration
  - id: interpretation-service
    content: Create interpretation_service.ts with AI/rules extraction
    status: pending
  - id: extractors
    content: Create extractors for PDF, image, JSON, text
    status: pending
    dependencies:
      - interpretation-service
  - id: interpretations-migration
    content: Add database migration for interpretations table
    status: pending
  - id: mcp-interpret-tool
    content: Create interpret() MCP tool for on-demand extraction
    status: pending
    dependencies:
      - interpretation-service
      - extractors
      - interpretations-migration
  - id: curation-service
    content: Create curation_service.ts with auto-curation logic
    status: pending
  - id: curated-truths-migration
    content: Add database migration for curated_truths table
    status: pending
  - id: mcp-curate-tool
    content: Create curate() MCP tool for explicit acceptance
    status: pending
    dependencies:
      - curation-service
      - curated-truths-migration
  - id: mcp-ingest-structured
    content: Create ingest_structured() convenience tool for agents
    status: pending
    dependencies:
      - mcp-ingest-tool
      - mcp-curate-tool
  - id: query-layer-update
    content: Update query_records to return curated_truths with provenance
    status: pending
    dependencies:
      - curated-truths-migration
  - id: integration-tests
    content: Write integration tests for all three layers
    status: pending
    dependencies:
      - mcp-curate-tool
      - query-layer-update
---

# Raw-First Ingestion Architecture

## Core Principle

**Separate concerns into three layers:**

| Layer | Operation | Deterministic? | Blocking? |

|-------|-----------|----------------|-----------|

| **Ingestion** | Store raw bytes | Yes (hash-based) | Never fails |

| **Interpretation** | Extract structure | No (AI/rules) | Non-blocking |

| **Curation** | Accept as truth | Yes (explicit) | Optional |

This architecture accepts any data type without schema friction while being honest about where determinism exists.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    MCP Interface                      │
│  • ingest() - store raw, always succeeds              │
│  • interpret() - extract structure, on-demand         │
│  • curate() - accept as truth                         │
│  • ingest_structured() - convenience for agents       │
└─────────────────────┬────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
   ┌─────────────┐        ┌─────────────────┐
   │ Raw Storage │        │ Structured Path │
   │ (any bytes) │        │ (agent data)    │
   └──────┬──────┘        └────────┬────────┘
          │                        │
          ▼                        │
   ┌─────────────┐                 │
   │ Interpret   │◄────────────────┘
   │ (AI/rules)  │
   └──────┬──────┘
          │
          ▼
   ┌─────────────┐
   │ Curate      │ ← User/agent accepts = canonical truth
   └──────┬──────┘
          │
          ▼
   ┌─────────────┐
   │ Truth Store │ ← Query this for answers
   └─────────────┘
```

---

## Key Files

- [`src/server.ts`](src/server.ts) - MCP server, current endpoints
- [`src/services/schema_registry.ts`](src/services/schema_registry.ts) - Schema management
- [`docs/subsystems/schema.md`](docs/subsystems/schema.md) - Schema documentation

---

## Data Model

### Raw Records (Layer 1)

```sql
CREATE TABLE raw_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash TEXT NOT NULL UNIQUE,     -- SHA-256, deduplication key
  raw_content BYTEA NOT NULL,            -- Original bytes, immutable
  mime_type TEXT NOT NULL,               -- "application/pdf", "image/png", etc.
  file_name TEXT,                        -- Original filename if provided
  byte_size INTEGER NOT NULL,
  
  -- Provenance
  source_type TEXT NOT NULL,             -- "file_upload", "agent_submission", "api_import"
  source_agent_id TEXT,
  source_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL
);

CREATE INDEX idx_raw_records_hash ON raw_records(content_hash);
CREATE INDEX idx_raw_records_user ON raw_records(user_id);
CREATE INDEX idx_raw_records_mime ON raw_records(mime_type);
```

### Interpretations (Layer 2)

```sql
CREATE TABLE interpretations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_record_id UUID REFERENCES raw_records(id),
  
  -- Extracted structure
  entity_type TEXT NOT NULL,
  properties JSONB NOT NULL,
  confidence NUMERIC(3,2),               -- 0.00 to 1.00
  
  -- Extraction method (auditability)
  extraction_method JSONB NOT NULL,      -- { type, model, prompt_version, params }
  extraction_warnings JSONB DEFAULT '[]',
  
  -- Versioning
  version INTEGER NOT NULL DEFAULT 1,
  superseded_by UUID REFERENCES interpretations(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL
);

CREATE INDEX idx_interpretations_raw ON interpretations(raw_record_id);
CREATE INDEX idx_interpretations_type ON interpretations(entity_type);
CREATE INDEX idx_interpretations_user ON interpretations(user_id);
```

### Curated Truth (Layer 3)

```sql
CREATE TABLE curated_truths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_record_id UUID REFERENCES raw_records(id),
  interpretation_id UUID REFERENCES interpretations(id),
  
  -- The accepted truth
  entity_type TEXT NOT NULL,
  properties JSONB NOT NULL,
  
  -- Curation metadata
  curated_by TEXT NOT NULL,              -- Agent ID or "user"
  curation_method TEXT NOT NULL,         -- "auto_high_confidence", "agent_approved", "user_modified"
  modifications JSONB DEFAULT '[]',      -- [{field, original, modified, reason}]
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL
);

CREATE INDEX idx_curated_type ON curated_truths(entity_type);
CREATE INDEX idx_curated_user ON curated_truths(user_id);
CREATE INDEX idx_curated_properties ON curated_truths USING GIN(properties);
```

---

## Implementation Phases

### Phase 1: Raw Storage Layer

**Goal:** Accept any data, store immutably, never fail

1. Create `src/services/raw_storage_service.ts`:

   - Hash content (SHA-256)
   - Deduplicate by hash
   - Store raw bytes (Supabase storage or BYTEA)
   - Return raw_record_id immediately
   - No schema validation, no parsing

2. Add database migration for `raw_records` table

3. Create MCP tool `ingest`:
   ```typescript
   ingest({
     content: string,           // Base64 encoded bytes
     mime_type: string,
     file_name?: string,
     provenance?: { source_type, agent_id, metadata }
   })
   → { raw_id: string, content_hash: string, deduplicated: boolean }
   ```


**Success Criteria:**

- Any file type accepted
- Duplicate detection works
- Ingestion never fails (except storage errors)
- Sub-100ms latency for typical files

---

### Phase 2: Interpretation Layer

**Goal:** Extract structure from raw, track method, allow retries

4. Create `src/services/interpretation_service.ts`:

   - Load raw content by ID
   - Detect mime type, route to appropriate extractor
   - For PDFs/images: OCR → AI inference
   - For JSON: Parse directly
   - For text: AI inference or rule-based
   - Store extraction method metadata
   - Return confidence scores per field

5. Create `src/services/extractors/`:

   - `pdf_extractor.ts` - OCR + text extraction
   - `image_extractor.ts` - OCR
   - `json_extractor.ts` - Parse and validate
   - `text_extractor.ts` - AI inference for unstructured text

6. Add database migration for `interpretations` table

7. Create MCP tool `interpret`:
   ```typescript
   interpret({
     raw_id: string,
     method?: "auto" | "ai" | "rules",
     entity_type_hint?: string,
     model?: string              // Override default model
   })
   → { 
     interpretation_id: string,
     entity_type: string,
     properties: object,
     confidence: number,
     warnings: string[]
   }
   ```


**Success Criteria:**

- PDFs, images, JSON, text all interpretable
- Confidence scores meaningful
- Method metadata enables audit
- Re-interpretation creates new version (old preserved)

---

### Phase 3: Curation Layer

**Goal:** Explicit acceptance creates canonical truth

8. Create `src/services/curation_service.ts`:

   - Accept interpretation as-is
   - Accept with modifications
   - Create truth without interpretation (agent-provided)
   - Track who curated and why

9. Add database migration for `curated_truths` table

10. Create MCP tool `curate`:
    ```typescript
    curate({
      interpretation_id?: string,     // Accept interpretation
      raw_id?: string,                // Or curate raw directly
      entity_type: string,
      properties: object,
      modifications?: array           // If modifying interpretation
    })
    → { truth_id: string, entity_type: string, properties: object }
    ```

11. Auto-curation rules:

    - If confidence > 0.95, auto-curate
    - If agent explicitly requests, auto-curate
    - Otherwise, store interpretation, await curation

**Success Criteria:**

- Curated truth is queryable
- Modifications tracked
- Auto-curation configurable
- Can curate without interpretation (direct agent input)

---

### Phase 4: Convenience Layer

**Goal:** Simple path for agents with pre-structured data

12. Create MCP tool `ingest_structured`:
    ```typescript
    ingest_structured({
      entity_type: string,
      properties: object,
      provenance?: object,
      raw_content?: string         // Optional: attach raw for audit
    })
    → { truth_id: string }
    ```


Internally:

    - If raw_content provided: store in raw_records
    - Create interpretation with method: "agent_provided"
    - Auto-curate (agent is trusted)
    - Return truth_id

13. Update existing `submit_payload` to wrap `ingest_structured`

    - Backwards compatible
    - Deprecation notice in docs

**Success Criteria:**

- Single call for structured data
- No round trips for trusted agents
- Backwards compatible with existing integrations

---

### Phase 5: Query Layer Updates

**Goal:** Queries return curated truth

14. Update `query_records` to query `curated_truths`:

    - Default: query curated_truths
    - Option: include uncurated interpretations
    - Option: include raw records

15. Add provenance in query results:
    ```typescript
    {
      truth_id: "...",
      entity_type: "invoice",
      properties: { ... },
      provenance: {
        raw_id: "...",
        interpretation_id: "...",
        curated_by: "chatgpt_session_123",
        curation_method: "agent_approved"
      }
    }
    ```


**Success Criteria:**

- Queries return curated truth by default
- Full provenance available
- Can trace: truth → interpretation → raw

---

## MCP Tools Summary

| Tool | Purpose | Typical Latency |

|------|---------|-----------------|

| `ingest` | Store raw bytes | <100ms |

| `interpret` | Extract structure | 1-3s (AI) |

| `curate` | Accept as truth | <100ms |

| `ingest_structured` | Convenience for agents | <100ms |

| `query_records` | Retrieve curated truth | <100ms |

**Typical Workflows:**

```
File upload:     ingest → interpret → curate (or auto-curate)
Agent data:      ingest_structured (single call)
Re-processing:   interpret(raw_id, {model: "new"}) → curate
Bulk import:     ingest_batch → interpret_batch → curate_batch
```

---

## What's NOT in This Plan

**Explicitly deferred:**

- User-specific schemas (use existing schema_registry as-is)
- Schema convergence (post-MVP)
- Complex canonicalization rules (simple normalization only)
- Preview system (replaced by interpret → curate flow)
- Batch operations (add after core works)

**Why:** Ship simple, learn from usage, iterate.

---

## Success Metrics

- Ingestion accepts any file type without error
- Ingestion latency <100ms (raw storage only)
- Interpretation retryable without re-upload
- Curated truth is queryable and auditable
- Full provenance chain: truth → interpretation → raw

---

## Risks and Mitigations

| Risk | Mitigation |

|------|------------|

| **Raw storage size** | Compress, deduplicate by hash, retention policy |

| **AI interpretation cost** | Only interpret on demand, cache results |

| **Orphaned raw records** | Cleanup job for raw without interpretations after N days |

| **Auto-curation wrong** | Configurable threshold, easy re-curation |

---

## Comparison to Original Plan

| Aspect | Original | Raw-First |

|--------|----------|-----------|

| **Ingestion paths** | 2 | 1 |

| **Schema required at ingest** | Yes | No |

| **Determinism claim** | "AI replay" (misleading) | "Storage + curation" (honest) |

| **Failure modes** | Many | Minimal (ingestion always works) |

| **Complexity** | High | Low |

| **Re-interpretation** | Requires re-upload | Trivial (raw always available) |