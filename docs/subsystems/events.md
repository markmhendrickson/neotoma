# Neotoma Events — Event Emission and Observability

**Authoritative Vocabulary:** [`docs/vocabulary/canonical_terms.md`](../vocabulary/canonical_terms.md)

*(Event Envelope Schema and Emission Rules)*

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
## [Event](../vocabulary/canonical_terms.md#event) Types
| Event Type | When Emitted | Payload |
|------------|--------------|---------|
| `source.created` | [Source](../vocabulary/canonical_terms.md#source) stored | `{ source_id, mime_type }` |
| `observation.created` | [Observation](../vocabulary/canonical_terms.md#observation) created | `{ observation_id, entity_id }` |
| `entity.created` | [Entity](../vocabulary/canonical_terms.md#entity) created | `{ entity_id, entity_type }` |
| `snapshot.computed` | [Snapshot](../vocabulary/canonical_terms.md#snapshot) recomputed | `{ entity_id, observation_count }` |
| `ingestion.started` | [Ingestion](../vocabulary/canonical_terms.md#ingestion) begins | `{ source_id }` |
| `ingestion.completed` | [Ingestion](../vocabulary/canonical_terms.md#ingestion) succeeds | `{ source_id, entities_created, duration_ms }` |
| `ingestion.failed` | [Ingestion](../vocabulary/canonical_terms.md#ingestion) fails | `{ source_id, error_code, message }` |
| `interpretation.completed` | [Interpretation](../vocabulary/canonical_terms.md#interpretation) completes | `{ interpretation_id, source_id, observations_created }` |
| `search.executed` | Search query run | `{ query, results_count, duration_ms }` |
## Emission Pattern
```typescript
async function createSourceNode(data: SourceNodeInput): Promise<SourceNode> {
  const source = await db.insert('sources', data);
  
  // Emit event
  await emitEvent({
    event_type: 'source.created',
    timestamp: new Date().toISOString(),
    payload: { source_id: source.id, mime_type: source.mime_type },
  });
  
  return source;
}
```
## Agent Instructions
Load when emitting events, tracking state changes, or implementing observability.
Required co-loaded: `docs/observability/metrics_standard.md`, `docs/observability/logging.md`
Constraints:
- MUST emit events for state changes
- MUST NOT include PII in events
- MUST include trace_id for distributed tracing
