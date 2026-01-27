# Neotoma v0.2.15 - Complete Architecture Migration

**Authoritative Vocabulary:** [`docs/vocabulary/canonical_terms.md`](../../vocabulary/canonical_terms.md)

**Status:** ✅ Implemented (Pending Database Migrations)  
**Breaking Changes:** Yes  
**Migration Required:** Yes

## Overview

Version 0.2.15 completes Neotoma's architectural migration to a unified [source](../../vocabulary/canonical_terms.md#source)-based truth model. This release:

- Unifies all [ingestion](../../vocabulary/canonical_terms.md#ingestion) into a single `ingest` MCP action
- Eliminates the capability concept (rules moved to [entity schemas](../../vocabulary/canonical_terms.md#entity-schema))
- Removes the legacy records table
- Aligns all documentation to [`docs/vocabulary/canonical_terms.md`](../../vocabulary/canonical_terms.md)

See `release_plan.md` for complete details.

## Quick Links

- **Release Plan:** [release_plan.md](./release_plan.md)
- **Canonical Vocabulary:** [`docs/vocabulary/canonical_terms.md`](../../vocabulary/canonical_terms.md)
- **Migration Script:** `../../scripts/migrate-records-to-sources-v0.2.15.ts`
- **SQL Migrations:** `./migrations/`

## Breaking Changes Summary

### Removed APIs
- HTTP: `/store_record`, `/update_record`, `/retrieve_records`, `/delete_record`
- MCP: `update_record`, `retrieve_records`, `delete_record`

### Deprecated APIs (Removed in v0.2.16)
- MCP: `submit_payload`, `ingest_structured` (merged into unified `ingest`)

### New APIs
- HTTP: `/entities/query`, `/observations/create`, `/entities/merge`
- MCP: Unified `ingest` (for all [source](../../vocabulary/canonical_terms.md#source))

### Removed Database Tables
- `records`
- `record_relationships`
- `record_entity_edges`
- `record_event_edges`

### Removed Concepts
- Capabilities (rules moved to [entity schemas](../../vocabulary/canonical_terms.md#entity-schema))

## Migration Quickstart

```bash
# 1. Backup database
pg_dump neotoma > backup_$(date +%Y%m%d).sql

# 2. Dry run
npm run migrate:records-to-sources -- --user-id <uuid> --dry-run

# 3. Execute
npm run migrate:records-to-sources -- --user-id <uuid>

# 4. Apply schema migrations
npm run migrate:up
```

## Terminology

This release aligns to the authoritative vocabulary defined in [`docs/vocabulary/canonical_terms.md`](../../vocabulary/canonical_terms.md):

| Term | Definition |
|------|------------|
| [Source](../../vocabulary/canonical_terms.md#source) | Raw data (structured or unstructured) that gets [ingested](../../vocabulary/canonical_terms.md#ingestion) |
| [Observation](../../vocabulary/canonical_terms.md#observation) | Granular facts [extracted](../../vocabulary/canonical_terms.md#extraction) from [source](../../vocabulary/canonical_terms.md#source) |
| [Entity](../../vocabulary/canonical_terms.md#entity) | Canonical representation of a person, company, or location |
| [Entity Snapshot](../../vocabulary/canonical_terms.md#entity-snapshot) | Deterministic [reducer](../../vocabulary/canonical_terms.md#reducer) output representing current truth |
| [Entity Schema](../../vocabulary/canonical_terms.md#entity-schema) | Versioned definition of fields, validators, merge policies, and extraction rules |

## Support

Questions? See the full release plan or contact the development team.
