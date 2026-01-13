# Release v0.2.0 — Build Report
**Report Generated:** 2025-01-02
**Release ID:** v0.2.0
**Release Name:** Minimal Ingestion + Correction Loop
**Status:** `in_testing`

## 1. Executive Summary

Release v0.2.0 implements the minimal sources-first ingestion architecture with content-addressed storage, versioned interpretation, corrections, and entity merging. All 13 feature units completed successfully. Automated integration tests are passing (11/11). Release is currently in `in_testing` status, awaiting manual test execution before deployment.

**Completion Metrics:**
- Feature Units: 13/13 (100%)
- Integration Tests: 11/11 passing (100%)
- Status: `in_testing` (manual testing pending)

## 2. Batch Completion Summary

All feature units were completed in a single development session.

## 3. Feature Unit Completion Summary

### Phase 1: Schema + Storage Foundation (6/6 Complete)
- ✅ FU-110: Sources Table Migration
- ✅ FU-111: Interpretation Runs Table
- ✅ FU-113: Entity Extensions
- ✅ FU-114: Observation Extensions
- ✅ FU-115: Raw Fragments Extensions
- ✅ FU-116: Entity Merges Table

### Phase 2: MCP Tools + Services (7/7 Complete)
- ✅ FU-120: Raw Storage Service
- ✅ FU-121: Interpretation Service
- ✅ FU-122: MCP ingest() Tool
- ✅ FU-123: MCP ingest_structured() Tool
- ✅ FU-124: MCP reinterpret() Tool
- ✅ FU-125: MCP correct() Tool
- ✅ FU-126: MCP merge_entities() Tool

### Phase 3: Query Updates (1/1 Complete)
- ✅ FU-134: Query Updates

## 4. Integration Test Results

| Test ID | Name                             | Status     |
| ------- | -------------------------------- | ---------- |
| IT-001  | Raw File Ingestion Flow          | ✅ Passing |
| IT-002  | Content Deduplication            | ✅ Passing |
| IT-003  | Reinterpretation Immutability    | ✅ Passing |
| IT-004  | Correction Override              | ✅ Passing |
| IT-005  | Entity Merge Flow                | ✅ Passing |
| IT-006  | Cross-User Isolation             | ✅ Passing |
| IT-007  | Interpretation Quota Enforcement | ✅ Passing |
| IT-008  | Merged Entity Exclusion          | ✅ Passing |
| IT-009  | Provenance Chain                 | ✅ Passing |
| IT-010  | Entity Redirect on Merge         | ✅ Passing |

**Summary:** 11/11 integration tests passing (100%)

## 5. Key Achievements

- Content-addressed storage with SHA-256 deduplication per user
- Versioned interpretation runs with config logging
- MCP ingestion tools (ingest, ingest_structured, reinterpret, correct, merge_entities)
- Correction observations with priority 1000 (always win)
- Entity merge with observation rewriting
- Complete provenance chain (source → interpretation_run → observation)
- Cross-user data isolation via RLS

## 6. Next Steps

**REQUIRED BEFORE DEPLOYMENT:**
1. Execute all manual test cases in Section 9 (Testing Guidance)
2. Document test results (Pass/Fail for each test case)
3. Fix any test failures
4. Update status to `ready_for_deployment` after all tests pass

## 7. Testing Guidance

### Manual Test Cases (REQUIRED BEFORE DEPLOYMENT)

**All manual test cases below MUST be executed and validated before deployment can proceed.**

These test cases validate end-to-end functionality via MCP client integration (Cursor/ChatGPT). Each test case must be executed manually and documented as Pass/Fail.

**Test Execution Requirements:**
- Execute all 10 test cases (IT-001 through IT-010)
- Document results for each test case
- Fix any failures before proceeding to deployment
- All test cases must pass before deployment approval

**Prerequisites:**
- MCP server running and accessible
- Supabase instance with migrations applied
- Storage bucket `sources` created (private)
- Schema registry seeded
- Test user authenticated via MCP

#### IT-001: Raw File Ingestion Flow

**Goal:** Validate end-to-end ingestion from raw file to queryable entity

**Steps to test:**
1. Connect Cursor or ChatGPT to the Neotoma MCP server
2. Call MCP `ingest()` tool with PDF file content (base64-encoded or file path)
3. Wait for ingestion to complete
4. Verify source record created with content_hash
5. Verify file uploaded to storage at `sources/{user_id}/{hash}`
6. Verify interpretation run created with status 'completed'
7. Verify observations created for extracted entities
8. Query entity using `retrieve_entities` MCP tool and verify properties

**Expected results:**
- Source record created with correct SHA-256 content hash
- File accessible in storage at expected path
- Interpretation run shows status 'completed'
- Observations link to source_id and interpretation_run
- Entity queryable with extracted properties
- Provenance chain intact (source → interpretation_run → observation)

#### IT-002: Content Deduplication

**Goal:** Validate that identical content is not stored twice per user

**Steps to test:**
1. Call `ingest()` with a PDF file (record the source_id returned)
2. Call `ingest()` again with identical file content
3. Verify response indicates deduplication (`deduplicated: true`)
4. Verify same source_id returned (no new source created)
5. Verify no new storage upload occurred
6. Switch to a different user (or use different user_id)
7. Call `ingest()` with same content as different user
8. Verify separate source record created for different user

**Expected results:**
- Same user, same content: `deduplicated: true`, existing source_id returned
- Different user, same content: new source_id, new storage upload
- Content hash matches across both scenarios
- Storage deduplication works per-user (not globally)

#### IT-003: Reinterpretation Immutability

**Goal:** Validate that reinterpretation creates new observations without modifying existing ones

**Steps to test:**
1. Ingest a file via `ingest()` and record observation IDs from response
2. Record original observation content/fields
3. Call `reinterpret()` MCP tool on the source_id
4. Wait for reinterpretation to complete
5. Verify new interpretation run created (different ID from original)
6. Verify new observations created (different IDs from original)
7. Query original observations via `list_observations` and verify unchanged
8. Query entity snapshot and verify both old and new observations contribute

**Expected results:**
- New interpretation_run.id different from original
- New observation IDs (different from original)
- Original observations unchanged (immutability preserved)
- Both interpretation runs visible in history
- Snapshot computed from all observations (old + new)

#### IT-004: Correction Override

**Goal:** Validate that corrections override AI-extracted values

**Steps to test:**
1. Ingest a file via `ingest()` and note an AI-extracted field value
2. Query entity to record the AI-extracted value
3. Call `correct()` MCP tool with different value for that field
4. Verify correction observation created with source_priority=1000
5. Query entity again and verify correction value wins (not AI value)
6. Call `reinterpret()` on the source
7. Query entity again and verify correction still wins after reinterpretation

**Expected results:**
- Correction observation has source_priority=1000
- Entity snapshot shows correction value (not AI value)
- Correction persists after reinterpretation
- Correction always wins in snapshot computation

#### IT-005: Entity Merge Flow

**Goal:** Validate entity merge rewrites observations and updates snapshots

**Steps to test:**
1. Create two duplicate entities (via two separate ingestions of related content)
2. Record observation counts for both entities
3. Record entity IDs (from_entity_id and to_entity_id)
4. Call `merge_entities()` MCP tool with from_entity_id and to_entity_id
5. Verify entity_merges audit record created
6. Query observations that targeted from_entity - verify they now target to_entity
7. Query from_entity - verify merged_to_entity_id is set
8. Query to_entity snapshot - verify it includes all observations
9. Query entities via `retrieve_entities` - verify from_entity excluded from results

**Expected results:**
- Observations rewritten correctly (from_entity → to_entity)
- Audit log record created in entity_merges table
- Merged entity (from_entity) excluded from default queries
- Target entity snapshot recomputed with all observations
- Provenance chain preserved through merge

#### IT-006: Cross-User Isolation

**Goal:** Validate that users cannot access each other's data

**Steps to test:**

**6.1 Source Isolation:**
1. As User A, ingest a file via `ingest()`
2. As User B, attempt to query User A's source (via source_id if known)
3. Verify empty result or access denied error

**6.2 Entity Isolation:**
1. As User A, ingest a file and note the entity_id
2. As User B, attempt to query User A's entity via `retrieve_entities`
3. Verify empty result (entity not returned)

**6.3 Cross-User Merge Prevention:**
1. As User A, create an entity (entity E1)
2. As User B, create an entity (entity E2)
3. As User A, attempt `merge_entities(E1, E2)`
4. Verify error: entity access denied or similar error

**6.4 Cross-User Correction Prevention:**
1. As User A, create an entity
2. As User B, attempt `correct()` on User A's entity
3. Verify error: entity access denied

**Expected results:**
- RLS blocks cross-user source access
- RLS blocks cross-user entity access
- Merge validates same-user ownership
- Correction validates entity ownership
- All operations enforce user isolation

#### IT-007: Interpretation Quota Enforcement

**Goal:** Validate interpretation quota prevents excess usage

**Steps to test:**
1. Set user's interpretation quota limit (e.g., limit_month: 2)
2. Call `ingest()` with interpretation enabled - should succeed (count=1)
3. Call `reinterpret()` on the source - should succeed (count=2)
4. Call `reinterpret()` again - should fail with INTERPRETATION_QUOTA_EXCEEDED error
5. Verify quota enforcement blocks third interpretation
6. (Optional) Advance to next billing month or reset quota
7. (Optional) Call `reinterpret()` again - should succeed after reset

**Expected results:**
- Count increments with each interpretation
- Quota exceeded error when limit reached
- Error message indicates quota exceeded
- Quota properly enforced at interpretation boundary

#### IT-008: Merged Entity Exclusion

**Goal:** Validate merged entities are excluded from default queries

**Steps to test:**
1. Create two entities (entity A and entity B)
2. Merge entity A into entity B using `merge_entities(A, B)`
3. Query all entities via `retrieve_entities` (no filters)
4. Verify entity A is NOT in results
5. Verify entity B IS in results
6. Query entity A directly by ID - verify merged_to_entity_id is set
7. Query entity B - verify it includes all observations from entity A

**Expected results:**
- Merged entity excluded from default entity queries
- Target entity includes all observations
- Merged entity redirects to target entity
- Query filters properly exclude merged entities

#### IT-009: Provenance Chain

**Goal:** Validate complete provenance chain from source to observation

**Steps to test:**
1. Ingest a file via `ingest()` and note the source_id
2. Query interpretation runs for the source_id
3. Verify interpretation_run has source_id link
4. Query observations for entities from the interpretation
5. Verify observations have source_id and interpretation_run
6. Query entity snapshot via `get_entity_snapshot` MCP tool
7. Verify provenance maps fields to observation_ids
8. Query field provenance via `get_field_provenance` MCP tool
9. Verify provenance chain: field → observation → interpretation_run → source

**Expected results:**
- Complete provenance chain (source → interpretation_run → observation)
- Entity snapshot includes provenance mapping
- Field provenance traces to correct observation and source
- Provenance metadata preserved through all operations

#### IT-010: Entity Redirect on Merge

**Goal:** Validate that queries for merged entities redirect to target entity

**Steps to test:**
1. Create entity A and entity B
2. Ingest content linking to entity A
3. Merge entity A into entity B using `merge_entities(A, B)`
4. Query observations that targeted entity A
5. Verify they now reference entity B (redirected)
6. Query entity A directly - verify merged_to_entity_id points to entity B
7. Query entity B - verify it includes all observations
8. Attempt to create new observation targeting entity A - verify redirects to entity B

**Expected results:**
- Observations redirected from merged entity to target
- Merged entity redirects queries to target entity
- New observations targeting merged entity redirect correctly
- Redirect behavior consistent across all query operations

### Manual Validation Requirements (REQUIRED)

**All manual test cases in Section 7 MUST be executed before deployment.**

**MCP Client Integration Testing:**

**Via Cursor:**
1. Connect Cursor to MCP server (configure MCP server URL in Cursor settings)
2. Execute all 10 test cases (IT-001 through IT-010) listed above
3. Document results: Pass/Fail for each test case
4. Record any errors or unexpected behavior
5. Verify responses match expected structure

**Via ChatGPT:**
1. Connect ChatGPT to MCP server (configure MCP server URL in ChatGPT settings)
2. Execute all 10 test cases (IT-001 through IT-010) listed above
3. Document results: Pass/Fail for each test case
4. Record any errors or unexpected behavior
5. Verify responses match expected structure

**Test Execution Checklist:**
- [ ] IT-001: Raw File Ingestion Flow
- [ ] IT-002: Content Deduplication
- [ ] IT-003: Reinterpretation Immutability
- [ ] IT-004: Correction Override
- [ ] IT-005: Entity Merge Flow
- [ ] IT-006: Cross-User Isolation (all 4 sub-tests)
- [ ] IT-007: Interpretation Quota Enforcement
- [ ] IT-008: Merged Entity Exclusion
- [ ] IT-009: Provenance Chain
- [ ] IT-010: Entity Redirect on Merge

**All test cases must pass before deployment can proceed.**

## 8. Release Metrics

- **Feature Units Completed:** 13/13 (100%)
- **Integration Tests Passing:** 11/11 (100%)
- **Status:** `in_testing`
- **Development Time:** ~4 hours (single session, 2025-12-31)
- **Velocity:** 3.25 FUs/hour

## 9. Related Documents

- Release Plan: `docs/releases/v0.2.0/release_plan.md`
- Status: `docs/releases/v0.2.0/status.md`
- Integration Tests: `docs/releases/v0.2.0/integration_tests.md`
- Manifest: `docs/releases/v0.2.0/manifest.yaml`





