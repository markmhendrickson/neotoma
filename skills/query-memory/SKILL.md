---
name: query-memory
description: Search and retrieve entities, relationships, and timeline events from Neotoma memory.
triggers:
  - what do you know about
  - recall
  - find in memory
  - search neotoma
  - what happened
  - timeline
---

# Query Neotoma Memory

## When to use

When the user asks about previously stored information, wants to recall facts, explore relationships, or view a timeline of events.

## Retrieval strategy

Start with narrow, targeted queries and expand only on ambiguity or low confidence.

### By identifier (names, emails, specific items)

Use `retrieve_entity_by_identifier` first:
- Fast lookup by name, email, tax_id, or any canonical identifier.
- Optionally scope to a specific `entity_type`.

### By type or category

Use `retrieve_entities` with filters:
- `entity_type`: filter to a specific type (task, contact, event, transaction).
- `search`: free-text semantic search across all fields.
- `published_after`/`published_before`: date range filters.
- `sort_by`/`sort_order`: control ordering.
- `limit`/`offset`: pagination.

### By time

Use `list_timeline_events` for chronological queries:
- Filter by event type, date range, or source.
- Returns events derived from date fields in stored data.

### By relationships

Use `retrieve_related_entities` to traverse the entity graph:
- Start from a known entity and follow relationship links.
- Control direction (inbound, outbound, both) and hop count.

Use `retrieve_graph_neighborhood` for a full picture:
- Returns related entities, relationships, sources, and events around a node.

### Entity details

Use `retrieve_entity_snapshot` for the full current state of a single entity with provenance.
Use `list_observations` to see the complete history of changes.
Use `retrieve_field_provenance` to trace a specific field back to its source.

## Response format

When displaying retrieved entities, show a Markdown table per entity with all substantive fields. Use human-readable property names (snake_case to Title Case). Omit opaque internal IDs.

## Do not

- Run broad unfiltered queries when a specific identifier is available.
- Invent or hallucinate memory-backed claims when retrieval finds nothing.
- Skip the relationship graph when the user asks about connections between entities.
