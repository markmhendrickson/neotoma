---
title: Inspector — Entities
summary: Browse, search, and inspect entities stored in the State Layer.
category: development
subcategory: ui
order: 20
audience: developer
visibility: public
tags: [inspector, entities]
---

# Inspector — Entities

The Entities screen (`/inspector/entities`) is a paginated, filterable browser
over every entity Neotoma has stored. It is the most-used Inspector screen
because the entity is Neotoma's primary unit of state.

## What you see

- **List view.** Type filter, free-text search, sort by `created_at` /
  `observed_at` / `entity_type`. Each row shows the entity's display name
  (from `getEntityDisplayName`), type, and last-observed timestamp.
- **Detail view.** Clicking through opens the canonical snapshot — the
  deterministic reducer output for that entity. Tabs surface observations,
  relationships, sources, and timeline events for the entity.
- **Markdown preview.** A side panel renders the entity using
  `canonical_markdown` so what you see in the Inspector matches what MCP and
  the CLI emit.

## Determinism guarantees

Snapshots are sorted in `observed_at DESC, id ASC` order. The same entity
viewed twice produces byte-identical output (modulo timestamps in the
"now" column, which are server-formatted from the entity's own timestamps,
not the wall clock). See `docs/architecture/determinism.md`.

## Related

- `docs/foundation/entity_resolution.md`
- `docs/subsystems/reducer.md`
- `docs/subsystems/observation_architecture.md`
- `docs/developer/inspector/observations_and_sources.md`
