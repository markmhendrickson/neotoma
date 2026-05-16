---
title: Inspector — Observations and Sources
summary: View every observation against an entity and trace it back to the originating source record.
category: development
subcategory: ui
order: 30
audience: developer
visibility: public
tags: [inspector, observations, sources]
---

# Inspector — Observations and Sources

The Observations and Sources screen (`/inspector/observations-and-sources`)
exposes the immutable layer of the State Layer:

- **Observations** are append-only facts about an entity. Once stored, they
  are never edited; corrections create new observations.
- **Sources** are the records that produced observations — emails, file
  imports, manual entries. Sources are also immutable; reinterpretation
  creates new observations against the same source.

This screen makes the relationship between the two explicit so operators can
audit how any field on any entity got its current value.

## What you see

- **Observation log.** Filterable by entity, source, observed-at range. Each
  row shows the entity, field path, observed value, and source.
- **Source detail.** Per-source view including the raw payload (if surfaced
  by the source's parser), every observation it produced, and provenance
  metadata (parser, config hash, timestamp).
- **Reinterpretation history.** When a single source has produced multiple
  observation generations, the screen surfaces the chain so you can see how
  interpretation evolved.

## Why this matters

Per `docs/foundation/observation_architecture.md` and
`docs/architecture/idempotence_pattern.md`, every entity field traces back
through one or more observations to one or more sources. This screen is the
view a human uses to verify that the State Layer's truth claims are sound.

## Related

- `docs/subsystems/sources.md`
- `docs/subsystems/observation_architecture.md`
- `docs/architecture/idempotence_pattern.md`
- `docs/foundation/timeline_events.md`
