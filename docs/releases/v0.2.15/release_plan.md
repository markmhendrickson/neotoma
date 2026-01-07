# Release Plan: v0.2.15 - Complete Architecture Migration

**Status:** ✅ Implemented (Phases 1-2 Complete, Migrations Ready)  
**Target Date:** TBD  
**Breaking Changes:** Yes - Major architectural migration
**Authoritative Vocabulary:** [`docs/vocabulary/canonical_terms.md`](../../vocabulary/canonical_terms.md)

## Executive Summary

Migrate entirely to [source material](../../vocabulary/canonical_terms.md#source-material)-based architecture, eliminating the legacy records table and record-based APIs. Unify all ingestion into a single `ingest` MCP action that handles both unstructured and structured [source material](../../vocabulary/canonical_terms.md#source-material). Eliminate the capability concept by moving normalization and extraction rules into [entity schemas](../../vocabulary/canonical_terms.md#entity-schema). This is a breaking change that requires data migration and API updates.

## Goals

1. **Unified Architecture:** Single [ingestion](../../vocabulary/canonical_terms.md#ingestion) path using [source material](../../vocabulary/canonical_terms.md#source-material) → [interpretation](../../vocabulary/canonical_terms.md#interpretation) → [observations](../../vocabulary/canonical_terms.md#observation) → [entities](../../vocabulary/canonical_terms.md#entity)
2. **Unified Ingestion API:** Single `ingest` action for both unstructured and structured [source material](../../vocabulary/canonical_terms.md#source-material)
3. **Eliminate Capabilities:** Move normalization and [entity extraction rules](../../vocabulary/canonical_terms.md#entity-extraction-rule) into [entity schemas](../../vocabulary/canonical_terms.md#entity-schema), remove capability concept entirely
4. **Remove Duplication:** Eliminate parallel systems (records vs [source material](../../vocabulary/canonical_terms.md#source-material))
5. **Simplify Codebase:** Drop ~2000 lines of deprecated code
6. **Better [Provenance](../../vocabulary/canonical_terms.md#provenance):** All data traces to [source material](../../vocabulary/canonical_terms.md#source-material) with [interpretations](../../vocabulary/canonical_terms.md#interpretation)
7. **User Isolation:** Proper multi-user support with RLS from day one

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
- `record_entity_edges` - Record → [entity](../../vocabulary/canonical_terms.md#entity) graph links
- `record_event_edges` - Record → timeline [event](../../vocabulary/canonical_terms.md#event) links
- `timeline_events.source_record_id` - References records
- `raw_fragments.record_id` - References records
- `relationships.source_record_id` - References records

### New Architecture (Partially Implemented)

**MCP Actions:**
- `submit_payload` - Creates [source material](../../vocabulary/canonical_terms.md#source-material) → [observations](../../vocabulary/canonical_terms.md#observation) → [entities](../../vocabulary/canonical_terms.md#entity) ✅ (to be deprecated and merged into unified `ingest`)
- `ingest` - Creates [source material](../../vocabulary/canonical_terms.md#source-material) → [interpretation](../../vocabulary/canonical_terms.md#interpretation) → [observations](../../vocabulary/canonical_terms.md#observation) ✅ (to become unified action)
- `ingest_structured` - Direct [observation](../../vocabulary/canonical_terms.md#observation) creation ✅ (to be deprecated and merged into unified `ingest`)
- `reinterpret` - Rerun [interpretation](../../vocabulary/canonical_terms.md#interpretation) on existing [source material](../../vocabulary/canonical_terms.md#source-material) ✅
- [Entity](../../vocabulary/canonical_terms.md#entity)/[observation](../../vocabulary/canonical_terms.md#observation) query actions ✅

**Planned Unification & Simplification:**
- **Unified `ingest` action** - single action for all [source material](../../vocabulary/canonical_terms.md#source-material) (unstructured and structured)
- `ingest` accepts either:
  - Unstructured: `{file_content, mime_type}` → stored → [interpretation](../../vocabulary/canonical_terms.md#interpretation) → structured [source material](../../vocabulary/canonical_terms.md#source-material) → [entity schema](../../vocabulary/canonical_terms.md#entity-schema) processing → [observations](../../vocabulary/canonical_terms.md#observation)
  - Structured: `{entities: [{entity_type, ...}]}` → stored → [entity schema](../../vocabulary/canonical_terms.md#entity-schema) processing → [observations](../../vocabulary/canonical_terms.md#observation)
- **Deprecate `submit_payload` and `ingest_structured`** - merge into unified `ingest`
- **Eliminate capabilities entirely** - move [canonicalization rules](../../vocabulary/canonical_terms.md#canonicalization-rules) and [entity extraction rules](../../vocabulary/canonical_terms.md#entity-extraction-rule) into [entity schemas](../../vocabulary/canonical_terms.md#entity-schema)
- [Entity schemas](../../vocabulary/canonical_terms.md#entity-schema) now include:
  - Field definitions (existing)
  - Merge policies (existing)
  - **[Canonicalization rules](../../vocabulary/canonical_terms.md#canonicalization-rules)** (new - for deduplication)
  - **[Entity extraction rules](../../vocabulary/canonical_terms.md#entity-extraction-rule)** (new - for multi-[entity](../../vocabulary/canonical_terms.md#entity) [extraction](../../vocabulary/canonical_terms.md#extraction))
- No separate "capability" concept - all processing rules come from [entity schema](../../vocabulary/canonical_terms.md#entity-schema)
- Simplifies API from 3 actions to 1, eliminates capability registry
- All [source material](../../vocabulary/canonical_terms.md#source-material) automatically gets normalization, deduplication, and multi-[entity](../../vocabulary/canonical_terms.md#entity) [extraction](../../vocabulary/canonical_terms.md#extraction) via [entity schema](../../vocabulary/canonical_terms.md#entity-schema)

**Database Tables:**
- `sources` - Content-addressed [source material](../../vocabulary/canonical_terms.md#source-material) storage ✅
- `interpretations` - Versioned [interpretation](../../vocabulary/canonical_terms.md#interpretation) tracking ✅
- `observations` - Has `source_id` for [provenance](../../vocabulary/canonical_terms.md#provenance) ✅
- `entities` - With merge tracking ✅
- `entity_snapshots` - Computed [entity snapshots](../../vocabulary/canonical_terms.md#entity-snapshot) ✅

## Migration Strategy

### Phase 1: Build New HTTP API Endpoints

**Priority: P0**

Replace record-based HTTP endpoints with [entity](../../vocabulary/canonical_terms.md#entity)/[observation](../../vocabulary/canonical_terms.md#observation)-based equivalents:

1. **POST /api/entities/query** → Replaces `/retrieve_records`
   - Input: `{ entity_type?, search?, limit?, offset?, user_id }`
   - Output: `{ entities: Entity[], total: number }`
   - Uses: `retrieve_entities` MCP action logic

2. **POST /api/observations/create** → Replaces `/store_record`
   - Input: `{ entity_type, entity_identifier, fields, source_priority?, user_id }`
   - Output: `{ observation_id, entity_id, snapshot }`
   - Uses: unified `ingest` logic

3. **POST /api/observations/query** → New endpoint
   - Input: `{ entity_id?, entity_type?, limit?, offset?, user_id }`
   - Output: `{ observations: Observation[], total: number }`

4. **POST /api/upload_file** → Update to use [source material](../../vocabulary/canonical_terms.md#source-material) architecture
   - Create [source material](../../vocabulary/canonical_terms.md#source-material) with content-addressed storage
   - Optionally run [interpretation](../../vocabulary/canonical_terms.md#interpretation)
   - Return source_id + [entity](../../vocabulary/canonical_terms.md#entity) [entity snapshots](../../vocabulary/canonical_terms.md#entity-snapshot)
   - Uses: unified `ingest` MCP action logic

5. **POST /api/entities/merge** → New endpoint
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
   - Update all record references to [entity](../../vocabulary/canonical_terms.md#entity)/[observation](../../vocabulary/canonical_terms.md#observation) model

3. **Update Chat Integration**
   - Chat context includes [entity](../../vocabulary/canonical_terms.md#entity) [entity snapshots](../../vocabulary/canonical_terms.md#entity-snapshot) instead of records
   - Function calling uses `retrieve_entities` instead of `retrieve_records`
   - Recent items tracked as [entity](../../vocabulary/canonical_terms.md#entity) IDs

4. **Update File Upload Flow**
   - Upload creates [source material](../../vocabulary/canonical_terms.md#source-material)
   - Shows [interpretation](../../vocabulary/canonical_terms.md#interpretation) progress
   - Displays [extracted](../../vocabulary/canonical_terms.md#extraction) [entities](../../vocabulary/canonical_terms.md#entity)/[observations](../../vocabulary/canonical_terms.md#observation)

### Phase 3: Migrate Timeline & Graph to Source-Based

**Priority: P1**

1. **Create `source_entity_edges` table**
   ```sql
   CREATE TABLE source_entity_edges (
     id UUID PRIMARY KEY,
     source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
     entity_id TEXT NOT NULL REFERENCES entities(id),
     edge_type TEXT NOT NULL DEFAULT 'EXTRACTED_FROM',
     interpretation_id UUID REFERENCES interpretations(id),
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
   - Deprecate `source_record_id` for removal in v0.3.0

4. **Update Graph Builder**
   - `insertSourceWithGraph()` - New function
   - Creates [source material](../../vocabulary/canonical_terms.md#source-material) → [entity](../../vocabulary/canonical_terms.md#entity) edges
   - Creates [source material](../../vocabulary/canonical_terms.md#source-material) → [event](../../vocabulary/canonical_terms.md#event) edges
   - Deprecate `insertRecordWithGraph()`

### Phase 4: Data Migration Script

**Priority: P0**

Create migration script to convert existing records → [source material](../../vocabulary/canonical_terms.md#source-material). See `scripts/migrate-records-to-sources-v0.2.15.ts`.

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
   - Remove `submit_payload` (deprecated in this release)
   - Remove `ingest_structured` (merged into unified `ingest`)

3. **Remove Services**
   - Delete `src/services/records.ts`
   - Delete `createRecordFromUploadedFile()` from `file_analysis.ts`
   - Delete `insertRecordWithGraph()` from `graph_builder.ts`
   - Delete capability registry

4. **Remove Database Tables** (via migration - see `migrations/02_drop_legacy_tables.sql`)

5. **Update Documentation**
   - Remove all references to records table
   - Update architecture diagrams
   - Update API documentation
   - Update quickstart guides
   - Ensure conformance to [`docs/vocabulary/canonical_terms.md`](../../vocabulary/canonical_terms.md)

## Implementation Plan

### Milestone 1: New HTTP API & Unified [Ingestion](../../vocabulary/canonical_terms.md#ingestion) (2 weeks)

**Tasks:**
- [ ] Implement `POST /api/entities/query` endpoint
- [ ] Implement `POST /api/observations/create` endpoint
- [ ] Implement `POST /api/observations/query` endpoint
- [ ] Update `POST /api/upload_file` to use [source material](../../vocabulary/canonical_terms.md#source-material)
- [ ] Implement `POST /api/entities/merge` endpoint
- [ ] **Unify into single `ingest` action**
  - [ ] Update `ingest` to accept both unstructured (`file_content`) and structured (`entities` array)
  - [ ] Move [canonicalization rules](../../vocabulary/canonical_terms.md#canonicalization-rules) from capabilities to [entity schemas](../../vocabulary/canonical_terms.md#entity-schema)
  - [ ] Move [entity extraction rules](../../vocabulary/canonical_terms.md#entity-extraction-rule) from capabilities to [entity schemas](../../vocabulary/canonical_terms.md#entity-schema)
  - [ ] Remove capability registry entirely
  - [ ] Update processing to use [entity schema](../../vocabulary/canonical_terms.md#entity-schema) instead of capability
  - [ ] Add deprecation warnings to `submit_payload` and `ingest_structured`
  - [ ] Mark `submit_payload` and `ingest_structured` as deprecated in MCP action list
  - [ ] Update MCP action documentation
  - [ ] Remove `submit_payload` and `ingest_structured` in v0.2.16 (one release deprecation period)
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
- [ ] Migrate all components to use [entities](../../vocabulary/canonical_terms.md#entity)
- [ ] Update chat integration to use [entities](../../vocabulary/canonical_terms.md#entity)
- [ ] Update file upload flow
- [ ] Update search to query [entities](../../vocabulary/canonical_terms.md#entity)
- [ ] Add [entity](../../vocabulary/canonical_terms.md#entity) merge UI
- [ ] End-to-end testing

**Acceptance Criteria:**
- UI fully functional with new endpoints
- No references to old `/retrieve_records` endpoint
- File upload creates [source material](../../vocabulary/canonical_terms.md#source-material)
- Chat queries [entities](../../vocabulary/canonical_terms.md#entity) correctly
- Search works with [entity](../../vocabulary/canonical_terms.md#entity) model

### Milestone 3: Graph & Timeline Migration (1 week)

**Tasks:**
- [ ] Create `source_entity_edges` table migration
- [ ] Create `source_event_edges` table migration
- [ ] Update `timeline_events` table schema
- [ ] Implement `insertSourceWithGraph()`
- [ ] Update graph integrity validation
- [ ] Update timeline [event](../../vocabulary/canonical_terms.md#event) generation

**Acceptance Criteria:**
- Graph edges reference [source material](../../vocabulary/canonical_terms.md#source-material) instead of records
- Timeline [events](../../vocabulary/canonical_terms.md#event) can reference [source material](../../vocabulary/canonical_terms.md#source-material)
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
- All records converted to [source material](../../vocabulary/canonical_terms.md#source-material)
- [Observations](../../vocabulary/canonical_terms.md#observation) created correctly
- Graph edges migrated
- No data loss
- Rollback works if needed

### Milestone 5: Cleanup & Documentation (1 week)

**Tasks:**
- [ ] Remove legacy HTTP endpoints
- [ ] Remove legacy MCP actions (`submit_payload`, `ingest_structured`)
- [ ] Remove legacy services/functions
- [ ] Remove capability registry
- [ ] Drop deprecated database tables
- [ ] Update all documentation to conform to [`docs/vocabulary/canonical_terms.md`](../../vocabulary/canonical_terms.md)
- [ ] Update architecture diagrams
- [ ] Create migration guide for users

**Acceptance Criteria:**
- No legacy code remains
- All tests pass
- Documentation fully updated and vocabulary-conformant
- Migration guide published
- Release notes complete

## Breaking Changes

### API Changes

**Removed Endpoints:**
- `POST /api/store_record` → Use `POST /api/observations/create`
- `POST /api/store_records` → Batch call `POST /api/observations/create`
- `POST /api/update_record` → Create new [observation](../../vocabulary/canonical_terms.md#observation) with higher priority
- `POST /api/retrieve_records` → Use `POST /api/entities/query`
- `POST /api/delete_record` → No direct equivalent ([observations](../../vocabulary/canonical_terms.md#observation) are immutable)
- `POST /api/delete_records` → No direct equivalent

**Removed MCP Actions:**
- `update_record` → Use `correct` action for corrections
- `retrieve_records` → Use `retrieve_entities`
- `delete_record` → No direct equivalent

**Deprecated MCP Actions (removed in v0.2.16):**
- `submit_payload` → Use unified `ingest` with structured [source material](../../vocabulary/canonical_terms.md#source-material)
- `ingest_structured` → Use unified `ingest` with structured [source material](../../vocabulary/canonical_terms.md#source-material)

**Unified MCP Actions:**
- `ingest` → Single action for all [source material](../../vocabulary/canonical_terms.md#source-material) (replaces `ingest`, `submit_payload`, and `ingest_structured`)
- Accepts unstructured: `{file_content, mime_type}` → [interpretation](../../vocabulary/canonical_terms.md#interpretation) → [observations](../../vocabulary/canonical_terms.md#observation)
- Accepts structured: `{entities: [{entity_type, ...}]}` → [entity schema](../../vocabulary/canonical_terms.md#entity-schema) processing → [observations](../../vocabulary/canonical_terms.md#observation)
- Uses [entity schema](../../vocabulary/canonical_terms.md#entity-schema) for normalization, deduplication, and multi-[entity](../../vocabulary/canonical_terms.md#entity) [extraction](../../vocabulary/canonical_terms.md#extraction)
- Capabilities eliminated → [canonicalization rules](../../vocabulary/canonical_terms.md#canonicalization-rules) and [entity extraction rules](../../vocabulary/canonical_terms.md#entity-extraction-rule) now in [entity schemas](../../vocabulary/canonical_terms.md#entity-schema)

**Changed Responses:**
- [Entity](../../vocabulary/canonical_terms.md#entity)-based responses instead of record-based
- New fields: `entity_id`, `entity_type`, `snapshot`, `provenance`
- Removed fields: `record_id`, `properties` (use `snapshot` instead)

### Database Schema Changes

**Removed Tables:**
- `records`
- `record_relationships`
- `record_entity_edges`
- `record_event_edges`
- `payload_submissions` (merged into `sources`)

**Removed Columns:**
- `observations.source_payload_id` (use `source_id`)
- `timeline_events.source_record_id` (use `source_id`)
- `raw_fragments.record_id` (use `source_id`)
- `relationships.source_record_id`

### Migration Path for Users

**For API Users:**
1. Update to use new [entity](../../vocabulary/canonical_terms.md#entity)-based endpoints
2. Change response parsing from records to [entities](../../vocabulary/canonical_terms.md#entity)
3. Use `source_id` for [provenance](../../vocabulary/canonical_terms.md#provenance) instead of `record_id`
4. Run data migration script to convert existing data

**For MCP Users:**
- Replace `retrieve_records` with `retrieve_entities`
- Replace `store_record` with unified `ingest` (with `entities` array for structured [source material](../../vocabulary/canonical_terms.md#source-material))
- Replace `submit_payload` with unified `ingest` (specify `entity_type` in entities array)
- Replace `ingest_structured` with unified `ingest`
- Use `correct` instead of `update_record` for corrections
- No more capability IDs - [entity schemas](../../vocabulary/canonical_terms.md#entity-schema) now include all processing rules
- `submit_payload` and `ingest_structured` will be removed in v0.2.16 (deprecated in v0.2.15)

## Rollback Plan

If issues are discovered post-migration:

1. **Phase 1-2 Rollback:** Frontend can temporarily use old endpoints
2. **Phase 3-4 Rollback:** Restore records table from backup
3. **Phase 5 Rollback:** Re-apply previous migrations to restore tables

**Backup Strategy:**
- Full database backup before migration
- Keep records table for 2 releases (mark as deprecated)
- Ability to recreate records from [source material](../../vocabulary/canonical_terms.md#source-material) if needed

## Testing Strategy

### Unit Tests
- [ ] New HTTP endpoint handlers
- [ ] [Entity](../../vocabulary/canonical_terms.md#entity) query service
- [ ] [Observation](../../vocabulary/canonical_terms.md#observation) creation service
- [ ] Migration script logic

### Integration Tests
- [ ] Full [ingestion](../../vocabulary/canonical_terms.md#ingestion) flow (file → [source material](../../vocabulary/canonical_terms.md#source-material) → [observation](../../vocabulary/canonical_terms.md#observation) → [entity](../../vocabulary/canonical_terms.md#entity))
- [ ] [Entity](../../vocabulary/canonical_terms.md#entity) query with filters
- [ ] [Observation](../../vocabulary/canonical_terms.md#observation) creation and merging
- [ ] Graph integrity with new edges
- [ ] Timeline [events](../../vocabulary/canonical_terms.md#event) with [source material](../../vocabulary/canonical_terms.md#source-material) references

### End-to-End Tests
- [ ] File upload via UI → creates [source material](../../vocabulary/canonical_terms.md#source-material) → shows [entities](../../vocabulary/canonical_terms.md#entity)
- [ ] Chat queries [entities](../../vocabulary/canonical_terms.md#entity) correctly
- [ ] Search returns [entities](../../vocabulary/canonical_terms.md#entity)
- [ ] [Entity](../../vocabulary/canonical_terms.md#entity) merge works in UI

### Migration Tests
- [ ] Dry-run produces correct plan
- [ ] Migration converts records → [source material](../../vocabulary/canonical_terms.md#source-material)
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
- [ ] Create v0.2.15 release notes
- [ ] Update MCP action documentation
- [ ] Ensure all docs conform to [`docs/vocabulary/canonical_terms.md`](../../vocabulary/canonical_terms.md)

## Success Metrics

1. **Code Reduction:** Remove ~2000 lines of legacy code + capability registry + `submit_payload` + `ingest_structured` implementations
2. **API Simplification:** 5 endpoints → 3 endpoints (cleaner model)
3. **[Ingestion](../../vocabulary/canonical_terms.md#ingestion) Unification:** 3 MCP actions (`ingest`, `submit_payload`, `ingest_structured`) → 1 unified `ingest` action
4. **Architecture Simplification:** Eliminate capabilities - [canonicalization rules](../../vocabulary/canonical_terms.md#canonicalization-rules) and [entity extraction rules](../../vocabulary/canonical_terms.md#entity-extraction-rule) now in [entity schemas](../../vocabulary/canonical_terms.md#entity-schema)
5. **Performance:** [Entity](../../vocabulary/canonical_terms.md#entity) queries ≤ record queries (< 100ms p95)
6. **Migration Success:** 100% of records migrated successfully
7. **Zero Data Loss:** All data preserved through migration
8. **Test Coverage:** Maintain ≥ 90% coverage
9. **Vocabulary Conformance:** All docs pass terminology validation against [`docs/vocabulary/canonical_terms.md`](../../vocabulary/canonical_terms.md)

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

- Supabase instance with sufficient storage for [source material](../../vocabulary/canonical_terms.md#source-material)
- User ID system in place for RLS
- Testing environment with production-like data
- Staging environment for migration validation

## Post-Release

1. **Monitor Error Rates:** Watch for issues with new endpoints
2. **Performance Monitoring:** Track query times for [entity](../../vocabulary/canonical_terms.md#entity) operations
3. **User Feedback:** Collect feedback on new API
4. **Documentation Updates:** Keep docs in sync with any hotfixes
5. **Plan v0.3.0:** Operational hardening

## Notes

- This is a breaking change requiring careful coordination
- Consider API versioning (v1 = records, v2 = [entities](../../vocabulary/canonical_terms.md#entity)) if gradual migration needed
- Keep records table read-only for one release cycle as safety net
- Unified `ingest` simplifies agent decision-making: one action for all [source material](../../vocabulary/canonical_terms.md#source-material)
- [Entity schemas](../../vocabulary/canonical_terms.md#entity-schema) now include [canonicalization rules](../../vocabulary/canonical_terms.md#canonicalization-rules) and [entity extraction rules](../../vocabulary/canonical_terms.md#entity-extraction-rule) - no separate capability concept needed
- All [source material](../../vocabulary/canonical_terms.md#source-material) gets normalization, deduplication, and multi-[entity](../../vocabulary/canonical_terms.md#entity) [extraction](../../vocabulary/canonical_terms.md#extraction) automatically via [entity schema](../../vocabulary/canonical_terms.md#entity-schema)
- Consider offering migration-as-a-service for enterprise users

## Release Sequence Context

| Release | Focus | Status |
|---------|-------|--------|
| v0.2.0-v0.2.14 | Incremental features | Complete/In Progress |
| **v0.2.15** | **Complete Architecture Migration** | **This Release** |
| v0.3.0 | Operational Hardening | After v0.2.15 |
| v0.4.0 | Intelligence + Housekeeping | After v0.3.0 |
| v0.5.0 | Agent Cryptographic Signing | After v0.4.0 |

