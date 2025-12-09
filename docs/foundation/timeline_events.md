# Timeline and Event Doctrine

_(How Events Are Generated and Timeline Is Constructed)_

---

## Purpose

This document defines the doctrine for timeline events: how events are generated from extracted date fields and how the timeline is constructed.

---

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

---

## 16.2 Timeline Requirements

Timeline MUST be:

- Chronological (sorted by `event_timestamp`)
- Deterministic (same events → same order)
- Stable (events never removed without user action)
- Source-linked (every event → source record + field)

**AI MUST rely on timeline for temporal reasoning, not guess.**

---

## Related Documents

- [`docs/context/index.md`](../context/index.md) — Documentation navigation guide
- [`docs/foundation/data_models.md`](./data_models.md) — Data models
- [`docs/subsystems/events.md`](../subsystems/events.md) — Events subsystem

