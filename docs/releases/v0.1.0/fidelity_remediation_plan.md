name: v0.1.0 Fidelity Remediation
overview: Remediate critical architectural gaps between v0.1.0 documented plan and actual implementation, incorporating test coverage gap analysis findings including missing MCP actions, test coverage gaps, error/edge case gaps, and release workflow improvements.
todos:
  - id: phase1-entities-table
    content: Create entities table migration with id, entity_type, canonical_name, aliases, indexes, and RLS policies
    status: completed
  - id: phase1-timeline-events-table
    content: Create timeline_events table migration with id, event_type, event_timestamp, source_record_id, source_field, indexes, and RLS policies
    status: completed
  - id: phase1-graph-edges-tables
    content: Create graph edge tables (record_entity_edges, record_event_edges, entity_event_edges) with indexes and RLS policies
    status: completed
  - id: phase1-update-schema-sql
    content: Update supabase/schema.sql to include all new tables from migrations
    status: completed
  - id: phase2-entity-resolution-persistence
    content: Update entity_resolution.ts resolveEntity() to insert/upsert entities in entities table, add getEntityById() and listEntities() functions
    status: completed
  - id: phase2-event-generation-persistence
    content: Update event_generation.ts to add persistEvents() function, integrate persistence into event generation flow, add query functions
    status: completed
  - id: phase2-graph-builder-complete
    content: Update graph_builder.ts insertRecordWithGraph() to insert entities, events, and create graph edges transactionally
    status: completed
  - id: phase2-observation-ingestion-integration
    content: Update observation_ingestion.ts to ensure entity resolution persists entities before creating observations
    status: completed
  - id: phase3-mcp-get-entity-snapshot
    content: Implement get_entity_snapshot MCP action in server.ts - query entity_snapshots table, return snapshot with provenance
    status: completed
  - id: phase3-mcp-list-observations
    content: Implement list_observations MCP action in server.ts - query observations table filtered by entity_id, return all observations
    status: completed
  - id: phase3-mcp-get-field-provenance
    content: Implement get_field_provenance MCP action in server.ts - trace field to observation → document → file via provenance chain
    status: completed
  - id: phase3-mcp-create-relationship
    content: Implement create_relationship MCP action in server.ts - insert into relationships table, validate cycle detection
    status: completed
  - id: phase3-mcp-list-relationships
    content: Implement list_relationships MCP action in server.ts - query relationships table filtered by entity_id and direction
    status: completed
  - id: phase4-graph-integrity-enhancement
    content: Enhance graph_builder.ts detectOrphanNodes() to check orphan entities, events, and records; update detectCycles() for entity relationships
    status: completed
  - id: phase4-graph-validation-tests
    content: Add graph validation tests for orphan detection across all node types and cycle detection
    status: completed
  - id: phase5-integration-test-entity-resolution
    content: Update it_002_entity_resolution.test.ts to verify entities persisted in database and query directly
    status: completed
  - id: phase5-integration-test-timeline-events
    content: Update it_003_timeline_events.test.ts to verify events persisted in timeline_events table and linked to records
    status: completed
  - id: phase5-integration-test-graph-integrity
    content: Update it_004_graph_integrity.test.ts to verify 0 orphan entities/events, graph edges exist, cycle detection works
    status: completed
  - id: phase5-integration-test-mcp-actions
    content: Update it_006_mcp_actions.test.ts to add tests for upload_file, get_file_url, and all 5 new MCP actions
    status: completed
  - id: phase5-integration-test-observation-architecture
    content: Update it_008_observation_architecture.test.ts to add tests for get_entity_snapshot, list_observations, get_field_provenance MCP actions
    status: completed
  - id: phase5-integration-test-relationship-types
    content: Update it_011_relationship_types.test.ts to add tests for create_relationship and list_relationships MCP actions
    status: completed
  - id: phase5-update-all-integration-tests
    content: Update all integration tests to validate database state, not just in-memory results
    status: completed
  - id: phase6-error-case-tests
    content: Create it_error_cases.test.ts with comprehensive error case tests for all 11 MCP actions (invalid inputs, not found, failures)
    status: completed
  - id: phase6-integrate-error-cases
    content: Integrate error case tests into existing integration tests (IT-006, IT-008, IT-011) where appropriate
    status: completed
  - id: phase7-edge-case-tests
    content: Create it_edge_cases.test.ts with comprehensive edge case tests (empty inputs, boundary conditions, Unicode, concurrent operations)
    status: completed
  - id: phase7-integrate-edge-cases
    content: Integrate edge case tests into relevant integration tests
    status: completed
  - id: phase8-validation-schema-tests
    content: Create it_validation_schemas.test.ts with tests for all Zod schemas, type normalization, property validation, authorization
    status: completed
  - id: phase9-test-coverage-config
    content: Add test:coverage script to package.json, configure vitest coverage settings, set coverage thresholds
    status: completed
  - id: phase9-generate-coverage-report
    content: Run coverage for critical path services, document coverage gaps, verify 100% critical path coverage
    status: completed
  - id: phase9-create-gap-analysis-doc
    content: Create test_coverage_gap_analysis.md document tracking all gaps, coverage metrics, and resolution status
    status: completed
  - id: phase10-update-release-workflow
    content: Update release_workflow.md with test coverage requirements in Step 0, Step 1, Step 4, constraints, forbidden patterns, manifest template, acceptance criteria
    status: completed
  - id: phase11-update-release-report
    content: Update release_report.md to document remediation work completed, actual test results, and test coverage metrics
    status: completed
  - id: phase11-update-status-md
    content: Fix test status inconsistencies in status.md, document any deferred features, update test coverage status
    status: completed
  - id: phase11-update-architecture-docs
    content: Update architecture docs if graph model changed during remediation
    status: completed
# v0.1.0 Release Fidelity Remediation Plan
## Executive Summary
This plan addresses critical gaps between the documented v0.1.0 release plan and actual implementation. Primary issues: missing core database tables (entities, timeline_events), incomplete graph builder, missing MCP action implementations (5 actions), comprehensive test coverage gaps, and testing inconsistencies.
## Critical Gaps Identified
### 1. Missing Core Database Tables
- **Entities table**: Required for FU-101 (Entity Resolution Service)
- **Timeline events table**: Required for FU-102 (Event Generation Service)
- **Graph edges**: Missing infrastructure for record → entity → event relationships
### 2. Incomplete Graph Builder (FU-103)
- Only handles `record_relationships`, not entities/events
- Cannot validate graph integrity for entities/events
- Orphan detection incomplete
### 3. Services Not Persisting Data
- Entity resolution generates IDs but doesn't store entities
- Event generation creates events but doesn't persist them
- Graph builder cannot insert entities/events (tables missing)
### 4. Missing MCP Action Implementations (Priority 1 - Blocking)
- `get_entity_snapshot` (FU-061) - Core observation architecture
- `list_observations` (FU-061) - Core observation architecture
- `get_field_provenance` (FU-061) - Core provenance tracking
- `create_relationship` (FU-061) - Core relationship functionality
- `list_relationships` (FU-061) - Core relationship functionality
### 5. Test Coverage Gaps
- Missing tests for 4 implemented MCP actions (`upload_file`, `get_file_url` comprehensive coverage)
- Missing error case tests for all MCP actions (0% coverage)
- Missing edge case tests for all MCP actions (0% coverage)
- Missing validation schema tests
- Missing tests for 5 unimplemented MCP actions
### 6. Testing Inconsistencies
- Status reports show conflicting test results
- No test coverage reporting configured
- Integration tests may not be validating actual persistence
## Remediation Strategy
### Phase 1: Database Schema Completion
**Priority: P0 (Blocking)**
Add missing tables and indexes to complete the four-layer truth model:
1. **Create `entities` table** (`supabase/migrations/YYYYMMDDHHMMSS_add_entities_table.sql`)
- Columns: `id` (TEXT PRIMARY KEY), `entity_type` (TEXT), `canonical_name` (TEXT), `aliases` (JSONB), `created_at` (TIMESTAMPTZ), `updated_at` (TIMESTAMPTZ)
- Indexes: `idx_entities_type`, `idx_entities_canonical_name`
- RLS policies: Service role full access, public read
2. **Create `timeline_events` table** (`supabase/migrations/YYYYMMDDHHMMSS_add_timeline_events_table.sql`)
- Columns: `id` (TEXT PRIMARY KEY), `event_type` (TEXT), `event_timestamp` (TIMESTAMPTZ), `source_record_id` (UUID), `source_field` (TEXT), `created_at` (TIMESTAMPTZ)
- Indexes: `idx_timeline_events_record`, `idx_timeline_events_timestamp`, `idx_timeline_events_type`
- RLS policies: Service role full access, public read
3. **Create graph edge tables** (`supabase/migrations/YYYYMMDDHHMMSS_add_graph_edges.sql`)
- `record_entity_edges`: `record_id` (UUID), `entity_id` (TEXT), `edge_type` (TEXT), `created_at` (TIMESTAMPTZ)
- `record_event_edges`: `record_id` (UUID), `event_id` (TEXT), `edge_type` (TEXT), `created_at` (TIMESTAMPTZ)
- `entity_event_edges`: `entity_id` (TEXT), `event_id` (TEXT), `edge_type` (TEXT), `created_at` (TIMESTAMPTZ)
- Indexes for all foreign keys
- RLS policies
4. **Update `supabase/schema.sql`** to include all new tables
### Phase 2: Service Implementation Completion
**Priority: P0 (Blocking)**
Complete entity resolution and event generation to persist data:
1. **Update `src/services/entity_resolution.ts`**
- Modify `resolveEntity()` to insert/upsert entities in `entities` table
- Add `getEntityById()` function
- Add `listEntities()` function with filters
- Ensure deterministic ID generation (already implemented)
2. **Update `src/services/event_generation.ts`**
- Add `persistEvents()` function to insert events into `timeline_events` table
- Add `getEventsByRecordId()` function
- Add `getEventsByEntityId()` function
- Integrate persistence into event generation flow
3. **Update `src/services/graph_builder.ts`**
- Extend `insertRecordWithGraph()` to insert entities and events
- Create graph edges: record → entity, record → event, entity → event
- Update `detectOrphanNodes()` to check entities and events tables
- Ensure all inserts are transactional (use Supabase RPC or explicit transaction)
4. **Update `src/services/observation_ingestion.ts`**
- Ensure entity resolution persists entities before creating observations
- Link observations to persisted entities
### Phase 3: Missing MCP Action Implementations
**Priority: P0 (Blocking Release)**
Implement 5 missing MCP actions required by FU-061:
1. **Implement `get_entity_snapshot` MCP action** (`src/server.ts`)
- Input: `entity_id` (TEXT)
- Output: Entity snapshot with provenance, observation_count
- Query `entity_snapshots` table
- Return snapshot, provenance, observation_count
2. **Implement `list_observations` MCP action** (`src/server.ts`)
- Input: `entity_id` (TEXT), optional filters
- Output: Array of observations for entity
- Query `observations` table filtered by entity_id
- Return all observations with fields, source_record_id, observed_at
3. **Implement `get_field_provenance` MCP action** (`src/server.ts`)
- Input: `entity_id` (TEXT), `field_name` (TEXT)
- Output: Provenance chain (field → observation → document → file)
- Query snapshot provenance JSONB
- Trace field to observation_id, then to source_record_id, then to file
4. **Implement `create_relationship` MCP action** (`src/server.ts`)
- Input: `relationship_type` (TEXT), `source_entity_id` (TEXT), `target_entity_id` (TEXT), optional `metadata` (JSONB)
- Output: Created relationship with id
- Insert into `relationships` table
- Validate cycle detection before insert
- Return relationship object
5. **Implement `list_relationships` MCP action** (`src/server.ts`)
- Input: `entity_id` (TEXT), optional `direction` ('inbound' | 'outbound' | 'both')
- Output: Array of relationships for entity
- Query `relationships` table filtered by source_entity_id or target_entity_id
- Return relationships with metadata
### Phase 4: Graph Integrity Validation
**Priority: P0 (Critical Path)**
Complete graph integrity checks:
1. **Enhance `src/services/graph_builder.ts`**
- Update `detectOrphanNodes()` to check:
- Orphan entities (entities with no record_entity_edges)
- Orphan events (events with no record_event_edges)
- Orphan records (records with no edges)
- Update `detectCycles()` to handle entity → entity relationships via `relationships` table
- Add validation for entity → event → entity cycles
2. **Add graph validation tests**
- Test orphan detection for all node types
- Test cycle detection across entity relationships
- Test transactional rollback on integrity violations
### Phase 5: Integration Test Updates
**Priority: P0 (Validation)**
Fix integration tests to validate actual persistence and add missing test coverage:
1. **Update `tests/integration/release/v0.1.0/it_002_entity_resolution.test.ts`**
- Verify entities are persisted in `entities` table
- Verify same entity_id across multiple records
- Query database directly to validate persistence
2. **Update `tests/integration/release/v0.1.0/it_003_timeline_events.test.ts`**
- Verify events are persisted in `timeline_events` table
- Verify event IDs are deterministic
- Verify events linked to source records
3. **Update `tests/integration/release/v0.1.0/it_004_graph_integrity.test.ts`**
- Verify 0 orphan entities
- Verify 0 orphan events
- Verify graph edges exist for all relationships
- Verify cycle detection works
4. **Update `tests/integration/release/v0.1.0/it_006_mcp_actions.test.ts`**
- Add tests for `upload_file` comprehensive coverage
- Add tests for `get_file_url` (currently missing)
- Add tests for 5 new MCP actions (`get_entity_snapshot`, `list_observations`, `get_field_provenance`, `create_relationship`, `list_relationships`)
- Verify all 11 MCP actions tested
5. **Update `tests/integration/release/v0.1.0/it_008_observation_architecture.test.ts`**
- Add tests for `get_entity_snapshot` MCP action
- Add tests for `list_observations` MCP action
- Add tests for `get_field_provenance` MCP action
- Test observation creation during ingestion
- Test snapshot computation with provenance
6. **Update `tests/integration/release/v0.1.0/it_011_relationship_types.test.ts`**
- Add tests for `create_relationship` MCP action
- Add tests for `list_relationships` MCP action
- Test relationship metadata preservation
- Test graph traversal queries
7. **Update all integration tests** to validate database state, not just in-memory results
### Phase 6: Error Case Test Coverage
**Priority: P0 (Quality - Blocking Release)**
Add comprehensive error case tests for all MCP actions:
1. **Create `tests/integration/release/v0.1.0/it_error_cases.test.ts`**
- Test `store_record` error cases: invalid type, missing required fields, invalid property schema, database insert failure, event emission failure
- Test `update_record` error cases: record not found (404), invalid update data, database update failure, event emission failure
- Test `retrieve_records` error cases: invalid query parameters, search execution failure, invalid limit, invalid similarity_threshold
- Test `delete_record` error cases: record not found (404), database delete failure, event emission failure
- Test `upload_file` error cases: file not found (404), file too large (400), unsupported file type (400), upload failure (500), analysis failure
- Test `get_file_url` error cases: file path not found, invalid expiry time, storage service failure
- Test observation MCP actions error cases: entity not found, invalid entity_id format, invalid field_name
- Test relationship MCP actions error cases: invalid relationship_type, cycle detection, entity not found
2. **Add error case tests to existing integration tests**
- Integrate error cases into IT-006, IT-008, IT-011 where appropriate
### Phase 7: Edge Case Test Coverage
**Priority: P1 (Quality)**
Add comprehensive edge case tests:
1. **Create `tests/integration/release/v0.1.0/it_edge_cases.test.ts`**
- Record operations: empty properties, very large properties, special characters, Unicode, concurrent updates, update with no changes, delete already-deleted record
- Query operations: empty results, no filters, conflicting filters, very large limit, limit=0, invalid UUIDs, empty search terms, semantic search without OpenAI key
- File operations: empty file, very large file, special characters in name, no extension, multiple extensions, non-existent file URL, very long expiry
- Event sourcing: replay with no events, corrupted events, out-of-order events, missing reducer version, multiple events with same timestamp
2. **Add edge case tests to existing integration tests**
- Integrate edge cases into relevant integration tests
### Phase 8: Validation Schema Test Coverage
**Priority: P1 (Quality)**
Add validation schema tests:
1. **Create `tests/integration/release/v0.1.0/it_validation_schemas.test.ts`**
- Test all Zod schemas with invalid inputs
- Test type normalization (case-insensitive, plural handling)
- Test property validation rules
- Test array length limits (file_urls, ids, search terms)
- Test numeric ranges (limit, similarity_threshold)
- Test authorization: missing bearer token, invalid bearer token, expired bearer token, malformed authorization header
### Phase 9: Test Coverage & Reporting
**Priority: P1 (Quality)**
Configure test coverage reporting:
1. **Add coverage script to `package.json`**
- Add `"test:coverage": "vitest run --coverage"`
- Configure vitest coverage settings in `vitest.config.ts`
- Set coverage thresholds for critical paths
2. **Generate coverage report**
- Run coverage for critical path services
- Document coverage gaps
- Add coverage badges/requirements to release criteria
3. **Create test coverage gap analysis document**
- Create `docs/releases/in_progress/v0.1.0/test_coverage_gap_analysis.md`
- Document all gaps identified
- Track coverage metrics
- Update as gaps are resolved
### Phase 10: Release Workflow Documentation Updates
**Priority: P1 (Process Improvement)**
Update release workflow to require test coverage analysis for future releases:
1. **Update `docs/feature_units/standards/release_workflow.md`**
- Add test coverage requirements to Step 0 (Release Planning)
- Add test coverage review to Step 1 (Execute FU Batches)
- Add test coverage validation to Step 4 (Checkpoint 2)
- Add test coverage constraints and forbidden patterns
- Add test coverage template to Release Manifest Format
- Add test coverage checklist to Acceptance Criteria
- Update example release execution sections
### Phase 11: Documentation Updates
**Priority: P1 (Clarity)**
Update documentation to reflect actual implementation:
1. **Update `docs/releases/in_progress/v0.1.0/release_report.md`**
- Document remediation work completed
- Update test status to reflect actual results
- Include test coverage metrics
2. **Update `docs/releases/in_progress/v0.1.0/status.md`**
- Fix test status inconsistencies
- Document any deferred features
- Update test coverage status
3. **Update architecture docs** if graph model changed
## Implementation Order
1. **Phase 1** (Database Schema) - Foundation, must complete first
2. **Phase 2** (Service Implementation) - Depends on Phase 1
3. **Phase 3** (Missing MCP Actions) - Blocking release, depends on Phase 2
4. **Phase 4** (Graph Integrity) - Depends on Phase 2
5. **Phase 5** (Integration Test Updates) - Validates Phases 1-4
6. **Phase 6** (Error Case Tests) - Blocking release, depends on Phase 3
7. **Phase 7** (Edge Case Tests) - Can run in parallel with Phase 6
8. **Phase 8** (Validation Schema Tests) - Can run in parallel with Phase 6
9. **Phase 9** (Test Coverage Reporting) - Can run in parallel with Phase 5
10. **Phase 10** (Release Workflow Updates) - Process improvement, can run anytime
11. **Phase 11** (Documentation Updates) - Final step
## Success Criteria
- [ ] `entities` table exists and entities are persisted
- [ ] `timeline_events` table exists and events are persisted
- [ ] Graph edges tables exist and relationships are stored
- [ ] Entity resolution persists entities to database
- [ ] Event generation persists events to database
- [ ] Graph builder inserts entities, events, and edges transactionally
- [ ] Graph integrity validation checks all node types
- [ ] All 5 missing MCP actions implemented (`get_entity_snapshot`, `list_observations`, `get_field_provenance`, `create_relationship`, `list_relationships`)
- [ ] All 11 integration tests pass and validate database state
- [ ] Error case tests exist for all MCP actions (100% coverage)
- [ ] Edge case tests exist for critical paths
- [ ] Validation schema tests exist
- [ ] Test coverage reporting configured and critical paths at 100%
- [ ] Test coverage gap analysis document created and maintained
- [ ] Release workflow updated with test coverage requirements
- [ ] Documentation updated to reflect actual implementation
## Risk Mitigation
- **Database migration risk**: Test migrations on dev database first
- **Breaking changes**: Ensure backward compatibility with existing data
- **Performance impact**: Add indexes for all foreign keys and query patterns
- **Test failures**: Fix tests incrementally, don't change all at once
- **MCP action implementation**: Implement one at a time, test immediately
## Files to Modify
### Database
- `supabase/migrations/` (3 new migration files)
- `supabase/schema.sql`
### Services
- `src/services/entity_resolution.ts`
- `src/services/event_generation.ts`
- `src/services/graph_builder.ts`
- `src/services/observation_ingestion.ts`
### MCP Actions
- `src/server.ts` (add 5 missing MCP action handlers)
### Tests
- `tests/integration/release/v0.1.0/it_002_entity_resolution.test.ts`
- `tests/integration/release/v0.1.0/it_003_timeline_events.test.ts`
- `tests/integration/release/v0.1.0/it_004_graph_integrity.test.ts`
- `tests/integration/release/v0.1.0/it_006_mcp_actions.test.ts`
- `tests/integration/release/v0.1.0/it_008_observation_architecture.test.ts`
- `tests/integration/release/v0.1.0/it_011_relationship_types.test.ts`
- `tests/integration/release/v0.1.0/it_error_cases.test.ts` (new)
- `tests/integration/release/v0.1.0/it_edge_cases.test.ts` (new)
- `tests/integration/release/v0.1.0/it_validation_schemas.test.ts` (new)
- `vitest.config.ts`
- `package.json`
### Documentation
- `docs/releases/in_progress/v0.1.0/release_report.md`
- `docs/releases/in_progress/v0.1.0/status.md`
- `docs/releases/in_progress/v0.1.0/test_coverage_gap_analysis.md` (new)
- `docs/feature_units/standards/release_workflow.md`