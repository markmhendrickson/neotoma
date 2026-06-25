---
title: Working with Your Memory
summary: How facts get stored, how to correct and reconcile them, how to search, and how to export everything.
category: getting_started
audience: user
visibility: public
order: 40
featured: false
tags: [store, correct, merge, search, export, usage]
---

# Working with Your Memory

This page explains the everyday loop: agents write facts, you inspect and correct them, you search, and you can export everything. It links to the deeper subsystem docs where you want the full detail.

## What gets stored, and when

Neotoma stores only what you or your agent explicitly write. There is no background scanning. The recommended agent behavior is store-first: an agent retrieves what it already knows, then stores the user's message and any facts implied by it, as immutable observations.

A fact becomes an entity through a deterministic pipeline: a **source** (the raw input, stored once) yields **observations** (atomic facts), which resolve to an **entity**, whose **snapshot** is the current reduced state. See [what to store](../foundation/what_to_store.md) and [record types](../subsystems/record_types.md).

You can store structured records directly or ingest files. Supported file formats are PDF (with a first-page image fallback), CSV (chunked for large files), Parquet, JSON, and text; images and audio are kept as raw sources. Ingestion is content-addressed and idempotent, so re-ingesting the same content does not create duplicates. See [sources](../subsystems/sources.md).

## Correcting facts

You never edit a stored value in place. A correction is a new, high-priority observation that wins when the snapshot is computed, while the prior value stays in history. Correct a field from the Inspector entity detail, or through the `correct` operation. Because corrections carry the highest priority, they hold across tools and sessions. The reducer that computes snapshots from observations is described in [the reducer](../subsystems/reducer.md).

## Reconciling entities

When two records turn out to be the same thing, **merge** them: observations and relationships move onto one entity, with an audit record. When one record should become two, **split** it by a rule (for example, by source or date). Both operations are transactional and reversible to inspect. The Inspector surfaces likely duplicates. See [entity merge](../subsystems/entity_merge.md).

To remove something, **soft-delete** it (reversible, audited) or run a GDPR-style deletion for stronger removal. See [deletion](../subsystems/deletion.md).

## Searching and retrieving

You can find entities by identifier (name, email, and similar), resolve identity from several signals at once with confidence scoring, filter by type and field, traverse relationships, and pull a graph neighborhood. When you configure an embedding key, Neotoma also runs semantic vector search over snapshots, stored locally. Without it, keyword and identifier search still work. See [vector operations](../subsystems/vector_ops.md).

## Relationships and timeline

Connect entities with typed relationships (for example `PART_OF`, `DEPENDS_ON`, `REFERS_TO`). Date fields automatically emit timeline events, giving you a replayable history across types. See [relationships](../subsystems/relationships.md) and [timeline events](../subsystems/timeline_events.md).

## Exporting and owning your data

Your data is portable. You can produce:

- A bounded `MEMORY.md` summary suitable for handing to an agent.
- A JSON snapshot export with full provenance and attribution metadata.
- A complete canonical Markdown mirror of every entity, relationship, source, and timeline day, which is deterministic and git-trackable.

See the [canonical Markdown mirror](../subsystems/markdown_mirror.md). Combined with local storage, this means you can leave at any time with everything.

## Privacy and trust

Your data stays local and is never used for training. Logs and event payloads carry IDs, not personal content. Optional at-rest encryption protects sensitive columns. See [privacy](../subsystems/privacy.md) and the security overview in [the architecture doc](../architecture/architecture.md).

## Next steps

- [Using the Inspector](using_the_inspector.md) to do all of the above visually.
- [Architecture](../architecture/architecture.md) and [Determinism](../architecture/determinism.md) for how the guarantees hold.
