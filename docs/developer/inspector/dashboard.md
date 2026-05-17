---
title: Inspector — Dashboard
summary: Top-level Inspector screen summarizing entity counts, recent observations, and ingestion health.
category: development
subcategory: ui
order: 10
audience: developer
visibility: public
tags: [inspector, dashboard]
---

# Inspector — Dashboard

The Dashboard is the landing screen of the Inspector at `/inspector`. It
summarizes the current state of the local Neotoma instance at a glance:

- **Entity counts by type.** Reads from the same source as MCP
  `get_entity_type_counts`. Schemas without registered types appear with a
  "(unregistered)" hint.
- **Recent observations.** Most recent rows from the observation log, sorted
  by `observed_at` descending. Click-through to the source record.
- **Recent changes.** Mirrors MCP `list_recent_changes` — entity creates,
  observation appends, relationship edges added.
- **Ingestion health.** Status of the most recent ingestion runs by source
  kind, with link-through to source detail.

## Implementation

Lives under `inspector/src/screens/Dashboard/`. Counts and recent-changes
queries are served by the regular HTTP API; the Inspector does not have a
direct DB connection.

## Related

- `docs/developer/inspector/README.md`
- `docs/subsystems/observation_architecture.md`
- `docs/subsystems/ingestion/ingestion.md`
