---
title: Inspector — Relationships and Graph
summary: Inspect typed edges between entities and walk a small graph neighborhood around any node.
category: development
subcategory: ui
order: 40
audience: developer
visibility: public
tags: [inspector, relationships, graph]
---

# Inspector — Relationships and Graph

The Relationships and Graph screen (`/inspector/relationships-and-graph`)
surfaces the typed edges between entities and a localized graph view for
walking neighborhoods.

## Relationships

- Every relationship has a type, a source entity, a target entity, and
  optional metadata (e.g. role, weight, time bounds).
- Hierarchical types (`PART_OF`, `DEPENDS_ON`) are cycle-checked at write
  time; the Inspector relies on that invariant and refuses to render cycles.
- Edges are deduplicated by (type, source, target). Re-issuing the same edge
  is idempotent.

## Graph view

The graph view fetches a bounded neighborhood around the focused entity using
the `retrieve_graph_neighborhood` API. Depth and edge-type filter are
controlled by URL query params so the view is shareable and deterministic.

The Inspector deliberately caps the rendered neighborhood (small graph, not
full graph) — Neotoma is not a graph database, and a large rendering would
mislead about what the State Layer guarantees.

## Related

- `docs/subsystems/relationships.md`
- `docs/architecture/architecture.md`
