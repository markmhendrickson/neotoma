# Neotoma Data Models

**Authoritative Vocabulary:** [`docs/vocabulary/canonical_terms.md`](../vocabulary/canonical_terms.md)

**Note:** This is a **high-level summary** document for quick reference. For implementation details, see:
- [`docs/subsystems/schema.md`](../subsystems/schema.md) — Complete database schema, JSONB structures, migrations
- [`docs/subsystems/sources.md`](../subsystems/sources.md) — [Source material](../vocabulary/canonical_terms.md#source-material) architecture
- [`docs/subsystems/ingestion/ingestion.md`](../subsystems/ingestion/ingestion.md) — Field extraction implementation
- [`docs/NEOTOMA_MANIFEST.md`](../NEOTOMA_MANIFEST.md) — Sections 12, 15, 16 (data model doctrine)

**In case of conflict, detailed subsystem docs are authoritative.**

## Purpose

Consolidates data model specifications for Neotoma's four-layer truth model ([Source Material](../vocabulary/canonical_terms.md#source-material) → [Interpretation](../vocabulary/canonical_terms.md#interpretation) → [Observation](../vocabulary/canonical_terms.md#observation) → [Entity Snapshot](../vocabulary/canonical_terms.md#entity-snapshot)) with complete examples for quick reference.

## Four-Layer Truth Model

Neotoma implements a four-layer truth model:

1. **[Source Material](../vocabulary/canonical_terms.md#source-material)** — raw data (files, structured JSON, URLs) with content-addressed storage
2. **[Interpretation](../vocabulary/canonical_terms.md#interpretation)** — versioned AI extraction attempt with config logging
3. **[Observation](../vocabulary/canonical_terms.md#observation)** — granular, source-specific facts extracted from source material
4. **[Entity Snapshot](../vocabulary/canonical_terms.md#entity-snapshot)** — deterministic [reducer](../vocabulary/canonical_terms.md#reducer) output representing current truth
This model enables:
- Multiple sources to contribute observations about the same entity
- Deterministic merging via reducers
- Full provenance: every snapshot field traces to specific observations and documents
- Out-of-order ingestion support
See [`docs/architecture/architectural_decisions.md`](../architecture/architectural_decisions.md) for complete architectural rationale.
## 1. [Source Material](../vocabulary/canonical_terms.md#source-material) Model

```typescript
interface SourceMaterial {
  id: string; // UUID
  content_hash: string; // SHA-256 hash for deduplication
  storage_url: string; // Storage URL
  storage_status: 'uploaded' | 'pending' | 'failed';
  mime_type: string; // MIME type
  file_name?: string; // Original filename
  byte_size: number; // File size
  source_type: string; // e.g., 'file', 'structured', 'url'
  source_metadata?: Record<string, any>; // JSONB additional metadata
  created_at: string; // ISO 8601
  user_id: string; // UUID
}
```

**Example (Uploaded Invoice PDF):**
```json
{
  "id": "src_abc123",
  "content_hash": "a1b2c3d4e5f6...",
  "storage_url": "sources/user123/a1b2c3d4e5f6...",
  "storage_status": "uploaded",
  "mime_type": "application/pdf",
  "file_name": "invoice.pdf",
  "byte_size": 102400,
  "source_type": "file",
  "created_at": "2024-01-15T10:30:00Z",
  "user_id": "user123"
}
```

**Note:** [Source material](../vocabulary/canonical_terms.md#source-material) is content-addressed (same bytes = same hash). See [`docs/subsystems/sources.md`](../subsystems/sources.md) for complete architecture.

See [`docs/subsystems/schema.md`](../subsystems/schema.md)
## 2. Entity Model
```typescript
interface Entity {
  id: string; // Hash-based: ent_{sha256(type:name)}
  entity_type: string; // person, company, location, invoice, etc.
  canonical_name: string; // Normalized
  aliases: string[]; // Alternate names
}
```
**Example:**
```json
{
  "id": "ent_abc123def456",
  "entity_type": "company",
  "canonical_name": "acme corp",
  "aliases": ["Acme Corp", "ACME CORP", "Acme Corporation"]
}
```
See [`docs/foundation/entity_resolution.md`](../foundation/entity_resolution.md)
## 3. [Observation](../vocabulary/canonical_terms.md#observation) Model

```typescript
interface Observation {
  id: string; // UUID
  entity_id: string; // Hash-based entity ID
  entity_type: string; // person, company, invoice, etc.
  schema_version: string; // Entity schema version used
  source_material_id: string; // UUID of source material
  interpretation_id?: string; // UUID of interpretation (null for structured ingestion or corrections)
  observed_at: string; // ISO 8601 timestamp
  specificity_score: number; // 0-1, how specific this observation is
  source_priority: number; // Priority of source (higher = more trusted)
  fields: Record<string, any>; // JSONB granular facts
  created_at: string; // ISO 8601
}
```

**Example:**
```json
{
  "id": "obs_xyz789",
  "entity_id": "ent_abc123def456",
  "entity_type": "company",
  "schema_version": "1.0",
  "source_material_id": "src_invoice_123",
  "interpretation_id": "int_abc456",
  "observed_at": "2024-01-15T10:30:00Z",
  "specificity_score": 0.9,
  "source_priority": 10,
  "fields": {
    "name": "Acme Corp",
    "address": "123 Main St",
    "tax_id": "12-3456789"
  },
  "created_at": "2024-01-15T10:30:00Z"
}
```

See [`docs/subsystems/observation_architecture.md`](../subsystems/observation_architecture.md)
## 4. Entity Snapshot Model
```typescript
interface EntitySnapshot {
  entity_id: string; // Hash-based entity ID (primary key)
  entity_type: string; // person, company, invoice, etc.
  schema_version: string; // Schema version used
  snapshot: Record<string, any>; // JSONB current truth
  computed_at: string; // ISO 8601 when snapshot computed
  observation_count: number; // Number of observations merged
  last_observation_at: string; // ISO 8601 most recent observation
  provenance: Record<string, string>; // Maps field → observation_id
}
```
**Example:**
```json
{
  "entity_id": "ent_abc123def456",
  "entity_type": "company",
  "schema_version": "1.0",
  "snapshot": {
    "name": "Acme Corp",
    "address": "123 Main St",
    "tax_id": "12-3456789",
    "contact_email": "info@acme.com"
  },
  "computed_at": "2024-01-15T10:35:00Z",
  "observation_count": 2,
  "last_observation_at": "2024-01-15T10:30:00Z",
  "provenance": {
    "name": "obs_xyz789",
    "address": "obs_xyz789",
    "tax_id": "obs_xyz789",
    "contact_email": "obs_abc456"
  }
}
```
See [`docs/subsystems/reducer.md`](../subsystems/reducer.md)
## 4.1 Four-Layer Model Integration Example

This section demonstrates how [Source Material](../vocabulary/canonical_terms.md#source-material) → [Interpretation](../vocabulary/canonical_terms.md#interpretation) → [Observation](../vocabulary/canonical_terms.md#observation) → [Entity Snapshot](../vocabulary/canonical_terms.md#entity-snapshot) layers work together with [entity schemas](../vocabulary/canonical_terms.md#entity-schema) and [reducer](../vocabulary/canonical_terms.md#reducer) engine.

### Scenario: Two Invoices from Same Vendor

**Step 1: [Source Material](../vocabulary/canonical_terms.md#source-material) [Ingestion](../vocabulary/canonical_terms.md#ingestion)**

Two invoice PDFs uploaded:

**[Source Material](../vocabulary/canonical_terms.md#source-material) 1 (Invoice INV-001):**
```json
{
  "id": "src_invoice_001",
  "content_hash": "abc123...",
  "storage_url": "sources/user123/abc123...",
  "mime_type": "application/pdf",
  "file_name": "invoice_001.pdf",
  "byte_size": 102400,
  "created_at": "2024-01-15T10:00:00Z"
}
```

**[Source Material](../vocabulary/canonical_terms.md#source-material) 2 (Invoice INV-002):**
```json
{
  "id": "src_invoice_002",
  "content_hash": "def456...",
  "storage_url": "sources/user123/def456...",
  "mime_type": "application/pdf",
  "file_name": "invoice_002.pdf",
  "byte_size": 98304,
  "created_at": "2024-02-01T10:00:00Z"
}
```
**Step 2: [Interpretation](../vocabulary/canonical_terms.md#interpretation)**

AI [interpretation](../vocabulary/canonical_terms.md#interpretation) extracts structured data from each PDF, identifying entity types and fields:

**[Interpretation](../vocabulary/canonical_terms.md#interpretation) 1 (from INV-001):** Extracts `{vendor_name: "Acme Corp", amount: 1500.00, date_issued: "2024-01-15"}`
**[Interpretation](../vocabulary/canonical_terms.md#interpretation) 2 (from INV-002):** Extracts `{vendor_name: "Acme Corporation", address: "123 Main Street", amount: 2500.00, date_issued: "2024-02-01"}`

**Step 3: [Entity](../vocabulary/canonical_terms.md#entity) Resolution**

Both [source materials](../vocabulary/canonical_terms.md#source-material) mention the same vendor (normalized to same [entity](../vocabulary/canonical_terms.md#entity)):
```json
{
  "id": "ent_abc123def456",
  "entity_type": "company",
  "canonical_name": "acme corp",
  "aliases": ["Acme Corp", "Acme Corporation"]
}
```
**Step 4: [Observation](../vocabulary/canonical_terms.md#observation) Creation**

Two [observations](../vocabulary/canonical_terms.md#observation) created for the same [entity](../vocabulary/canonical_terms.md#entity):

**[Observation](../vocabulary/canonical_terms.md#observation) 1 (from INV-001):**
```json
{
  "id": "obs_001",
  "entity_id": "ent_abc123def456",
  "entity_type": "company",
  "schema_version": "1.0",
  "source_material_id": "src_invoice_001",
  "interpretation_id": "int_001",
  "observed_at": "2024-01-15T10:00:00Z",
  "specificity_score": 0.8,
  "source_priority": 10,
  "fields": {
    "name": "Acme Corp",
    "invoice_amount": 1500.00
  }
}
```

**[Observation](../vocabulary/canonical_terms.md#observation) 2 (from INV-002):**
```json
{
  "id": "obs_002",
  "entity_id": "ent_abc123def456",
  "entity_type": "company",
  "schema_version": "1.0",
  "source_material_id": "src_invoice_002",
  "interpretation_id": "int_002",
  "observed_at": "2024-02-01T10:00:00Z",
  "specificity_score": 0.9,
  "source_priority": 10,
  "fields": {
    "name": "Acme Corporation",
    "address": "123 Main Street",
    "invoice_amount": 2500.00
  }
}
```
**Step 5: [Entity Schema](../vocabulary/canonical_terms.md#entity-schema) Lookup**

[Reducer](../vocabulary/canonical_terms.md#reducer) fetches merge policies from [entity schema](../vocabulary/canonical_terms.md#entity-schema):
```json
{
  "entity_type": "company",
  "schema_version": "1.0",
  "reducer_config": {
    "merge_policies": {
      "name": { "strategy": "highest_priority", "tie_breaker": "most_specific" },
      "address": { "strategy": "last_write" },
      "invoice_amount": { "strategy": "last_write" }
    }
  }
}
```
**Step 6: [Reducer](../vocabulary/canonical_terms.md#reducer) Execution**

[Reducer](../vocabulary/canonical_terms.md#reducer) merges [observations](../vocabulary/canonical_terms.md#observation) using [entity schema](../vocabulary/canonical_terms.md#entity-schema) policies:
- **name:** Both observations have same priority (10), but obs_002 has higher specificity_score (0.9 vs 0.8) → "Acme Corporation"
- **address:** Only obs_002 has address → "123 Main Street"
- **invoice_amount:** Last write wins → 2500.00 (from obs_002)
**Step 7: [Entity Snapshot](../vocabulary/canonical_terms.md#entity-snapshot) Computation**

Final [entity](../vocabulary/canonical_terms.md#entity) [entity snapshot](../vocabulary/canonical_terms.md#entity-snapshot) with [provenance](../vocabulary/canonical_terms.md#provenance):
```json
{
  "entity_id": "ent_abc123def456",
  "entity_type": "company",
  "schema_version": "1.0",
  "snapshot": {
    "name": "Acme Corporation",
    "address": "123 Main Street",
    "invoice_amount": 2500.00
  },
  "computed_at": "2024-02-01T10:05:00Z",
  "observation_count": 2,
  "last_observation_at": "2024-02-01T10:00:00Z",
  "provenance": {
    "name": "obs_002",
    "address": "obs_002",
    "invoice_amount": "obs_002"
  }
}
```
### [Provenance](../vocabulary/canonical_terms.md#provenance) Chain

Each [entity snapshot](../vocabulary/canonical_terms.md#entity-snapshot) field traces to [source material](../vocabulary/canonical_terms.md#source-material):
```
snapshot.name = "Acme Corporation"
  → obs_002 (higher specificity_score)
    → int_002 (interpretation)
      → src_invoice_002 (source material)
        → invoice_002.pdf

snapshot.address = "123 Main Street"
  → obs_002 (only source)
    → int_002 (interpretation)
      → src_invoice_002 (source material)
        → invoice_002.pdf

snapshot.invoice_amount = 2500.00
  → obs_002 (last write)
    → int_002 (interpretation)
      → src_invoice_002 (source material)
        → invoice_002.pdf
```

### Key Benefits Demonstrated

1. **Multi-Source Truth:** Two [source materials](../vocabulary/canonical_terms.md#source-material) contribute facts about same [entity](../vocabulary/canonical_terms.md#entity)
2. **Deterministic Merging:** [Entity schema](../vocabulary/canonical_terms.md#entity-schema) merge policies produce consistent results
3. **Full [Provenance](../vocabulary/canonical_terms.md#provenance):** Every field traces to specific [observation](../vocabulary/canonical_terms.md#observation), [interpretation](../vocabulary/canonical_terms.md#interpretation), and [source material](../vocabulary/canonical_terms.md#source-material)
4. **Out-of-Order Support:** [Source material](../vocabulary/canonical_terms.md#source-material) can arrive in any order; [reducer](../vocabulary/canonical_terms.md#reducer) recomputes [entity snapshot](../vocabulary/canonical_terms.md#entity-snapshot)
### Related Documents
- [`docs/architecture/architectural_decisions.md`](../architecture/architectural_decisions.md) — Four-layer model rationale
- [`docs/subsystems/observation_architecture.md`](../subsystems/observation_architecture.md) — Observation lifecycle
- [`docs/subsystems/reducer.md`](../subsystems/reducer.md) — Reducer merge strategies
- [`docs/subsystems/schema_registry.md`](../subsystems/schema_registry.md) — Schema registry patterns
## 5. [Relationship](../vocabulary/canonical_terms.md#relationship) Model

```typescript
interface Relationship {
  id: string; // UUID
  relationship_type: string; // PART_OF, CORRECTS, REFERS_TO, SETTLES, etc.
  source_entity_id: string; // Source entity ID
  target_entity_id: string; // Target entity ID
  source_material_id?: string; // UUID of source material that created relationship
  metadata?: Record<string, any>; // JSONB relationship-specific metadata
  created_at: string; // ISO 8601
}
```

**Example:**
```json
{
  "id": "rel_123456",
  "relationship_type": "SETTLES",
  "source_entity_id": "ent_payment_789",
  "target_entity_id": "ent_invoice_456",
  "source_material_id": "src_payment_123",
  "metadata": {
    "amount": 1500.00,
    "currency": "USD",
    "payment_method": "bank_transfer"
  },
  "created_at": "2024-01-15T10:30:00Z"
}
```

See [`docs/subsystems/relationships.md`](../subsystems/relationships.md)

## 6. [Event](../vocabulary/canonical_terms.md#event) Model

```typescript
interface Event {
  id: string; // Hash-based: evt_{sha256(source_material:field:date)}
  event_type: string; // InvoiceIssued, FlightDeparture, etc.
  event_timestamp: string; // ISO 8601
  source_material_id: string; // UUID of source material
  source_field: string; // e.g., 'date_issued'
}
```

**Example:**
```json
{
  "id": "evt_xyz789abc",
  "event_type": "InvoiceIssued",
  "event_timestamp": "2024-01-15T00:00:00Z",
  "source_material_id": "src_abc123",
  "source_field": "date_issued"
}
```
See [`docs/NEOTOMA_MANIFEST.md`](../NEOTOMA_MANIFEST.md) section 16
## 7. Graph Edges

```typescript
interface GraphEdge {
  source_id: string;
  target_id: string;
  edge_type: "source_entity" | "source_event" | "event_entity";
}
```

**[Relationships](../vocabulary/canonical_terms.md#relationship):**
- [Source Material](../vocabulary/canonical_terms.md#source-material) → [Entity](../vocabulary/canonical_terms.md#entity) (which [entities](../vocabulary/canonical_terms.md#entity) mentioned)
- [Source Material](../vocabulary/canonical_terms.md#source-material) → [Event](../vocabulary/canonical_terms.md#event) (which [events](../vocabulary/canonical_terms.md#event) derived)
- [Event](../vocabulary/canonical_terms.md#event) → [Entity](../vocabulary/canonical_terms.md#entity) (which [entities](../vocabulary/canonical_terms.md#entity) involved)

## Detailed Documentation References

- [`docs/subsystems/schema.md`](../subsystems/schema.md) — Database tables
- [`docs/subsystems/sources.md`](../subsystems/sources.md) — [Source material](../vocabulary/canonical_terms.md#source-material) architecture
- [`docs/NEOTOMA_MANIFEST.md`](../NEOTOMA_MANIFEST.md) — Sections 12, 14, 15, 16
- [`docs/subsystems/ingestion/ingestion.md`](../subsystems/ingestion/ingestion.md) — Field extraction

## Agent Instructions

### When to Load This Document

Load `docs/specs/DATA_MODELS.md` when:
- Understanding core data structures ([Source Material](../vocabulary/canonical_terms.md#source-material), [Entity](../vocabulary/canonical_terms.md#entity), [Observation](../vocabulary/canonical_terms.md#observation), [Event](../vocabulary/canonical_terms.md#event))
- Planning graph relationships
- Quick reference for data models

### Required Co-Loaded Documents

- `docs/vocabulary/canonical_terms.md` (authoritative terminology)
- `docs/NEOTOMA_MANIFEST.md` (always — sections 12, 14, 15, 16)
- `docs/subsystems/schema.md` (database schema details)
- `docs/subsystems/sources.md` ([source material](../vocabulary/canonical_terms.md#source-material) architecture)

### Constraints Agents Must Enforce

1. **Use [entity types](../vocabulary/canonical_terms.md#entity-type):** Examples must use proper [entity types](../vocabulary/canonical_terms.md#entity-type) (e.g., `"invoice"`, `"company"`)
2. **Hash-based IDs:** [Entity](../vocabulary/canonical_terms.md#entity) and [event](../vocabulary/canonical_terms.md#event) IDs are deterministic hashes
3. **Immutability:** [Source material](../vocabulary/canonical_terms.md#source-material), [entities](../vocabulary/canonical_terms.md#entity), [observations](../vocabulary/canonical_terms.md#observation), [events](../vocabulary/canonical_terms.md#event) never change after creation
4. **Typed edges:** Graph edges must specify type (source_entity, source_event, event_entity)
5. **Defer to detailed docs:** This is a summary; `schema.md` and `sources.md` are authoritative

### Forbidden Patterns

- Using deprecated "record" terminology (use "[source material](../vocabulary/canonical_terms.md#source-material)" or "[entity](../vocabulary/canonical_terms.md#entity)")
- Non-deterministic IDs (random UUIDs for [entities](../vocabulary/canonical_terms.md#entity)/[events](../vocabulary/canonical_terms.md#event))
- Modifying data models after creation
- Creating untyped graph edges
- Orphan nodes or cycles in graph

### Validation Checklist

- [ ] Examples use correct [entity types](../vocabulary/canonical_terms.md#entity-type) (invoice, company, person)
- [ ] [Entity](../vocabulary/canonical_terms.md#entity) IDs follow hash-based pattern: `ent_{sha256(type:name)}`
- [ ] [Event](../vocabulary/canonical_terms.md#event) IDs follow hash-based pattern: `evt_{sha256(source_material:field:date)}`
- [ ] Graph edges are typed correctly
- [ ] Data models match schema.md and sources.md
- [ ] No violations of immutability
- [ ] Cross-checked against NEOTOMA_MANIFEST.md
