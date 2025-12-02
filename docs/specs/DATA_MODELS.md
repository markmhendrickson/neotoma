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

Consolidates data model specifications (Record, Entity, Event, Graph) with complete examples for quick reference.

---

## 1. Record Model

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
  entity_type: string; // person, company, location
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

See [`docs/NEOTOMA_MANIFEST.md`](../NEOTOMA_MANIFEST.md) section 15

---

## 3. Event Model

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
