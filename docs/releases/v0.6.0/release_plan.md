# Release Plan: v0.6.0 - Complete Architecture Migration

**Status:** Draft  
**Target Date:** TBD  
**Breaking Changes:** Yes - Major architectural migration

## Executive Summary

Migrate entirely to sources-first/payload-based architecture, eliminating the legacy records table and record-based APIs. This is a breaking change that requires data migration and API updates.

## Goals

1. **Unified Architecture:** Single ingestion path using sources → interpretation → observations → entities
2. **Remove Duplication:** Eliminate parallel systems (records vs sources/payloads)
3. **Simplify Codebase:** Drop ~2000 lines of deprecated code
4. **Better Provenance:** All data traces to sources with interpretation runs
5. **User Isolation:** Proper multi-user support with RLS from day one

## Current State Analysis

### Active Record Usage

**HTTP API Endpoints:**
- `POST /store_record` - Creates records
- `POST /store_records` - Bulk creates records
- `POST /update_record` - Updates records
- `POST /retrieve_records` - Queries records (used by UI and chat)
- `POST /delete_record` - Deletes records
- `POST /upload_file` - Uses `createRecordFromUploadedFile()` → inserts records

**MCP Actions:**
- `upload_file` - Uses `createRecordFromUploadedFile()` → inserts records
- `update_record` (deprecated but exposed)
- `retrieve_records` (deprecated but exposed)
- `delete_record` (deprecated but exposed)

**Database Tables:**
- `records` - Main table (actively written to)
- `record_relationships` - Record-to-record links
- `record_entity_edges` - Record → entity graph links
- `record_event_edges` - Record → timeline event links
- `timeline_events.source_record_id` - References records
- `raw_fragments.record_id` - References records
- `relationships.source_record_id` - References records

### New Architecture (Partially Implemented)

**MCP Actions:**
- `submit_payload` - Creates payloads → observations → entities ✅
- `ingest` - Creates sources → interpretation → observations ✅
- `ingest_structured` - Direct observation creation ✅
- `reinterpret` - Rerun interpretation on existing source ✅
- Entity/observation query actions ✅

**Database Tables:**
- `sources` - Content-addressed raw storage ✅
- `interpretation_runs` - Versioned interpretation tracking ✅
- `payload_submissions` - Unified ingestion primitive ✅
- `observations` - Has both `source_payload_id` (legacy) and `source_id` (new) ✅
- `entities` - With merge tracking ✅
- `entity_snapshots` - Computed truth ✅

## Migration Strategy

### Phase 1: Build New HTTP API Endpoints

**Priority: P0**

Replace record-based HTTP endpoints with entity/observation-based equivalents:

1. **POST /api/entities/query** → Replaces `/retrieve_records`
   - Input: `{ entity_type?, search?, limit?, offset?, user_id }`
   - Output: `{ entities: Entity[], total: number }`
   - Uses: `retrieve_entities` MCP action logic

2. **POST /api/observations/create** → Replaces `/store_record`
   - Input: `{ entity_type, entity_identifier, fields, source_priority?, user_id }`
   - Output: `{ observation_id, entity_id, snapshot }`
   - Uses: `ingest_structured` logic

3. **POST /api/observations/query** → New capability
   - Input: `{ entity_id?, entity_type?, limit?, offset?, user_id }`
   - Output: `{ observations: Observation[], total: number }`

4. **POST /api/upload_file** → Update to use sources architecture
   - Create source with content-addressed storage
   - Optionally run interpretation
   - Return source_id + entity snapshots
   - Uses: `ingest` MCP action logic

5. **POST /api/entities/merge** → New capability
   - Input: `{ from_entity_id, to_entity_id, merge_reason?, user_id }`
   - Output: `{ observations_moved, merged_at }`
   - Uses: `merge_entities` MCP action logic

### Phase 2: Update Frontend to Use New Endpoints

**Priority: P0**

1. **Update `frontend/src/store/records.ts`**
   - Rename to `entities.ts`
   - Replace `retrieve_records` calls with `entities/query`
   - Update TypeScript types from `Record` to `Entity`

2. **Update UI Components**
   - `RecordList` → `EntityList`
   - `RecordDetail` → `EntityDetail`
   - Update all record references to entity/observation model

3. **Update Chat Integration**
   - Chat context includes entity snapshots instead of records
   - Function calling uses `retrieve_entities` instead of `retrieve_records`
   - Recent items tracked as entity IDs

4. **Update File Upload Flow**
   - Upload creates source
   - Shows interpretation progress
   - Displays extracted entities/observations

### Phase 3: Migrate Timeline & Graph to Source-Based

**Priority: P1**

1. **Create `source_entity_edges` table**
   ```sql
   CREATE TABLE source_entity_edges (
     id UUID PRIMARY KEY,
     source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
     entity_id TEXT NOT NULL REFERENCES entities(id),
     edge_type TEXT NOT NULL DEFAULT 'EXTRACTED_FROM',
     interpretation_run_id UUID REFERENCES interpretation_runs(id),
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

2. **Create `source_event_edges` table**
   ```sql
   CREATE TABLE source_event_edges (
     id UUID PRIMARY KEY,
     source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
     event_id TEXT NOT NULL,
     edge_type TEXT NOT NULL DEFAULT 'GENERATED_FROM',
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

3. **Update `timeline_events` table**
   - Add `source_id UUID REFERENCES sources(id)` column
   - Make `source_record_id` nullable
   - Deprecate `source_record_id` for removal in v0.7.0

4. **Update Graph Builder**
   - `insertSourceWithGraph()` - New function
   - Creates source → entity edges
   - Creates source → event edges
   - Deprecate `insertRecordWithGraph()`

### Phase 4: Data Migration Script

**Priority: P0**

Create migration script to convert existing records → sources. See `scripts/migrate-records-to-sources-v0.6.0.ts`.

**Migration Safety:**
- Run in dry-run mode first
- Batch processing (100 records at a time)
- Rollback capability
- Preserve original records until verification
- Log all migrations for audit

### Phase 5: Remove Legacy Code & Tables

**Priority: P2 (After Phase 1-4 Complete)**

1. **Remove HTTP Endpoints**
   - Delete `/store_record`
   - Delete `/store_records`
   - Delete `/update_record`
   - Delete `/retrieve_records`
   - Delete `/delete_record`
   - Delete `/delete_records`

2. **Remove MCP Actions**
   - Remove `update_record` (already deprecated)
   - Remove `retrieve_records` (already deprecated)
   - Remove `delete_record` (already deprecated)

3. **Remove Services**
   - Delete `src/services/records.ts`
   - Delete `createRecordFromUploadedFile()` from `file_analysis.ts`
   - Delete `insertRecordWithGraph()` from `graph_builder.ts`

4. **Remove Database Tables** (via migration - see `migrations/02_drop_legacy_tables.sql`)

5. **Update Documentation**
   - Remove all references to records table
   - Update architecture diagrams
   - Update API documentation
   - Update quickstart guides

## Implementation Plan

### Milestone 1: New HTTP API (2 weeks)

**Tasks:**
- [ ] Implement `POST /api/entities/query` endpoint
- [ ] Implement `POST /api/observations/create` endpoint
- [ ] Implement `POST /api/observations/query` endpoint
- [ ] Update `POST /api/upload_file` to use sources
- [ ] Implement `POST /api/entities/merge` endpoint
- [ ] Add integration tests for all new endpoints
- [ ] Update OpenAPI/Swagger documentation

**Acceptance Criteria:**
- All new endpoints return proper responses
- Error handling matches existing patterns
- Performance comparable to legacy endpoints
- 100% test coverage for new endpoints

### Milestone 2: Frontend Migration (2 weeks)

**Tasks:**
- [ ] Create `frontend/src/store/entities.ts`
- [ ] Migrate all components to use entities
- [ ] Update chat integration to use entities
- [ ] Update file upload flow
- [ ] Update search to query entities
- [ ] Add entity merge UI
- [ ] End-to-end testing

**Acceptance Criteria:**
- UI fully functional with new endpoints
- No references to old `/retrieve_records` endpoint
- File upload creates sources
- Chat queries entities correctly
- Search works with entity model

### Milestone 3: Graph & Timeline Migration (1 week)

**Tasks:**
- [ ] Create `source_entity_edges` table migration
- [ ] Create `source_event_edges` table migration
- [ ] Update `timeline_events` table schema
- [ ] Implement `insertSourceWithGraph()`
- [ ] Update graph integrity validation
- [ ] Update timeline event generation

**Acceptance Criteria:**
- Graph edges reference sources instead of records
- Timeline events can reference sources
- Graph integrity checks pass
- No broken foreign keys

### Milestone 4: Data Migration (1 week)

**Tasks:**
- [ ] Implement migration script
- [ ] Add dry-run mode
- [ ] Add rollback capability
- [ ] Test on sample data
- [ ] Run migration in staging
- [ ] Verify data integrity
- [ ] Document migration process

**Acceptance Criteria:**
- Migration script runs successfully
- All records converted to sources
- Observations created correctly
- Graph edges migrated
- No data loss
- Rollback works if needed

### Milestone 5: Cleanup & Documentation (1 week)

**Tasks:**
- [ ] Remove legacy HTTP endpoints
- [ ] Remove legacy MCP actions
- [ ] Remove legacy services/functions
- [ ] Drop deprecated database tables
- [ ] Update all documentation
- [ ] Update architecture diagrams
- [ ] Create migration guide for users

**Acceptance Criteria:**
- No legacy code remains
- All tests pass
- Documentation fully updated
- Migration guide published
- Release notes complete

## Breaking Changes

### API Changes

**Removed Endpoints:**
- `POST /api/store_record` → Use `POST /api/observations/create`
- `POST /api/store_records` → Batch call `POST /api/observations/create`
- `POST /api/update_record` → Create new observation with higher priority
- `POST /api/retrieve_records` → Use `POST /api/entities/query`
- `POST /api/delete_record` → No direct equivalent (observations are immutable)
- `POST /api/delete_records` → No direct equivalent

**Removed MCP Actions:**
- `update_record` → Use `correct` action for corrections
- `retrieve_records` → Use `retrieve_entities`
- `delete_record` → No direct equivalent

**Changed Responses:**
- Entity-based responses instead of record-based
- New fields: `entity_id`, `entity_type`, `snapshot`, `provenance`
- Removed fields: `record_id`, `properties` (use `snapshot` instead)

### Database Schema Changes

**Removed Tables:**
- `records`
- `record_relationships`
- `record_entity_edges`
- `record_event_edges`

**Removed Columns:**
- `observations.source_payload_id` (use `source_id`)
- `timeline_events.source_record_id` (use `source_id`)
- `raw_fragments.record_id` (use `source_id`)
- `relationships.source_record_id`

### Migration Path for Users

**For API Users:**
1. Update to use new entity-based endpoints
2. Change response parsing from records to entities
3. Use `source_id` for provenance instead of `record_id`
4. Run data migration script to convert existing data

**For MCP Users:**
- Replace `retrieve_records` with `retrieve_entities`
- Replace `store_record` with `submit_payload` or `ingest_structured`
- Use `correct` instead of `update_record` for corrections

## Rollback Plan

If issues are discovered post-migration:

1. **Phase 1-2 Rollback:** Frontend can temporarily use old endpoints
2. **Phase 3-4 Rollback:** Restore records table from backup
3. **Phase 5 Rollback:** Re-apply previous migrations to restore tables

**Backup Strategy:**
- Full database backup before migration
- Keep records table for 2 releases (mark as deprecated)
- Ability to recreate records from sources if needed

## Testing Strategy

### Unit Tests
- [ ] New HTTP endpoint handlers
- [ ] Entity query service
- [ ] Observation creation service
- [ ] Migration script logic

### Integration Tests
- [ ] Full ingestion flow (file → source → observation → entity)
- [ ] Entity query with filters
- [ ] Observation creation and merging
- [ ] Graph integrity with new edges
- [ ] Timeline events with source references

### End-to-End Tests
- [ ] File upload via UI → creates source → shows entities
- [ ] Chat queries entities correctly
- [ ] Search returns entities
- [ ] Entity merge works in UI

### Migration Tests
- [ ] Dry-run produces correct plan
- [ ] Migration converts records → sources
- [ ] Graph edges migrate correctly
- [ ] Rollback restores state
- [ ] No data loss

## Documentation Updates

- [ ] Update README.md with new architecture
- [ ] Update API documentation
- [ ] Create migration guide
- [ ] Update architecture diagrams
- [ ] Update developer guide
- [ ] Update user guide
- [ ] Create v0.6.0 release notes
- [ ] Update MCP action documentation

## Success Metrics

1. **Code Reduction:** Remove ~2000 lines of legacy code
2. **API Simplification:** 5 endpoints → 3 endpoints (cleaner model)
3. **Performance:** Entity queries ≤ record queries (< 100ms p95)
4. **Migration Success:** 100% of records migrated successfully
5. **Zero Data Loss:** All data preserved through migration
6. **Test Coverage:** Maintain ≥ 90% coverage

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Migration fails for some records | High | Medium | Batch processing, rollback capability, extensive testing |
| Frontend breaks after backend changes | High | Low | Phased rollout, feature flags, API versioning |
| Performance degradation | Medium | Low | Load testing, query optimization, indexes |
| Data loss during migration | Critical | Very Low | Full backups, dry-run mode, verification steps |
| User disruption during migration | Medium | Medium | Clear communication, migration window, rollback plan |

## Timeline

- **Week 1-2:** Milestone 1 (New HTTP API)
- **Week 3-4:** Milestone 2 (Frontend Migration)
- **Week 5:** Milestone 3 (Graph & Timeline)
- **Week 6:** Milestone 4 (Data Migration)
- **Week 7:** Milestone 5 (Cleanup)
- **Week 8:** Testing, documentation, release prep

**Total Duration:** 8 weeks

## Dependencies

- Supabase instance with sufficient storage for sources
- User ID system in place for RLS
- Testing environment with production-like data
- Staging environment for migration validation

## Post-Release

1. **Monitor Error Rates:** Watch for issues with new endpoints
2. **Performance Monitoring:** Track query times for entity operations
3. **User Feedback:** Collect feedback on new API
4. **Documentation Updates:** Keep docs in sync with any hotfixes
5. **Plan v0.7.0:** Next iteration of architecture improvements

## Notes

- This is a breaking change requiring careful coordination
- Consider API versioning (v1 = records, v2 = entities) if gradual migration needed
- Keep records table read-only for one release cycle as safety net
- Consider offering migration-as-a-service for enterprise users

## Release Sequence Context

| Release | Focus | Status |
|---------|-------|--------|
| v0.3.0 | Operational Hardening | Planned |
| v0.4.0 | Intelligence + Housekeeping | Planned |
| v0.5.0 | Agent Cryptographic Signing | Planned |
| **v0.6.0** | **Complete Architecture Migration** | **This Release** |
| v0.7.0 | Post-migration optimizations | Future |

