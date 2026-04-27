# Timeline and Event Doctrine

This document captures the high-level invariants that govern Neotoma's user-facing **timeline events** record type. It is the doctrinal counterpart to the architectural reference in [`docs/subsystems/timeline_events.md`](../subsystems/timeline_events.md), which describes the schema, derivation logic, and read paths in detail. For the unrelated observability event stream, see [`docs/subsystems/events.md`](../subsystems/events.md).

## 16.1 Event Generation Rules
Events MUST:
- Derive from extracted date fields (never inferred)
- Reflect actual dates in documents
- Be timestamp-normalized (ISO 8601)
- Be source-field-linked (traceability)
- Have deterministic IDs (hash-based)
Events MUST NOT:
- Be inferred or predicted
- Be created without source date
- Mutate after creation
## 16.2 Timeline Requirements
Timeline MUST be:
- Chronological (sorted by `event_timestamp`)
- Deterministic (same events → same order)
- Stable (events never removed without user action)
- Source-linked (every event → source record + field)
**AI MUST rely on timeline for temporal reasoning, not guess.**

## Related Documents

- [`docs/subsystems/timeline_events.md`](../subsystems/timeline_events.md) — Architectural reference for the `timeline_events` record type (schema, derivation rules, read paths)
- [`docs/subsystems/events.md`](../subsystems/events.md) — Observability event stream (distinct from timeline events)
- [`docs/subsystems/sources.md`](../subsystems/sources.md) — Source storage and reinterpretation (timeline events are derived from sources)
- [`docs/subsystems/observation_architecture.md`](../subsystems/observation_architecture.md) — How observations and snapshots feed timeline derivation
- [`docs/architecture/determinism.md`](../architecture/determinism.md) — Determinism doctrine (timeline event IDs are deterministic)
