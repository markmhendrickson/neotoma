---
title: Using the Inspector
summary: A tour of the bundled Inspector web app for browsing, correcting, and managing your Neotoma memory.
category: getting_started
audience: user
visibility: public
order: 30
featured: true
tags: [inspector, ui, console, graph, provenance]
---

# Using the Inspector

The Inspector is a web app bundled with Neotoma and served by the API server. You do not deploy it separately. When the server is running, open it in a browser (it is served at `/` for browser requests). It is your console for seeing what your agents stored and for managing the store directly.

This page tours what each area does. You can disable or relocate the Inspector with `NEOTOMA_INSPECTOR_DISABLE`, `NEOTOMA_PUBLIC_INSPECTOR_URL`, or `NEOTOMA_INSPECTOR_BASE_PATH`.

## Home and analytics

- **Home** gives an at-a-glance overview and orientation (including whether you are in a sandbox mode).
- **Analytics** (also reachable as Dashboard or Usage) shows entity counts by type, usage metrics, server health, peer status, and access/compliance overviews.

## Browsing your data

- **Entities**: browse every entity, filter by type and status, search.
- **Entity detail**: the current snapshot, raw fragments (fields not yet on the schema), observations, relationships, and timeline for one entity. From here you correct fields, merge, and delete.
- **Entity history and provenance**: the full observation history for an entity, with the agent and source behind each value.
- **Observations**, **Sources**, **Interpretations**: the raw, immutable layers beneath snapshots. Sources show the original ingested content and metadata.
- **Recent activity**: a stream of recent creates, updates, corrections, and merges.

## Relationships, timeline, and the graph

- **Relationships**: browse typed edges between entities; open one to see its snapshot and endpoints.
- **Timeline**: the global timeline of events derived from date fields; open an event for detail and related entities.
- **Graph explorer**: an interactive knowledge-graph view of an entity's neighborhood, with tree and radial layouts. Click a node to navigate to it.

## Schemas and types

- **Entity types**: the catalog of types with counts and recent activity.
- **Schemas**: browse and register schemas; open a schema to see field definitions, converters, and merge policies. New types are inferred automatically, but you can register or refine them here.

## Working with state

From entity detail you can:

- **Correct a field**: submit a correction, which becomes a high-priority observation that wins in the snapshot. The prior value is preserved in history.
- **Merge** two entities that are duplicates, moving observations and relationships onto one.
- **Delete and restore**: soft-delete an entity (reversible) with a full audit trail.

See [Working with your memory](working_with_your_memory.md) for the concepts behind these actions.

## Multi-agent control and audit

- **Agents**: every writer that has stored data, with its key, client, and usage by type.
- **Agent grants**: create, suspend, revoke, and restore least-privilege grants that scope what an agent may do and to which types.
- **Conversations and turns**: the audit trail of what an agent did in a session, including the entities it stored, corrected, and related.
- **Access policies** and **Compliance**: access rules, data retention, and tenant-isolation views.

## Federation

- **Peers**: connected Neotoma instances, their sync status, and recent changes.
- **Subscriptions**: which peers or clients are subscribed to which entity types or events.

## Search, issues, and utilities

- **Search**: find entities by identifier, filtered by type. Semantic search is available when embeddings are configured.
- **Issues**: a local issue tracker, optionally mirrored to GitHub, with bulk actions.
- **Settings**: theme (including dark mode), language, and UI preferences.
- **Docs**: the in-app documentation browser (this page is part of it).
- **Sandbox** and **Design**: a safety-report surface for demo deployments, and a design-system reference for contributors.

## Next steps

- [Working with your memory](working_with_your_memory.md)
- [Agent grants and capabilities](../subsystems/agent_capabilities.md) for the control model
- [Architecture](../architecture/architecture.md) for how the layers fit together
