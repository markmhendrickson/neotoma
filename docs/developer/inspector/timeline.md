---
title: Inspector — Timeline
summary: View events derived from temporal fields on entities, in chronological order.
category: development
subcategory: ui
order: 60
audience: developer
visibility: public
tags: [inspector, timeline, events]
---

# Inspector — Timeline

The Timeline screen (`/inspector/timeline`) renders the events that the
reducer extracted from temporal fields on entities.

## How events are formed

- Every schema declares `temporal_fields`. When a value in one of those
  fields is set or changes, the reducer emits a deterministic
  `timeline_event` with a hash-based ID.
- Events are immutable once written, just like observations.
- The Timeline screen reads events through `list_timeline_events`, sorted
  ascending or descending by `event_time`.

## Filters

- Entity type or specific entity.
- Date range.
- Event kind (create, update, custom — depending on the schema).

## Why determinism matters

The same set of observations always yields the same set of events with the
same IDs. That's how a downstream system can subscribe to the timeline,
check-point on an event ID, and resume safely. See
`docs/foundation/timeline_events.md`.

## Related

- `docs/foundation/timeline_events.md`
- `docs/subsystems/events.md`
- `docs/subsystems/reducer.md`
