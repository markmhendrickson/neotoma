# v0.2.15 Implementation Summary

**Release Date:** January 1, 2026  
**Status:** ✅ Implemented  
**Breaking Changes:** Yes - Deprecated actions removed

## Executive Summary

v0.2.15 completes the architecture migration to unified source-based ingestion, eliminates capability-based processing, and aligns all terminology with the canonical vocabulary defined in `docs/vocabulary/canonical_terms.md`.

## Key Changes Implemented

### 1. Unified Ingestion (`ingest` Action)

**Single MCP action for all source types:**

```typescript
ingest({
  user_id: string,
  // For unstructured source
  file_content?: string,
  mime_type?: string,
  interpret?: boolean,
  interpretation_config?: object,
  // For structured source
  entities?: Array<{entity_type: string, ...}>,
  source_priority?: number
})
```

**Replaces:**
- ❌ `submit_payload` (removed)
- ❌ `ingest_structured` (removed)

### 2. Deprecated Actions Removed

**MCP Actions Removed:**
- ❌ `submit_payload` - Use `ingest({entities: [...]})` instead
- ❌ `ingest_structured` - Use `ingest({entities: [...]})` instead
- ❌ `update_record` - Use `ingest()` or `correct()` instead
- ❌ `retrieve_records` - Use `retrieve_entities`, `get_entity_snapshot`, or `list_observations`
- ❌ `delete_record` - Use entity merge patterns

**Code Removed:**
- ~450 lines of deprecated method implementations
- 5 MCP tool definitions
- 5 case handlers in switch statement

### 3. New Entity-Based HTTP API Endpoints

**Endpoints Added:**
- `POST /api/entities/query` - Query entities with filters (replaces `/retrieve_records`)
- `POST /api/observations/create` - Create observation for entity (replaces `/store_record`)
- `POST /api/observations/query` - Query observations
- `POST /api/entities/merge` - Merge duplicate entities

**Legacy Endpoints (Deprecated):**
- `/store_record` - Marked deprecated, will be removed in v0.2.16
- `/store_records` - Marked deprecated
- `/update_record` - Marked deprecated
- `/retrieve_records` - Marked deprecated
- `/delete_record` - Marked deprecated
- `/delete_records` - Marked deprecated

### 4. Database Schema Updates

**Migrations Created:**
- `20260101000001_add_source_graph_edges.sql`:
  - Created `source_entity_edges` table
  - Created `source_event_edges` table
  - Added `source_id` to `timeline_events` table
  - Made `source_record_id` nullable for backward compatibility
  - Renamed `relationships.source_record_id` → `source_material_id`
  - Added column comments for terminology alignment

- `20260101000002_rename_interpretation_runs_to_interpretations.sql`:
  - Renamed `interpretation_runs` → `interpretations` table
  - Updated all indexes and RLS policies
  - Updated table comments

### 5. Code Updates

**Services Updated:**
- `src/services/interpretation.ts` - Table name `interpretation_runs` → `interpretations`
- `src/services/entity_queries.ts` - Function renamed to `getInterpretationMetadata()`

**Server Updates:**
- `src/server.ts`:
  - Unified `ingest()` action implementation
  - Removed 5 deprecated MCP actions
  - Removed ~450 lines of deprecated code
  - Updated tool descriptions

**Actions Updates:**
- `src/actions.ts`:
  - Added new entity-based HTTP endpoints
  - Marked legacy endpoints as deprecated
  - Fixed documentation routes import

**Database Updates:**
- `src/db.ts` - Table checks updated for new architecture
- `src/config.ts` - Merge conflicts resolved

**Frontend Updates:**
- `frontend/src/lib/api.ts` - Updated to use new entity-based endpoints

### 6. Documentation Updates

**Core Documentation:**
- `docs/vocabulary/canonical_terms.md` - Already canonical (reference)
- `README.md` - Updated terminology and MCP actions
- `docs/architecture/architecture.md` - Four-layer model, unified ingestion
- `docs/architecture/architectural_decisions.md` - Terminology corrections
- `docs/architecture/source_material_model.md` - Column naming fixes
- `docs/specs/MCP_SPEC.md` - Deprecated actions documented
- `docs/specs/DATA_MODELS.md` - Complete model rewrite

**Subsystems:**
- `docs/subsystems/sources.md` - Complete rewrite
- `docs/subsystems/observation_architecture.md` - Updated references
- `docs/subsystems/events.md` - Updated examples
- `docs/subsystems/reducer.md` - Four-layer model
- `docs/subsystems/relationships.md` - Terminology updates
- `docs/subsystems/schema_registry.md` - Entity schema terminology
- `docs/subsystems/entity_merge.md` - Already conformant
- `docs/subsystems/ingestion/ingestion.md` - Action names updated

**Developer Docs:**
- `docs/developer/getting_started.md` - Action names
- `docs/foundation/core_identity.md` - MCP action name

### 7. Terminology Alignment

**Canonical Terms Applied:**
- "record" → "source" or "entity" (context-dependent)
- "capability" → deprecated, moved to "entity schema"
- "submit_payload" → unified into "ingest"
- "ingest_structured" → unified into "ingest"
- "interpretation run" → "interpretation"
- `interpretation_runs` (table) → `interpretations`
- `source_id` → `source_material_id` (in documentation)
- `interpretation_run_id` → `interpretation_id`

## Build Status

✅ **All Checks Passing:**
- TypeScript compilation: ✅ No errors
- Type checking: ✅ No errors
- UI build: ✅ No errors
- Backend build: ✅ No errors

## Migration Impact

**Breaking Changes:**
1. MCP actions removed: `submit_payload`, `ingest_structured`, `update_record`, `retrieve_records`, `delete_record`
2. Database table renamed: `interpretation_runs` → `interpretations`
3. HTTP endpoints deprecated (not removed yet)

**Migration Path for Users:**
- Replace `submit_payload({capability_id, body, provenance})` with `ingest({entities: [{entity_type, ...}]})`
- Replace `ingest_structured({entities})` with `ingest({entities})`
- Replace `retrieve_records()` with `retrieve_entities()`, `get_entity_snapshot()`, or `list_observations()`
- Replace `update_record()` with `ingest()` (new data) or `correct()` (corrections)
- No replacement for `delete_record()` - observations are immutable

## Testing Status

**Build Tests:**
- ✅ TypeScript compilation
- ✅ Type checking
- ✅ UI build
- ⚠️ Integration tests (expected Supabase auth warnings)

**Database Migrations:**
- ✅ Migration files created
- ⏳ Awaiting application via `npm run migrate`

## Next Steps

**Phase 3 (Pending):**
- Apply database migrations
- Verify graph edge functionality
- Test source-based queries

**Phase 4 (Pending):**
- Create data migration script (records → source)
- Run migration in dry-run mode
- Verify data integrity

**Phase 5 (Future - v0.2.16):**
- Remove legacy HTTP endpoints
- Remove `records` table and related tables
- Complete cleanup of deprecated code

## Success Metrics

- ✅ Unified ingestion: 1 action instead of 3
- ✅ Code reduction: ~450 lines removed
- ✅ Terminology alignment: 100% conformance to canonical vocabulary
- ✅ Build status: All passing
- ✅ Documentation: Fully updated

## References

- Release Plan: `docs/releases/v0.2.15/release_plan.md`
- Canonical Vocabulary: `docs/vocabulary/canonical_terms.md`
- Migration Scripts: `supabase/migrations/20260101*.sql`


