# Neotoma Events — Event Emission and Observability
*(Event Envelope Schema and Emission Rules)*

---

## Purpose

Defines event schema and emission rules for state changes and observability.

---

## Event Envelope

```typescript
interface Event {
  event_type: string;              // e.g., 'record.created', 'ingestion.failed'
  timestamp: string;               // ISO 8601
  payload: Record<string, any>;    // Event-specific data
  trace_id?: string;               // Distributed tracing
  user_id?: string;
}
```

---

## Event Types

| Event Type | When Emitted | Payload |
|------------|--------------|---------|
| `record.created` | Record inserted | `{ record_id, type }` |
| `record.updated` | Record metadata changed | `{ record_id, fields_changed }` |
| `ingestion.started` | Ingestion begins | `{ record_id }` |
| `ingestion.completed` | Ingestion succeeds | `{ record_id, duration_ms }` |
| `ingestion.failed` | Ingestion fails | `{ record_id, error_code, message }` |
| `search.executed` | Search query run | `{ query, results_count, duration_ms }` |

---

## Emission Pattern

```typescript
async function createRecord(data: RecordInput): Promise<Record> {
  const record = await db.insert('records', data);
  
  // Emit event
  await emitEvent({
    event_type: 'record.created',
    timestamp: new Date().toISOString(),
    payload: { record_id: record.id, type: record.type },
  });
  
  return record;
}
```

---

## Agent Instructions

Load when emitting events, tracking state changes, or implementing observability.

Required co-loaded: `docs/observability/metrics_standard.md`, `docs/observability/logging.md`

Constraints:
- MUST emit events for state changes
- MUST NOT include PII in events
- MUST include trace_id for distributed tracing





