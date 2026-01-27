# v0.2.15 Changelog - Complete Architecture Migration

**Release Date:** January 1, 2026  
**Type:** Major Release (Breaking Changes)

## Overview

Complete migration to source-based architecture with unified ingestion, vocabulary alignment, and capability elimination.

## Breaking Changes

### Removed MCP Actions

The following MCP actions have been **removed entirely**:

- ❌ `submit_payload` → Use `ingest({entities: [...]})` instead
- ❌ `ingest_structured` → Use `ingest({entities: [...]})` instead  
- ❌ `update_record` → Use `ingest()` or `correct()` instead
- ❌ `retrieve_records` → Use `retrieve_entities()`, `get_entity_snapshot()`, or `list_observations()`
- ❌ `delete_record` → Use entity merge patterns instead

### Database Schema Changes

- Table renamed: `interpretation_runs` → `interpretations`
- New tables: `source_entity_edges`, `source_event_edges`
- Updated: `timeline_events.source_id` added, `source_record_id` made nullable
- Updated: `relationships.source_material_id` (renamed from `source_record_id`)

## New Features

### Unified `ingest()` Action

Single MCP action for all source:

**Unstructured (Files):**
```typescript
ingest({
  user_id: "...",
  file_content: "base64...",
  mime_type: "application/pdf",
  interpret: true
})
```

**Structured (Entities):**
```typescript
ingest({
  user_id: "...",
  entities: [{
    entity_type: "invoice",
    invoice_number: "INV-001",
    amount: 1500.00
  }]
})
```

### New HTTP API Endpoints

Entity-based REST API:

- `POST /api/entities/query` - Query entities with filters
- `POST /api/observations/create` - Create observations
- `POST /api/observations/query` - Query observations
- `POST /api/entities/merge` - Merge duplicate entities

## Improvements

### Code Quality

- **Code reduction:** ~450 lines of deprecated code removed
- **Simplified API:** 1 unified action instead of 3
- **Better naming:** All tables and functions use canonical vocabulary
- **Type safety:** Updated TypeScript types throughout

### Documentation

- **Vocabulary alignment:** 100% conformance to `docs/vocabulary/canonical_terms.md`
- **Updated files:** 40+ documentation files updated
- **New docs:** Implementation summary, changelog, migration guide
- **Removed ambiguity:** Clear definitions for all terms

### Architecture

- **Unified ingestion:** Single path for all source
- **No capabilities:** Normalization/extraction rules now in entity schemas
- **Better provenance:** Full chain: Source → Interpretation → Observation → Entity Snapshot
- **Simplified model:** Clearer separation of concerns

## Migration Guide

### For MCP Users

**Before (v0.2.14 and earlier):**
```typescript
// Submit structured data with capability
submit_payload({
  capability_id: "neotoma:store_invoice:v1",
  body: {
    invoice_number: "INV-001",
    amount: 1500.00
  },
  provenance: {...}
})

// Or submit without capability
ingest_structured({
  entities: [{
    entity_type: "invoice",
    ...
  }]
})
```

**After (v0.2.15+):**
```typescript
// Unified action
ingest({
  user_id: "...",
  entities: [{
    entity_type: "invoice",
    invoice_number: "INV-001",
    amount: 1500.00
  }]
})
```

### For HTTP API Users

**Before:**
```bash
POST /retrieve_records
{
  "type": "invoice",
  "limit": 100
}
```

**After:**
```bash
POST /api/entities/query
{
  "entity_type": "invoice",
  "limit": 100
}
```

### Database Migration

Apply migrations in order:

1. `20260101000001_add_source_graph_edges.sql`
2. `20260101000002_rename_interpretation_runs_to_interpretations.sql`

```bash
npm run migrate
```

Or apply manually via Supabase Dashboard SQL Editor.

## Deprecation Timeline

- **v0.2.15 (Current):** Deprecated actions removed from MCP
- **v0.2.16 (Next):** Legacy HTTP endpoints will be removed
- **v0.3.0:** Legacy `records` table and record-based architecture removed

## Files Changed

- **Modified:** 100+ files
- **Added:** 3 files (migrations, summary docs)
- **Removed:** 1 file (`payload_model.md` → `source_material_model.md`)

## Known Issues

None - all builds passing.

## Credits

Architecture redesign based on canonical vocabulary initiative.

## See Also

- [Release Plan](./release_plan.md) - Detailed migration phases
- [Implementation Summary](./implementation_summary.md) - Technical details
- [Canonical Vocabulary](../../vocabulary/canonical_terms.md) - Authoritative terms

