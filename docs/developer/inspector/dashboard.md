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

## Schema-mode badge

The dashboard header MUST render a small badge reflecting the server's
current schema-authoring posture. The value comes from
`GET /server-info` under the `schema_mode` key (one of `evolving`,
`guided`, `locked`).

Visual contract:

- `evolving` (default): neutral / muted treatment; this is the historical
  default and most users will see it.
- `guided`: emphasized treatment (info tone) — agents may still author
  schemas, but only via installed bundles.
- `locked`: strongest treatment (warning tone) — no auto-create; every
  entity type MUST be registered explicitly via a bundle.

The badge MUST use existing Inspector design tokens; do not introduce new
colors. A reference implementation (`SchemaModeBadge`) lives in
`frontend/src/components/subpages/inspector/InspectorPreview.tsx` and is
used by the marketing-site Inspector previews. The live Inspector SPA in
the `inspector/` submodule consumes the same `/server-info` response and
SHOULD mirror the reference styling.

See `docs/foundation/bundles.md` and the public guide
`docs/site/pages/en/schemas/locked_vs_evolving.md` for the schema-mode
concept and operator-facing walkthrough.

## Implementation

Lives under `inspector/src/screens/Dashboard/`. Counts and recent-changes
queries are served by the regular HTTP API; the Inspector does not have a
direct DB connection.

## Related

- `docs/developer/inspector/README.md`
- `docs/foundation/bundles.md`
- `docs/site/pages/en/schemas/locked_vs_evolving.md`
- `docs/subsystems/observation_architecture.md`
- `docs/subsystems/ingestion/ingestion.md`
