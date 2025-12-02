# Neotoma Schema — Canonical Data Models and Evolution Rules

_(Database Schema, JSONB Structures, and Migration Protocols)_

---

## Purpose

This document defines the **canonical database schema** for Neotoma's Truth Layer. It specifies:

- Core tables and their relationships
- JSONB field structures and key paths
- Schema evolution and migration rules
- Invariants and constraints
- Testing requirements for schema changes

The schema is the foundation of Neotoma's deterministic, immutable memory graph.

---

## Scope

This document covers:

- PostgreSQL table definitions
- JSONB property schemas for flexible fields
- Indexes and performance considerations
- Schema versioning and backward compatibility
- Migration safety rules

This document does NOT cover:

- Ingestion pipeline logic (see `docs/subsystems/ingestion/ingestion.md`)
- Entity resolution (see ingestion docs)
- Search indexing (see `docs/subsystems/search/search.md`)

---

## 1. Core Schema Principles

### 1.1 Foundational Invariants

These principles MUST be maintained across all schema changes:

1. **Immutability:** Once written, truth never changes (exceptions: metadata like `updated_at`)
2. **Provenance:** All data traces to source (file, timestamp, user)
3. **Determinism:** Same input → same schema structure
4. **Explainability:** All fields map to extraction source
5. **Flexibility:** JSONB for schema-specific `properties`
6. **Strong typing:** Core fields are strongly typed SQL columns
7. **No orphans:** All records have provenance; all relationships have valid endpoints

---

### 1.2 Schema Evolution Rules

**Additive Changes (Allowed):**

- ✅ Add new optional JSONB keys
- ✅ Add new indexes
- ✅ Add new tables
- ✅ Add new optional columns with defaults

**Breaking Changes (Forbidden in MVP):**

- ❌ Remove columns or tables
- ❌ Change column types (except widening, e.g., VARCHAR(50) → TEXT)
- ❌ Remove required JSONB keys
- ❌ Change JSONB key semantics

**Migration Requirements:**

- All migrations MUST be reversible (down migration)
- All migrations MUST preserve existing data
- All migrations MUST be tested on production-like data

---

## 2. Core Tables

### 2.1 `records` Table

**Purpose:** Central table storing all ingested user documents and their extracted truth.

**Schema:**

```sql
CREATE TABLE records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,                              -- Application type (e.g., 'invoice', 'receipt', 'contract')
  properties JSONB NOT NULL DEFAULT '{}',          -- Extracted fields (type-specific)
  file_urls JSONB DEFAULT '[]',                    -- Array of file storage URLs
  external_source TEXT,                            -- Source system (e.g., 'gmail', 'upload')
  external_id TEXT,                                -- ID in external system
  external_hash TEXT,                              -- Content hash for deduplication
  summary TEXT,                                    -- Optional human-readable summary
  embedding vector(1536),                          -- OpenAI ada-002 embedding (eventual)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Field Definitions:**

| Field             | Type         | Purpose                                    | Mutable | Indexed         |
| ----------------- | ------------ | ------------------------------------------ | ------- | --------------- |
| `id`              | UUID         | Unique record identifier                   | No      | Primary key     |
| `type`            | TEXT         | Schema type (e.g., `FinancialRecord`)      | No      | Yes (GIN)       |
| `properties`      | JSONB        | Extracted fields per schema                | No\*    | Yes (GIN)       |
| `file_urls`       | JSONB        | Array of file URLs                         | No      | No              |
| `external_source` | TEXT         | Source system (`gmail`, `upload`, `plaid`) | No      | Yes (composite) |
| `external_id`     | TEXT         | ID in external system                      | No      | Yes (composite) |
| `external_hash`   | TEXT         | SHA-256 of file content                    | No      | Yes             |
| `summary`         | TEXT         | Optional summary text                      | Yes\*\* | No              |
| `embedding`       | vector(1536) | Embeddings for similarity search           | Yes\*\* | Yes (ivfflat)   |
| `created_at`      | TIMESTAMPTZ  | Record creation timestamp                  | No      | Yes (DESC)      |
| `updated_at`      | TIMESTAMPTZ  | Last update timestamp                      | Yes     | No              |

**Notes:**

- \*`properties` is technically mutable but SHOULD NOT be changed post-ingestion (metadata only)
- \*\*`summary` and `embedding` are computed asynchronously (bounded eventual consistency)

**Indexes:**

```sql
CREATE INDEX idx_records_type ON records(type);
CREATE INDEX idx_records_properties ON records USING GIN(properties);
CREATE INDEX idx_records_embedding ON records USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_records_created_at ON records(created_at DESC);
CREATE INDEX idx_records_external_id ON records ((properties->>'external_id'));
CREATE UNIQUE INDEX idx_records_external_source_id_unique
  ON records (external_source, external_id)
  WHERE external_source IS NOT NULL AND external_id IS NOT NULL;
CREATE INDEX idx_records_external_hash ON records (external_hash)
  WHERE external_hash IS NOT NULL;
```

---

### 2.2 `record_relationships` Table

**Purpose:** Graph edges between records (e.g., "Contract mentions Invoice").

**Schema:**

```sql
CREATE TABLE record_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL,                      -- Type of relationship
  metadata JSONB NOT NULL DEFAULT '{}',            -- Additional context
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Field Definitions:**

| Field          | Type        | Purpose                                              | Mutable | Indexed     |
| -------------- | ----------- | ---------------------------------------------------- | ------- | ----------- |
| `id`           | UUID        | Unique relationship ID                               | No      | Primary key |
| `source_id`    | UUID        | Source record                                        | No      | Yes         |
| `target_id`    | UUID        | Target record                                        | No      | Yes         |
| `relationship` | TEXT        | Relationship type (e.g., `mentions`, `derives_from`) | No      | No          |
| `metadata`     | JSONB       | Additional context                                   | No      | No          |
| `created_at`   | TIMESTAMPTZ | When relationship created                            | No      | No          |

**Indexes:**

```sql
CREATE INDEX idx_record_relationships_source ON record_relationships(source_id);
CREATE INDEX idx_record_relationships_target ON record_relationships(target_id);
```

**Example Relationships:**

- `source → mentions → target`: Source record mentions entity in target record
- `source → derives_from → target`: Source was extracted from target (e.g., transaction from bank statement)
- `source → supersedes → target`: Source replaces target (e.g., updated contract)

---

### 2.3 `plaid_items` Table

**Purpose:** Track Plaid-linked financial institutions and sync state.

**Schema:**

```sql
CREATE TABLE plaid_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id TEXT UNIQUE NOT NULL,                    -- Plaid item_id
  institution_id TEXT,                             -- Plaid institution_id
  institution_name TEXT,
  access_token TEXT NOT NULL,                      -- Encrypted access token
  environment TEXT NOT NULL,                       -- 'sandbox', 'development', 'production'
  products JSONB NOT NULL DEFAULT '[]',            -- Array of enabled products
  country_codes JSONB NOT NULL DEFAULT '[]',
  cursor TEXT,                                     -- Sync cursor for incremental pulls
  webhook_status TEXT,
  last_successful_sync TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Indexes:**

```sql
CREATE INDEX idx_plaid_items_item_id ON plaid_items(item_id);
CREATE INDEX idx_plaid_items_environment ON plaid_items(environment);
```

---

### 2.4 `plaid_sync_runs` Table

**Purpose:** History of Plaid sync operations.

**Schema:**

```sql
CREATE TABLE plaid_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaid_item_id UUID NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending',          -- 'pending', 'running', 'completed', 'failed'
  added_transactions INTEGER NOT NULL DEFAULT 0,
  modified_transactions INTEGER NOT NULL DEFAULT 0,
  removed_transactions INTEGER NOT NULL DEFAULT 0,
  error JSONB,
  next_cursor TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Indexes:**

```sql
CREATE INDEX idx_plaid_sync_runs_item_id ON plaid_sync_runs(plaid_item_id);
CREATE INDEX idx_plaid_sync_runs_started_at ON plaid_sync_runs(started_at DESC);
```

---

### 2.5 `external_connectors` Table

**Purpose:** Generic external data connectors (Gmail, Dropbox, etc.).

**Schema:**

```sql
CREATE TABLE external_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,                          -- 'gmail', 'dropbox', 'notion'
  provider_type TEXT NOT NULL,                     -- 'oauth', 'api_key', 'manual'
  account_identifier TEXT,                         -- e.g., email address
  account_label TEXT,                              -- User-friendly name
  status TEXT NOT NULL DEFAULT 'active',           -- 'active', 'paused', 'error', 'revoked'
  capabilities JSONB NOT NULL DEFAULT '[]',        -- Array of enabled features
  oauth_scopes JSONB NOT NULL DEFAULT '[]',
  secrets_envelope TEXT,                           -- Encrypted credentials
  metadata JSONB NOT NULL DEFAULT '{}',
  sync_cursor JSONB,                               -- Provider-specific cursor
  last_successful_sync TIMESTAMP WITH TIME ZONE,
  last_error JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Indexes:**

```sql
CREATE INDEX idx_external_connectors_provider ON external_connectors(provider);
CREATE INDEX idx_external_connectors_status ON external_connectors(status);
CREATE INDEX idx_external_connectors_account_identifier ON external_connectors(account_identifier)
  WHERE account_identifier IS NOT NULL;
CREATE UNIQUE INDEX idx_external_connectors_provider_account
  ON external_connectors(provider, account_identifier)
  WHERE account_identifier IS NOT NULL;
```

---

### 2.6 `external_sync_runs` Table

**Purpose:** History of generic connector syncs.

**Schema:**

```sql
CREATE TABLE external_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id UUID NOT NULL REFERENCES external_connectors(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL DEFAULT 'incremental',   -- 'full', 'incremental'
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  stats JSONB NOT NULL DEFAULT '{}',               -- {'records_added': 10, 'errors': 0}
  cursor JSONB,                                    -- Next cursor for incremental sync
  error JSONB,
  trace_id TEXT,                                   -- Distributed tracing ID
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Indexes:**

```sql
CREATE INDEX idx_external_sync_runs_connector ON external_sync_runs(connector_id);
CREATE INDEX idx_external_sync_runs_started_at ON external_sync_runs(started_at DESC);
CREATE INDEX idx_external_sync_runs_status ON external_sync_runs(status);
```

---

## 3. JSONB `properties` Schema

### 3.1 Overview

The `properties` JSONB field in `records` stores schema-specific extracted fields. Each `type` (e.g., `FinancialRecord`) has a well-defined `properties` structure.

**Design Principles:**

- **Schema-driven:** Structure defined by `type` field
- **Flat where possible:** Avoid deep nesting
- **Null-safe:** Missing keys = absent data (not errors)
- **Versioned:** Include `schema_version` if structure evolves

---

### 3.2 Example: FinancialRecord

```json
{
  "schema_version": "1.0",
  "document_type": "invoice",
  "invoice_number": "INV-2024-001",
  "amount": 1500.0,
  "currency": "USD",
  "date_issued": "2024-01-15T00:00:00Z",
  "date_due": "2024-02-15T00:00:00Z",
  "vendor_name": "Acme Corp",
  "vendor_address": "123 Main St, City, State, 12345",
  "line_items": [
    {
      "description": "Consulting services",
      "quantity": 10,
      "unit_price": 150.0,
      "total": 1500.0
    }
  ],
  "payment_status": "unpaid",
  "notes": "Net 30 terms"
}
```

**Key Paths (for indexing and queries):**

- `properties->>'invoice_number'`
- `properties->>'amount'`
- `properties->>'date_issued'`
- `properties->>'vendor_name'`

---

### 3.3 Example: IdentityDocument

```json
{
  "schema_version": "1.0",
  "document_type": "passport",
  "full_name": "John Doe",
  "passport_number": "P12345678",
  "nationality": "US",
  "date_of_birth": "1990-01-15",
  "date_issued": "2020-01-01",
  "date_expiry": "2030-01-01",
  "issuing_authority": "U.S. Department of State",
  "place_of_birth": "New York, NY"
}
```

**Key Paths:**

- `properties->>'passport_number'`
- `properties->>'date_expiry'`
- `properties->>'full_name'`

---

### 3.4 Example: TravelDocument

```json
{
  "schema_version": "1.0",
  "document_type": "flight_itinerary",
  "booking_reference": "ABC123",
  "passenger_name": "John Doe",
  "departure_airport": "SFO",
  "arrival_airport": "JFK",
  "departure_datetime": "2024-03-15T08:00:00Z",
  "arrival_datetime": "2024-03-15T16:30:00Z",
  "airline": "United Airlines",
  "flight_number": "UA1234",
  "seat": "12A",
  "fare": 450.0,
  "currency": "USD"
}
```

**Key Paths:**

- `properties->>'departure_datetime'`
- `properties->>'arrival_datetime'`
- `properties->>'booking_reference'`

---

### 3.5 Example: Contract

```json
{
  "schema_version": "1.0",
  "document_type": "contract",
  "contract_type": "service_agreement",
  "contract_number": "CNT-2024-001",
  "parties": [
    {
      "name": "Acme Corp",
      "role": "client"
    },
    {
      "name": "Service Provider Inc",
      "role": "vendor"
    }
  ],
  "effective_date": "2024-01-15T00:00:00Z",
  "expiration_date": "2025-01-15T00:00:00Z",
  "total_value": 50000.0,
  "currency": "USD",
  "key_terms": ["Net 30 payment", "Termination with 30 days notice"],
  "status": "active"
}
```

**Key Paths:**

- `properties->>'contract_number'`
- `properties->>'effective_date'`
- `properties->>'expiration_date'`
- `properties->'parties'->0->>'name'`

**Tier 1 ICP Use Cases:**

- Knowledge workers: Legal research, due diligence, contract analysis
- Founders: Company contracts, vendor agreements, investor agreements

---

### 3.6 Example: Message (Email/Chat)

```json
{
  "schema_version": "1.0",
  "document_type": "email",
  "thread_id": "thread_abc123",
  "message_id": "msg_xyz789",
  "subject": "Project Update Q1 2024",
  "sender": "john@example.com",
  "sender_name": "John Doe",
  "recipients": ["team@example.com"],
  "cc": [],
  "bcc": [],
  "sent_at": "2024-03-15T10:30:00Z",
  "body": "Here's the Q1 update...",
  "attachments": ["report.pdf"],
  "labels": ["work", "project-update"]
}
```

**Key Paths:**

- `properties->>'sender'`
- `properties->>'sent_at'`
- `properties->>'subject'`
- `properties->>'thread_id'`

**Tier 1 ICP Use Cases:**

- Knowledge workers: Client communications, project tracking
- Founders: Team communications, investor updates
- AI-Native Operators: Email attachment import via Gmail integration

---

### 3.7 Example: Document (Generic Knowledge Asset)

```json
{
  "schema_version": "1.0",
  "document_type": "research_paper",
  "title": "Market Analysis Q1 2024",
  "author": "Research Team",
  "published_date": "2024-03-01T00:00:00Z",
  "summary": "Analysis of market trends...",
  "tags": ["market-research", "q1-2024"],
  "source": "internal",
  "page_count": 25,
  "language": "en"
}
```

**Key Paths:**

- `properties->>'title'`
- `properties->>'published_date'`
- `properties->>'tags'`
- `properties->>'source'`

**Tier 1 ICP Use Cases:**

- Knowledge workers: Research papers, project documentation, client deliverables
- Founders: Product documentation, user research, competitive analysis
- AI-Native Operators: Research synthesis, knowledge assets

---

### 3.8 Example: Note

```json
{
  "schema_version": "1.0",
  "document_type": "note",
  "title": "Meeting Notes - Product Planning",
  "content": "Discussed feature X...",
  "tags": ["meeting", "product"],
  "created_at": "2024-03-15T14:00:00Z",
  "source": "manual_entry"
}
```

**Key Paths:**

- `properties->>'title'`
- `properties->>'created_at'`
- `properties->>'tags'`

**Tier 1 ICP Use Cases:**

- All Tier 1 ICPs: Free-form notes, meeting notes, markdown files, journals

---

### 3.9 Generic Fallback: Document

For unrecognized document types:

```json
{
  "schema_version": "1.0",
  "document_type": "pdf",
  "filename": "document.pdf",
  "page_count": 5,
  "extracted_text": "...",
  "language": "en"
}
```

---

### 3.10 Querying JSONB Properties

**Example Queries:**

**Find all invoices over $1000:**

```sql
SELECT * FROM records
WHERE type = 'FinancialRecord'
  AND (properties->>'document_type') = 'invoice'
  AND (properties->>'amount')::numeric > 1000;
```

**Find passports expiring soon:**

```sql
SELECT * FROM records
WHERE type = 'IdentityDocument'
  AND (properties->>'document_type') = 'passport'
  AND (properties->>'date_expiry')::date < NOW() + INTERVAL '6 months';
```

**Find flights departing next week:**

```sql
SELECT * FROM records
WHERE type = 'TravelDocument'
  AND (properties->>'departure_datetime')::timestamptz BETWEEN NOW() AND NOW() + INTERVAL '7 days';
```

---

### 3.11 Extraction Metadata Structure

The `extraction_metadata` JSONB field in `records` stores non-schema fields, validation warnings, and extraction quality indicators. This is part of the **three-layer storage model** that preserves all extracted data while maintaining schema compliance in `properties`.

**Three-Layer Storage Model:**

- `raw_text`: Immutable original extracted text (stored separately)
- `properties`: Schema-compliant fields only (deterministic, queryable)
- `extraction_metadata`: Unknown fields, warnings, quality indicators (preservation layer)

**Purpose:**

- Preserve all extracted data (zero data loss)
- Maintain schema compliance in `properties` for deterministic queries
- Provide extraction quality metrics for debugging and schema evolution
- Enable future automatic schema expansion based on patterns in `unknown_fields`

**Structure:**

```typescript
interface ExtractionMetadata {
  unknown_fields?: Record<string, unknown>;
  warnings?: Array<{
    type: "missing_required" | "unknown_field" | "validation_error";
    field?: string;
    message: string;
    value?: unknown;
  }>;
  extraction_quality: {
    fields_extracted_count: number;
    fields_filtered_count: number;
    matched_patterns?: string[];
    confidence_score?: number;
  };
}
```

**Example:**

```json
{
  "unknown_fields": {
    "purchase_order": "PO-789",
    "internal_cost_center": "CC-456"
  },
  "warnings": [
    {
      "type": "unknown_field",
      "field": "purchase_order",
      "message": "Field 'purchase_order' not defined for type 'invoice' - preserved in extraction_metadata"
    },
    {
      "type": "missing_required",
      "field": "date_due",
      "message": "Required field 'date_due' missing for type 'invoice'"
    }
  ],
  "extraction_quality": {
    "fields_extracted_count": 7,
    "fields_filtered_count": 2,
    "matched_patterns": ["invoice_number_pattern", "amount_due_pattern"]
  }
}
```

**Key Paths (for indexing and queries):**

- `extraction_metadata->'unknown_fields'` — Query records with unknown fields
- `extraction_metadata->'warnings'` — Query records with extraction issues
- `extraction_metadata->'extraction_quality'->'fields_extracted_count'` — Quality metrics

**Usage Patterns:**

**Find records with extraction warnings:**

```sql
SELECT * FROM records
WHERE extraction_metadata->'warnings' IS NOT NULL
  AND jsonb_array_length(extraction_metadata->'warnings') > 0;
```

**Access unknown fields when needed:**

```sql
SELECT
  id,
  properties,
  extraction_metadata->'unknown_fields' as unknown_data
FROM records
WHERE extraction_metadata->'unknown_fields' IS NOT NULL;
```

**Find records with high field filtering (potential schema expansion candidates):**

```sql
SELECT * FROM records
WHERE (extraction_metadata->'extraction_quality'->>'fields_filtered_count')::int > 3;
```

**Indexes:**

```sql
-- Index for querying records with warnings
CREATE INDEX idx_records_extraction_warnings
  ON records USING GIN ((extraction_metadata->'warnings'));

-- Index for unknown fields analysis
CREATE INDEX idx_records_unknown_fields
  ON records USING GIN ((extraction_metadata->'unknown_fields'));
```

**Related Documentation:**

- Layered storage model: `docs/architecture/schema_handling.md`
- Field validation patterns: `docs/subsystems/record_types.md` Section 10
- Automatic schema expansion: `docs/architecture/schema_expansion.md` (post-MVP)

---

## 4. Entity and Event Schema (Future)

**MVP Note:** Neotoma MVP stores entities and events implicitly within `properties` or as separate records. Future versions will have dedicated `entities` and `events` tables.

**Planned `entities` Table:**

```sql
CREATE TABLE entities (
  id TEXT PRIMARY KEY,                             -- Deterministic hash-based ID
  entity_type TEXT NOT NULL,                       -- 'person', 'company', 'location'
  canonical_name TEXT NOT NULL,                    -- Normalized name
  aliases JSONB DEFAULT '[]',                      -- Array of alternate names
  metadata JSONB DEFAULT '{}',
  first_seen_at TIMESTAMP WITH TIME ZONE,
  last_seen_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Planned `events` Table:**

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,                             -- Deterministic hash-based ID
  event_type TEXT NOT NULL,                        -- 'InvoiceIssued', 'FlightBooked'
  event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  source_record_id UUID REFERENCES records(id),
  source_field TEXT,                               -- Field that generated event
  entities JSONB DEFAULT '[]',                     -- Array of entity IDs
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Graph Edges:**

- `record → entity`: Which entities are mentioned in a record
- `record → event`: Which events are derived from a record
- `event → entity`: Which entities are involved in an event

---

## 5. Row-Level Security (RLS)

### 5.1 Current RLS Policies

**Service Role (Full Access):**

```sql
CREATE POLICY "Service role full access" ON records
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

**Authenticated Users (Read/Write):**

```sql
CREATE POLICY "public write" ON records
  FOR ALL
  USING      ( auth.role() = 'authenticated' )
  WITH CHECK ( auth.role() = 'authenticated' );
```

**Public Read (All Records):**

```sql
CREATE POLICY "public read" ON records
  FOR SELECT USING ( true );
```

**MVP Limitation:** No multi-user isolation (all authenticated users see all records). Future versions will add `user_id` column and per-user RLS.

---

### 5.2 Future Multi-User RLS

**Planned `user_id` Column:**

```sql
ALTER TABLE records ADD COLUMN user_id UUID REFERENCES auth.users(id);
```

**Planned Per-User Policy:**

```sql
CREATE POLICY "Users see only their records" ON records
  FOR SELECT
  USING (user_id = auth.uid());
```

---

## 6. Schema Migration Protocol

### 6.1 Migration File Structure

**Location:** `supabase/migrations/`

**Naming:** `YYYYMMDDHHMMSS_description.sql`

**Example:** `20240115103000_add_summary_column.sql`

**Template:**

```sql
-- Migration: Add summary column to records
-- Date: 2024-01-15
-- Author: System

-- UP Migration
ALTER TABLE records ADD COLUMN IF NOT EXISTS summary TEXT;

-- Create index (if needed)
-- CREATE INDEX idx_records_summary ON records USING GIN(to_tsvector('english', summary));

-- Backfill (if needed, deterministic only)
-- UPDATE records SET summary = ... WHERE summary IS NULL;

-- DOWN Migration (commented, for reference)
-- ALTER TABLE records DROP COLUMN IF EXISTS summary;
```

---

### 6.2 Migration Safety Rules

**MUST:**

1. **Test on staging:** Run migration on production-like data first
2. **Measure performance:** Check migration runtime and lock duration
3. **Add defaults:** New columns MUST have defaults (no breaking changes)
4. **Preserve data:** Never delete data without explicit approval
5. **Document changes:** Include purpose and rollback plan in migration file
6. **Version properties schema:** Bump `schema_version` if changing JSONB structure

**MUST NOT:**

1. **Block production:** Migrations MUST NOT lock tables for >1 second
2. **Break clients:** Schema changes MUST be backward-compatible
3. **Lose data:** Never DROP COLUMN without backup
4. **Change semantics:** Existing JSONB keys MUST retain their meaning
5. **Depend on nondeterminism:** Backfills MUST be deterministic

---

### 6.3 Testing Migrations

**Pre-Migration Checklist:**

- [ ] Migration tested on local DB with production-like data
- [ ] Migration runtime measured (< 1s for tables < 100K rows)
- [ ] Rollback tested (down migration works)
- [ ] Application code updated to handle new schema
- [ ] JSONB `schema_version` bumped if applicable
- [ ] Documentation updated

**Post-Migration Verification:**

- [ ] All indexes rebuilt successfully
- [ ] Query performance unchanged or improved
- [ ] No application errors in logs
- [ ] RLS policies still enforce correctly

---

## 7. Schema Versioning

### 7.1 JSONB Schema Versions

Each record type SHOULD include `schema_version` in `properties`:

```json
{
  "schema_version": "1.0",
  ...
}
```

**When to bump version:**

- Adding required fields
- Changing field semantics
- Changing data types (e.g., string → number)

**Backward Compatibility:**

- Old schema versions MUST remain readable
- Application MUST handle missing fields gracefully

**Example Version Migration:**

```typescript
function migrateFinancialRecordProperties(properties: any): any {
  const version = properties.schema_version || "1.0";

  if (version === "1.0") {
    // Migrate 1.0 → 2.0
    return {
      ...properties,
      schema_version: "2.0",
      // Add new field with default
      payment_method: properties.payment_method || "unknown",
    };
  }

  return properties; // Already latest version
}
```

---

## 8. Performance and Indexing Strategy

### 8.1 Index Usage Patterns

**GIN Indexes (JSONB):**

- Good for: `properties @> {'key': 'value'}` (containment queries)
- Cost: Slower writes, larger storage

**B-Tree Indexes (Scalar Columns):**

- Good for: Range queries, sorting (`created_at`, `type`)
- Cost: Minimal

**Vector Indexes (ivfflat):**

- Good for: Similarity search (`embedding <-> query_vector`)
- Cost: Approximate results, tuning required

**Composite Indexes:**

- Good for: Multi-column queries (`external_source`, `external_id`)

---

### 8.2 Query Optimization Tips

**Use Indexed Columns First:**

```sql
-- Good: Uses idx_records_type
SELECT * FROM records WHERE type = 'FinancialRecord';

-- Bad: Full table scan
SELECT * FROM records WHERE properties->>'amount' = '1000';
```

**Add Expression Indexes for Common JSONB Queries:**

```sql
CREATE INDEX idx_records_amount ON records ((properties->>'amount')::numeric)
  WHERE type = 'FinancialRecord';
```

**Use `EXPLAIN ANALYZE`:**

```sql
EXPLAIN ANALYZE SELECT * FROM records WHERE type = 'FinancialRecord';
```

---

## 9. Schema Testing Requirements

### 9.1 Unit Tests

**Test JSONB Schema Validation:**

```typescript
test("FinancialRecord properties are valid", () => {
  const properties = {
    schema_version: "1.0",
    invoice_number: "INV-001",
    amount: 1500.0,
    currency: "USD",
  };

  expect(validateFinancialRecordProperties(properties)).toBe(true);
});
```

---

### 9.2 Integration Tests

**Test Record CRUD:**

```typescript
test("insert and fetch record", async () => {
  const record = await insertRecord({
    type: "FinancialRecord",
    properties: { invoice_number: "INV-001", amount: 1500 },
  });

  const fetched = await fetchRecord(record.id);
  expect(fetched.properties.invoice_number).toBe("INV-001");
});
```

---

### 9.3 Migration Tests

**Test Up/Down Migrations:**

```typescript
test("migration adds summary column", async () => {
  await runMigration("20240115_add_summary.sql");

  const columns = await getTableColumns("records");
  expect(columns).toContain("summary");

  await rollbackMigration("20240115_add_summary.sql");
  const columnsAfter = await getTableColumns("records");
  expect(columnsAfter).not.toContain("summary");
});
```

---

## 10. Schema Invariants (MUST/MUST NOT)

### MUST

1. **All records MUST have `id`, `type`, `properties`**
2. **`properties` MUST be valid JSON**
3. **`type` MUST map to a known schema**
4. **All foreign keys MUST reference valid records** (no orphans)
5. **Migrations MUST be reversible**
6. **Migrations MUST preserve existing data**
7. **JSONB schemas MUST include `schema_version`**
8. **All indexes MUST be documented**
9. **RLS policies MUST be enabled on all tables**
10. **All timestamps MUST be `TIMESTAMPTZ`** (timezone-aware)

### MUST NOT

1. **MUST NOT change core column types** (e.g., `id` UUID → TEXT)
2. **MUST NOT remove columns without migration**
3. **MUST NOT change JSONB key semantics** without versioning
4. **MUST NOT create circular foreign keys** (no cycles)
5. **MUST NOT store PII in unencrypted logs** (RLS applies)
6. **MUST NOT use `SERIAL` IDs** (use UUID for distributed safety)
7. **MUST NOT skip `schema_version`** in new schemas
8. **MUST NOT create unbounded arrays** in JSONB (performance risk)

---

## Agent Instructions

### When to Load This Document

Load `docs/subsystems/schema.md` when:

- Modifying database schema (adding tables, columns, indexes)
- Working with `properties` JSONB fields
- Creating or running migrations
- Querying records with complex JSONB filters
- Planning data model changes
- Debugging schema-related issues

### Required Co-Loaded Documents

- `docs/NEOTOMA_MANIFEST.md` (immutability, provenance)
- `docs/architecture/architecture.md` (layer boundaries)
- `docs/architecture/determinism.md` (deterministic migrations)
- `docs/subsystems/ingestion/ingestion.md` (how properties are populated)
- `docs/private/migration/migrations_lifecycle.md` (migration process)

### Constraints Agents Must Enforce

1. **All schema changes MUST be additive** (no breaking changes)
2. **All migrations MUST be reversible**
3. **All JSONB schemas MUST include `schema_version`**
4. **All new columns MUST have defaults**
5. **All foreign keys MUST cascade appropriately** (ON DELETE CASCADE where logical)
6. **All RLS policies MUST be maintained**
7. **All indexes MUST be justified** (performance tests required)
8. **All properties MUST map to extraction logic** (documented in ingestion)

### Forbidden Patterns

- Removing columns without migration
- Changing column types without compatibility plan
- Creating circular foreign keys
- Storing PII in logs or unprotected fields
- Using non-deterministic defaults (e.g., `random()`)
- Unbounded JSONB arrays (performance risk)
- Missing `schema_version` in new JSONB schemas

### Validation Checklist

- [ ] Schema change is additive only
- [ ] Migration file created with up/down paths
- [ ] Migration tested on staging data
- [ ] New columns have defaults
- [ ] JSONB `schema_version` bumped if applicable
- [ ] Indexes created for new query patterns
- [ ] RLS policies updated if needed
- [ ] Documentation updated
- [ ] Application code handles new schema
- [ ] Tests cover new fields/tables
