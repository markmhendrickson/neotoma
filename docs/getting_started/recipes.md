---
title: Recipes
summary: Task-oriented recipes for common Neotoma work: ingesting files, capturing conversations, defining a custom entity type, and querying the graph in a loop.
category: getting_started
audience: developer
visibility: public
order: 50
tags: [recipes, how-to, ingestion, conversation, schema, graph]
---

# Recipes

Short, task-oriented recipes for building on Neotoma. Each shows the operation in both the CLI and the MCP/REST surface, and links to the deeper reference. For the agent behavior contract these recipes assume (store-first, idempotency), see the [MCP instructions](../developer/mcp/instructions.md).

## Ingest and parse a file

Store a file as an immutable source and extract structured records from it.

```bash
neotoma upload ./invoice.pdf
```

What happens: the file is stored once (content-addressed by SHA-256), then text is extracted (PDF with a first-page image fallback, CSV with chunking, Parquet, JSON, and text; images and audio are kept as raw sources). An agent then extracts entities from the text and stores them.

From an agent, parse without storing first if you only need the text:

- `parse_file` returns extracted text and page images for a local or base64 file.
- `store` with `file_path` or base64 `file_content` ingests and (for an agent turn) extracts records.

See [sources](../subsystems/sources.md) and [file ingestion in Working with Your Memory](working_with_your_memory.md).

## Capture a conversation

Record a conversation and its messages so agents share context across sessions.

Store a `conversation` entity and one `conversation_message` per turn, linked to the conversation. Follow the store-first turn protocol: retrieve what you already know, store the user message and any entities it implies, then store the assistant reply at the end of the turn. The canonical contract is in the [MCP instructions](../developer/mcp/instructions.md); the data model is in [conversation turns](../subsystems/conversation_turn.md).

```bash
neotoma store --json='[{"entity_type":"conversation","slug":"2026-06-25-planning","title":"Planning sync"}]'
```

Browse captured turns in the Inspector under Conversations and Turns (see [Using the Inspector](using_the_inspector.md)).

## Define a custom entity type

You do not need to register a schema first. Store records of a new type and Neotoma infers a user-scoped schema on first write; fields it does not yet know are preserved in `raw_fragments` rather than dropped.

```bash
neotoma store --json='[{"entity_type":"subscription_plan","slug":"pro-annual","name":"Pro (annual)","price_usd":120,"renews":"yearly"}]'
```

To make a type explicit, register or evolve its schema:

- `register_schema` declares a schema (fields, canonical-name rules, merge policies).
- `update_schema_incremental` adds or removes fields with versioning, optionally migrating existing `raw_fragments`.
- `get_schema_recommendations` / `analyze_schema_candidates` surface recurring undeclared fields worth promoting.

Use singular type names (`subscription_plan`, not `subscription_plans`). See [schema management](../architecture/schema_handling.md) and [the schema registry](../subsystems/schema_registry.md).

## Query the graph in a loop

A common agent pattern: resolve an entity, then walk its relationships and timeline to assemble context.

1. Resolve the entity by identifier or signals: `retrieve_entity_by_identifier` (name, email) or `identify_entity_by_signals` (multiple signals with confidence).
2. Pull its current state: `retrieve_entity_snapshot`.
3. Expand outward: `retrieve_related_entities` (typed edges, N hops) or `retrieve_graph_neighborhood` (entities, relationships, sources, events around a node).
4. Add time context: `list_timeline_events` filtered by entity, type, or date range.

```bash
neotoma entities get --identifier "Acme Inc"
neotoma relationships list --entity <entity_id>
neotoma timeline list --entity <entity_id>
```

When an embedding key is configured, `retrieve_entities` also supports semantic search over snapshots; keyword and identifier resolution work without it. See [relationships](../subsystems/relationships.md), [timeline events](../subsystems/timeline_events.md), and [vector operations](../subsystems/vector_ops.md).

## Next steps

- [Working with Your Memory](working_with_your_memory.md) for the concepts behind these operations.
- [MCP instructions](../developer/mcp/instructions.md) and [REST API](../api/rest_api.md) for the full operation surface.
- [Client SDKs](../developer/sdk_agent.md) to call these from TypeScript or Python.
