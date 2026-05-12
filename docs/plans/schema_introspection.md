# Schema Introspection and Field Promotion

## Context

Lemonbrand needs self-diagnostic capability: "A `neotoma schemas describe --entity-type prompt --user-id simon` verb that returns fields the active reducer will accept and surface would let Lemonbrand self-diagnose field drift." The `schemas describe` command has been implemented as part of the immediate fixes. This plan covers the broader field promotion documentation and self-service diagnostic capabilities.

## Current State

### Implemented (this sprint)
- `neotoma schemas describe <entity-type>` — Shows registered fields, their types, and canonical name fields
- `neotoma schemas get --entity-type <type>` — Raw schema fetch
- `neotoma schemas analyze <type>` — Analyzes raw_fragments for field candidates
- `neotoma schemas recommend <type>` — Recommends schema updates
- `neotoma schemas update <type>` — Incrementally updates schema (add/remove fields)

### Schema Registry (`src/services/schema_registry.ts`)
- Manages schema definitions per entity type per user
- Supports schema versioning (major.minor)
- Fields can be added (minor bump) or removed (major bump)
- Removed fields are excluded from snapshots but observation data preserved
- `canonical_name_fields` define entity identity resolution

### Field Promotion Rules (current behavior)
1. All fields in the entity observation `fields` JSON are stored
2. Schema-registered fields are projected into entity snapshots
3. Unregistered fields remain in `raw_fragments` (observation-level only)
4. `canonical_name_fields` are used for identity resolution (determining same entity)

## Design: Self-Service Diagnostics

### `neotoma schemas diagnose <entity-type>`

A diagnostic command that checks for common field issues:
- Fields present in observations but missing from schema (candidate for promotion)
- Fields in schema but never observed (stale schema entries)
- Null-rate per field (identifies fields that are accepted but never populated)
- Identity resolution coverage (how many entities have complete canonical_name_fields)

### Field Promotion Documentation

Create `docs/subsystems/field_promotion.md`:
1. Lifecycle: observation field → raw_fragment → schema registration → snapshot projection
2. How to promote a field: `neotoma schemas update <type> --add-fields name:type`
3. How to check field status: `neotoma schemas describe <type>`
4. How to find missing fields: `neotoma schemas analyze <type>`
5. Impact of removal: field excluded from new snapshots, data preserved in observations

### Reducer Introspection

Expose which fields the reducer will surface for a given entity type:
- Registered schema fields → always in snapshot
- `canonical_name_fields` → used for identity
- `source_priority` → observation ordering
- `observation_source` → tie-breaking after priority

## Implementation Plan

### Phase 1: Documentation (1-2 days)
- Create `docs/subsystems/field_promotion.md`
- Document the full field lifecycle with examples
- Add troubleshooting section for common issues (null fields, missing fields)

### Phase 2: Diagnose Command (2-3 days)
- `neotoma schemas diagnose <type>` command
- Null-rate analysis per field
- Observation-vs-schema coverage report
- JSON output for automation

### Phase 3: Reducer Transparency (3-5 days)
- `neotoma schemas reducer-info <type>` showing exactly how snapshots are built
- Field weighting/priority visualization
- Temporal analysis: when fields were first observed, last updated

## Timeline

| Milestone | Target |
|-----------|--------|
| `schemas describe` shipped | Done (this sprint) |
| Field promotion docs | 2026-05-14 |
| `schemas diagnose` command | 2026-05-21 |
| Reducer transparency | 2026-06-01 |

## Open Questions

- Should `diagnose` require a user-id or be global? (Recommendation: user-scoped to match schema registry)
- Should field promotion be automatic above a frequency threshold? (Recommendation: manual, with recommendations via `analyze`)
- Real-time schema drift alerts for fleet operators? (Tie into multi-tenant ops plan)
