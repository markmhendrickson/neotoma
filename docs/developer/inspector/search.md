---
title: Inspector — Search
summary: Cross-entity full-text search backed by the search subsystem.
category: development
subcategory: ui
order: 100
audience: developer
visibility: public
tags: [inspector, search]
---

# Inspector — Search

The Search screen (`/inspector/search`) issues queries against the search
subsystem and renders hits across every searchable entity type.

## Capabilities

- **Full-text query.** Tokenized search over `canonical_name`, declared
  searchable fields, and observation values.
- **Type filter.** Restrict to one or more entity types.
- **Time filter.** Restrict to entities last observed within a range.
- **Hit detail.** Each hit links through to the Entity detail screen.

## Determinism caveat

Ranking is deterministic for fixed inputs, but the search index may lag the
write path; a freshly-written entity may take one reindex cycle to appear.
That lag is part of the search subsystem's contract — see
`docs/subsystems/search.md`.

## Related

- `docs/subsystems/search.md`
