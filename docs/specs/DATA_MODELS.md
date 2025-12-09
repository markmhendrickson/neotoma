# Neotoma Data Models

_(Consolidated Schema Specifications)_

---

**Note:** This is a **high-level summary** document for quick reference. For implementation details, see:

- [`docs/subsystems/schema.md`](../subsystems/schema.md) — Complete database schema, JSONB structures, migrations
- [`docs/subsystems/record_types.md`](../subsystems/record_types.md) — Complete type catalog, field mappings, extraction rules
- [`docs/subsystems/ingestion/ingestion.md`](../subsystems/ingestion/ingestion.md) — Field extraction implementation
- [`docs/NEOTOMA_MANIFEST.md`](../NEOTOMA_MANIFEST.md) — Sections 12, 15, 16 (data model doctrine)

**In case of conflict, detailed subsystem docs are authoritative.**

---

## Purpose

Consolidates data model specifications for Neotoma's four-layer truth model (Document → Entity → Observation → Snapshot) with complete examples for quick reference.

---

## Four-Layer Truth Model

Neotoma implements a four-layer truth model:

1. **Document** — the file itself (PDF, email, CSV, image)
2. **Entity** — the logical thing in the world with a stable ID
3. **Observation** — granular, source-specific facts extracted from documents
4. **Snapshot** — deterministic reducer output representing current truth

This model enables:
- Multiple sources to contribute observations about the same entity
- Deterministic merging via reducers
- Full provenance: every snapshot field traces to specific observations and documents
- Out-of-order ingestion support

See [`docs/architecture/architectural_decisions.md`](../architecture/architectural_decisions.md) for complete architectural rationale.

---

## 1. Document Model

```typescript
interface Record {
  id: string; // UUID
  type: string; // Schema type
  properties: Record<string, any>; // JSONB extracted fields
  file_urls: string[]; // Storage URLs
  embedding?: number[]; // 1536-dim vector
  summary?: string; // Optional summary
  created_at: string; // ISO 8601
  updated_at: string;
}
```

**Example (Invoice — Application Type):**

```json
{
  "id": "rec_abc123",
  "type": "invoice",
  "properties": {
    "schema_version": "1.0",
    "invoice_number": "INV-2024-001",
    "amount": 1500.0,
    "currency": "USD",
    "date_issued": "2024-01-15T00:00:00Z",
    "vendor_name": "Acme Corp"
  },
  "file_urls": ["https://storage.example.com/invoice.pdf"],
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

**Note:** Uses application type `"invoice"` (not schema family `"FinancialRecord"`). See [`docs/subsystems/record_types.md`](../subsystems/record_types.md) for complete type catalog.

See [`docs/subsystems/schema.md`](../subsystems/schema.md)

---

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

---

## 3. Observation Model

```typescript
interface Observation {
  id: string; // UUID
  entity_id: string; // Hash-based entity ID
  entity_type: string; // person, company, invoice, etc.
  schema_version: string; // Schema version used
  source_record_id: string; // UUID of source document
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
  "source_record_id": "rec_invoice_123",
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

---

## 4. Snapshot Model

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

---

## 4.1 Four-Layer Model Integration Example

This section demonstrates how Document → Entity → Observation → Snapshot layers work together with schema registry and reducer engine.

### Scenario: Two Invoices from Same Vendor

**Step 1: Document Ingestion**

Two invoice documents uploaded:

**Document 1 (Invoice INV-001):**

```json
{
  "id": "rec_invoice_001",
  "type": "invoice",
  "properties": {
    "schema_version": "1.0",
    "invoice_number": "INV-001",
    "vendor_name": "Acme Corp",
    "amount": 1500.00,
    "date_issued": "2024-01-15"
  },
  "file_urls": ["https://storage.example.com/invoice_001.pdf"],
  "created_at": "2024-01-15T10:00:00Z"
}
```

**Document 2 (Invoice INV-002):**

```json
{
  "id": "rec_invoice_002",
  "type": "invoice",
  "properties": {
    "schema_version": "1.0",
    "invoice_number": "INV-002",
    "vendor_name": "Acme Corporation",
    "address": "123 Main Street",
    "amount": 2500.00,
    "date_issued": "2024-02-01"
  },
  "file_urls": ["https://storage.example.com/invoice_002.pdf"],
  "created_at": "2024-02-01T10:00:00Z"
}
```

**Step 2: Entity Resolution**

Both documents mention the same vendor (normalized to same entity):

```json
{
  "id": "ent_abc123def456",
  "entity_type": "company",
  "canonical_name": "acme corp",
  "aliases": ["Acme Corp", "Acme Corporation"]
}
```

**Step 3: Observation Creation**

Two observations created for the same entity:

**Observation 1 (from INV-001):**

```json
{
  "id": "obs_001",
  "entity_id": "ent_abc123def456",
  "entity_type": "company",
  "schema_version": "1.0",
  "source_record_id": "rec_invoice_001",
  "observed_at": "2024-01-15T10:00:00Z",
  "specificity_score": 0.8,
  "source_priority": 10,
  "fields": {
    "name": "Acme Corp",
    "invoice_amount": 1500.00
  }
}
```

**Observation 2 (from INV-002):**

```json
{
  "id": "obs_002",
  "entity_id": "ent_abc123def456",
  "entity_type": "company",
  "schema_version": "1.0",
  "source_record_id": "rec_invoice_002",
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

**Step 4: Schema Registry Lookup**

Reducer fetches merge policies from schema registry:

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

**Step 5: Reducer Execution**

Reducer merges observations using schema registry policies:

- **name:** Both observations have same priority (10), but obs_002 has higher specificity_score (0.9 vs 0.8) → "Acme Corporation"
- **address:** Only obs_002 has address → "123 Main Street"
- **invoice_amount:** Last write wins → 2500.00 (from obs_002)

**Step 6: Snapshot Computation**

Final entity snapshot with provenance:

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

### Provenance Chain

Each snapshot field traces to source:

```
snapshot.name = "Acme Corporation"
  → obs_002 (higher specificity_score)
    → rec_invoice_002
      → invoice_002.pdf

snapshot.address = "123 Main Street"
  → obs_002 (only source)
    → rec_invoice_002
      → invoice_002.pdf

snapshot.invoice_amount = 2500.00
  → obs_002 (last write)
    → rec_invoice_002
      → invoice_002.pdf
```

### Key Benefits Demonstrated

1. **Multi-Source Truth:** Two documents contribute facts about same entity
2. **Deterministic Merging:** Schema registry merge policies produce consistent results
3. **Full Provenance:** Every field traces to specific observation and document
4. **Out-of-Order Support:** Documents can arrive in any order; reducer recomputes snapshot

### Related Documents

- [`docs/architecture/architectural_decisions.md`](../architecture/architectural_decisions.md) — Four-layer model rationale
- [`docs/subsystems/observation_architecture.md`](../subsystems/observation_architecture.md) — Observation lifecycle
- [`docs/subsystems/reducer.md`](../subsystems/reducer.md) — Reducer merge strategies
- [`docs/subsystems/schema_registry.md`](../subsystems/schema_registry.md) — Schema registry patterns

---

## 5. Relationship Model

```typescript
interface Relationship {
  id: string; // UUID
  relationship_type: string; // PART_OF, CORRECTS, REFERS_TO, SETTLES, etc.
  source_entity_id: string; // Source entity ID
  target_entity_id: string; // Target entity ID
  source_record_id?: string; // UUID of document that created relationship
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
  "source_record_id": "rec_payment_123",
  "metadata": {
    "amount": 1500.00,
    "currency": "USD",
    "payment_method": "bank_transfer"
  },
  "created_at": "2024-01-15T10:30:00Z"
}
```

See [`docs/subsystems/relationships.md`](../subsystems/relationships.md)

---

## 6. Event Model

```typescript
interface Event {
  id: string; // Hash-based: evt_{sha256(record:field:date)}
  event_type: string; // InvoiceIssued, FlightDeparture, etc.
  event_timestamp: string; // ISO 8601
  source_record_id: string; // UUID
  source_field: string; // e.g., 'date_issued'
}
```

**Example:**

```json
{
  "id": "evt_xyz789abc",
  "event_type": "InvoiceIssued",
  "event_timestamp": "2024-01-15T00:00:00Z",
  "source_record_id": "rec_abc123",
  "source_field": "date_issued"
}
```

See [`docs/NEOTOMA_MANIFEST.md`](../NEOTOMA_MANIFEST.md) section 16

---

## 4. Graph Edges

```typescript
interface GraphEdge {
  source_id: string;
  target_id: string;
  edge_type: "record_entity" | "record_event" | "event_entity";
}
```

**Relationships:**

- Record → Entity (which entities mentioned)
- Record → Event (which events derived)
- Event → Entity (which entities involved)

---

## Detailed Documentation References

- [`docs/subsystems/schema.md`](../subsystems/schema.md) — Database tables
- [`docs/subsystems/record_types.md`](../subsystems/record_types.md) — Complete type catalog, field mappings
- [`docs/NEOTOMA_MANIFEST.md`](../NEOTOMA_MANIFEST.md) — Sections 12, 14, 15, 16
- [`docs/subsystems/ingestion/ingestion.md`](../subsystems/ingestion/ingestion.md) — Field extraction

---

## Agent Instructions

### When to Load This Document

Load `docs/specs/DATA_MODELS.md` when:

- Understanding core data structures (Record, Entity, Event)
- Planning graph relationships
- Quick reference for data models

### Required Co-Loaded Documents

- `docs/NEOTOMA_MANIFEST.md` (always — sections 12, 14, 15, 16)
- `docs/subsystems/schema.md` (database schema details)
- `docs/subsystems/record_types.md` (complete type catalog and field mappings)

### Constraints Agents Must Enforce

1. **Use application types:** Examples must use `"type": "invoice"` (not `"FinancialRecord"`)
2. **Hash-based IDs:** Entity and event IDs are deterministic hashes
3. **Immutability:** Records, entities, events never change after creation
4. **Typed edges:** Graph edges must specify type (record_entity, record_event, event_entity)
5. **Defer to detailed docs:** This is a summary; `schema.md` and `record_types.md` are authoritative

### Forbidden Patterns

- Using schema family names in examples or code (`Financial`, `Productivity`)
- Non-deterministic IDs (random UUIDs for entities/events)
- Modifying data models after creation
- Creating untyped graph edges
- Orphan nodes or cycles in graph

### Validation Checklist

- [ ] Examples use application types (invoice, receipt, contract)
- [ ] Entity IDs follow hash-based pattern: `ent_{sha256(type:name)}`
- [ ] Event IDs follow hash-based pattern: `evt_{sha256(record:field:date)}`
- [ ] Graph edges are typed correctly
- [ ] Data models match schema.md and record_types.md
- [ ] No violations of immutability
- [ ] Cross-checked against NEOTOMA_MANIFEST.md
