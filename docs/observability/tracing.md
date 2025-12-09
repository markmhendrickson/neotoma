# Neotoma Tracing Standard
*(Distributed Tracing Spans and Context Propagation)*

---

## Purpose

Defines distributed tracing for debugging and performance analysis.

---

## Span Naming

**Pattern:** `{subsystem}.{operation}`

**Examples:**
- `ingestion.ingest_file`
- `extraction.extract_fields`
- `search.execute_query`

---

## Span Attributes

```typescript
{
  "span_name": "ingestion.ingest_file",
  "start_time": "2024-01-15T10:30:00.000Z",
  "duration_ms": 1234,
  "attributes": {
    "file_size_bytes": 1048576,
    "schema_type": "FinancialRecord",
    "record_id": "rec_xyz"
  }
}
```

---

## Trace Propagation

**Pattern:** `trace_id` passed through all layers.

```typescript
async function ingestFile(file: File, traceId: string): Promise<Record> {
  const span = startSpan('ingestion.ingest_file', { trace_id: traceId });
  
  try {
    // ... ingestion logic ...
    return record;
  } finally {
    span.end();
  }
}
```

---

## Agent Instructions

Load when adding tracing or debugging distributed flows.

Required co-loaded: `docs/observability/logging.md`

Constraints:
- MUST propagate trace_id
- MUST NOT include PII in attributes










