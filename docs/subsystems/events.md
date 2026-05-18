---
title: "Neotoma System Events — Observability Event Stream"
summary: "**Authoritative Vocabulary:** [`docs/vocabulary/canonical_terms.md`](../vocabulary/canonical_terms.md)"
---

# Neotoma System Events — Observability Event Stream

**Authoritative Vocabulary:** [`docs/vocabulary/canonical_terms.md`](../vocabulary/canonical_terms.md)

## Scope

This document covers Neotoma's **observability event stream** — short-lived emissions that describe state changes inside the system (uploads, ingestion runs, snapshot recomputes, search executions). They exist to feed metrics, logs, distributed traces, and dashboards.

This document does NOT cover:

- The user-facing **timeline event** record type (`timeline_events` table) — see [`docs/subsystems/timeline_events.md`](./timeline_events.md) and the foundation doctrine in [`docs/foundation/timeline_events.md`](../foundation/timeline_events.md). Those events are durable, source-anchored records of dates extracted from sources; the events on this page are transient observability signals about Neotoma's own operation.
- The application-level entity type `event` (calendar/meeting), which is stored as an [entity](../vocabulary/canonical_terms.md#entity).
- Logging and metrics conventions — see [`docs/observability/logging.md`](../observability/logging.md) and [`docs/observability/metrics_standard.md`](../observability/metrics_standard.md).

When this document says "event" without qualification, it always means a system observability event in the sense above.

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

## Event Types

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

  await emitEvent({
    event_type: 'source.created',
    timestamp: new Date().toISOString(),
    payload: { source_id: source.id, mime_type: source.mime_type },
  });

  return source;
}
```

## Agent Instructions

Load when emitting observability events, tracking state changes, or wiring up traces and metrics.

Required co-loaded: [`docs/observability/metrics_standard.md`](../observability/metrics_standard.md), [`docs/observability/logging.md`](../observability/logging.md).

### Constraints

- MUST emit events for state changes that downstream observability depends on.
- MUST NOT include PII in event payloads (use IDs, never raw values).
- MUST include `trace_id` when emitting from a request that already has a trace context.
- MUST NOT confuse system events (this document) with the `timeline_events` record type. If a piece of work needs to record a date drawn from a source for the user-facing timeline, see [`docs/subsystems/timeline_events.md`](./timeline_events.md) instead.

## Related Documents

- [`docs/subsystems/timeline_events.md`](./timeline_events.md) — User-facing timeline event record type (distinct from this stream)
- [`docs/foundation/timeline_events.md`](../foundation/timeline_events.md) — Timeline-and-event doctrine
- [`docs/observability/metrics_standard.md`](../observability/metrics_standard.md) — Metrics conventions
- [`docs/observability/logging.md`](../observability/logging.md) — Logging conventions
