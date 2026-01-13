# Release v0.2.0 — Integration Tests
**Release**: Sources-First Ingestion Architecture  
**Status**: `planning`  
**Last Updated**: 2024-12-18
## 1. Purpose
Define the **integration test suite** for Release `v0.2.0` (Sources-First Ingestion Architecture). These tests:
- Validate end-to-end ingestion from raw content to queryable entities
- Verify content-addressed deduplication
- Validate interpretation immutability and versioning
- Verify user isolation (RLS) across all operations
- Validate entity merge behavior
- Are required to pass before release approval
## 2. Test Matrix
| ID | Name | FUs Involved | Priority |
|----|------|--------------|----------|
| IT-001 | Raw File Ingestion Flow | FU-110, FU-120, FU-121, FU-122 | P0 |
| IT-002 | Content Deduplication | FU-110, FU-120, FU-122 | P0 |
| IT-003 | Reinterpretation Immutability | FU-111, FU-121, FU-124 | P0 |
| IT-004 | Correction Override | FU-121, FU-125 | P0 |
| IT-005 | Entity Merge Flow | FU-113, FU-116, FU-126 | P0 |
| IT-006 | Cross-User Isolation | All | P0 |
| IT-007 | Upload Queue Retry | FU-112, FU-120, FU-130 | P0 |
| IT-008 | Interpretation Timeout | FU-111, FU-131 | P0 |
| IT-009 | Unknown Field Routing | FU-115, FU-121 | P0 |
| IT-010 | Interpretation Quota Enforcement | FU-112, FU-124 | P0 |
## 3. Test Definitions
### IT-001: Raw File Ingestion Flow
**Purpose**: Validate end-to-end ingestion from raw file to queryable entity
**Preconditions:**
- User authenticated
- Storage bucket accessible
- Schema registry seeded
**Steps:**
1. Call `ingest()` with PDF file content
2. Verify source record created with content_hash
3. Verify file uploaded to storage at `sources/{user_id}/{hash}`
4. Verify interpretation run created
5. Verify observations created for extracted entities
6. Verify entity snapshots computed
7. Query entity and verify properties
**Expected Results:**
- `source.content_hash` matches SHA-256 of input
- `source.storage_status` = 'uploaded'
- `interpretation_run.status` = 'completed'
- Observations link to `source_id` and `interpretation_run`
- Entity snapshot reflects extracted properties
**Acceptance Criteria:**
- ✅ Source record created with correct hash
- ✅ File accessible in storage
- ✅ Observations have provenance chain
- ✅ Entity queryable with extracted properties
### IT-002: Content Deduplication
**Purpose**: Validate that identical content is not stored twice per user
**Preconditions:**
- User authenticated
- IT-001 completed (file already ingested)
**Steps:**
1. Call `ingest()` with identical file content
2. Verify response indicates deduplication
3. Verify no new storage upload
4. Verify no new source record created
5. Call `ingest()` with same content as different user
6. Verify separate source record created for different user
**Expected Results:**
- Same user, same content: `deduplicated: true`, existing `source_id` returned
- Different user, same content: new `source_id`, new storage upload
**Acceptance Criteria:**
- ✅ Same content not duplicated per user
- ✅ Different users can have same content independently
- ✅ Content hash matches across both scenarios
### IT-003: Reinterpretation Immutability
**Purpose**: Validate that reinterpretation creates new observations without modifying existing ones
**Preconditions:**
- Source with completed interpretation exists
- At least one observation linked to source
**Steps:**
1. Record existing observation IDs and content
2. Call `reinterpret()` on source
3. Verify new interpretation run created
4. Verify new observations created (different IDs)
5. Verify original observations unchanged
6. Verify both old and new observations contribute to snapshot
**Expected Results:**
- New `interpretation_run.id` different from original
- New observation IDs
- Original observations have same content as before
- Snapshot computed from all observations
**Acceptance Criteria:**
- ✅ Original observations unchanged (immutability)
- ✅ New interpretation run has new ID
- ✅ Both interpretation runs visible in history
- ✅ Snapshot reflects merged observations
### IT-004: Correction Override
**Purpose**: Validate that corrections override AI-extracted values
**Preconditions:**
- Entity exists with AI-extracted properties
- Entity belongs to current user
**Steps:**
1. Query entity, record AI-extracted value for field
2. Call `correct()` with different value
3. Verify correction observation created with priority=1000
4. Query entity, verify correction value wins
5. Call `reinterpret()` on source
6. Verify correction still wins after reinterpretation
**Expected Results:**
- Correction observation has `source_priority: 1000`
- Entity snapshot shows correction value (not AI value)
- Correction persists after reinterpretation
**Acceptance Criteria:**
- ✅ Correction observation created
- ✅ Correction overrides AI extraction
- ✅ Correction survives reinterpretation
### IT-005: Entity Merge Flow
**Purpose**: Validate entity merge rewrites observations and updates snapshots
**Preconditions:**
- Two entities exist for same user (duplicates)
- Both entities have observations
**Steps:**
1. Record observation counts for both entities
2. Call `merge_entities(from_id, to_id)`
3. Verify observations rewritten to target entity
4. Verify source entity marked as merged
5. Verify target entity snapshot recomputed
6. Verify source entity excluded from default queries
7. Query observations that targeted merged entity
8. Verify they redirect to target
**Expected Results:**
- `entity_merges` audit record created
- All `from_entity` observations now have `entity_id = to_entity`
- `from_entity.merged_to_entity_id = to_entity`
- `to_entity` snapshot includes all observations
- `from_entity` not returned by default entity queries
**Acceptance Criteria:**
- ✅ Observations rewritten correctly
- ✅ Audit log created
- ✅ Merged entity excluded from queries
- ✅ Snapshot recomputed for target
### IT-006: Cross-User Isolation
**Purpose**: Validate that users cannot access each other's data
**Test Cases:**
#### 6.1 Source Isolation
1. User A ingests file
2. User B attempts to query User A's source
3. Verify empty result (RLS blocks)
#### 6.2 Entity Isolation
1. User A has entity
2. User B attempts to query User A's entity
3. Verify empty result (RLS blocks)
#### 6.3 Cross-User Merge Prevention
1. User A has entity E1
2. User B has entity E2
3. User A attempts `merge_entities(E1, E2)`
4. Verify error: `ENTITY_ACCESS_DENIED`
#### 6.4 Cross-User Correction Prevention
1. User A has entity
2. User B attempts `correct()` on User A's entity
3. Verify error: `ENTITY_ACCESS_DENIED`
**Acceptance Criteria:**
- ✅ RLS blocks cross-user source access
- ✅ RLS blocks cross-user entity access
- ✅ Merge validates same-user ownership
- ✅ Correction validates entity ownership
### IT-007: Upload Queue Retry
**Purpose**: Validate upload queue handles storage failures with retry
**Preconditions:**
- Storage can be temporarily made unavailable (mock)
**Steps:**
1. Configure storage to fail on upload
2. Call `ingest()` with file content
3. Verify source created with `storage_status: 'pending'`
4. Verify upload_queue record created
5. Restore storage availability
6. Wait for queue processor to run
7. Verify source updated to `storage_status: 'uploaded'`
8. Verify upload_queue record deleted
**Expected Results:**
- Initial failure queued, not blocking
- Retry succeeds
- Final status reflects success
**Acceptance Criteria:**
- ✅ Transient failures don't block ingest response
- ✅ Queue processor retries successfully
- ✅ Final status is 'uploaded'
### IT-008: Interpretation Timeout
**Purpose**: Validate stale interpretation runs are cleaned up
**Preconditions:**
- Can create interpretation run with old heartbeat
**Steps:**
1. Create interpretation run with `status: 'running'`
2. Set `heartbeat_at` to 15 minutes ago
3. Run stale interpretation cleanup worker
4. Verify run status changed to 'failed'
5. Verify error_message indicates timeout
**Expected Results:**
- Stale run marked as failed
- Error message: "Timeout - no heartbeat"
- `completed_at` timestamp set
**Acceptance Criteria:**
- ✅ Stale runs detected
- ✅ Status updated to failed
- ✅ Error message indicates timeout
### IT-009: Unknown Field Routing
**Purpose**: Validate unknown fields are stored in raw_fragments only
**Preconditions:**
- Schema for entity type has defined fields
- Interpretation extracts fields not in schema
**Steps:**
1. Ingest content that produces unknown fields
2. Verify observation created with valid fields only
3. Verify raw_fragments created with unknown fields
4. Verify interpretation_run.unknown_field_count incremented
5. Verify raw_fragments links to source_id and interpretation_run
**Expected Results:**
- Valid fields in observation
- Unknown fields in raw_fragments
- No duplication of unknown fields
- Provenance chain intact
**Acceptance Criteria:**
- ✅ Valid fields in observation
- ✅ Unknown fields only in raw_fragments
- ✅ unknown_field_count accurate
- ✅ Provenance links correct
### IT-010: Interpretation Quota Enforcement
**Purpose**: Validate interpretation quota prevents excess usage
**Preconditions:**
- User with quota limit set
**Steps:**
1. Set user's `interpretation_limit_month: 2`
2. Call `ingest()` with interpretation - success, count=1
3. Call `reinterpret()` - success, count=2
4. Call `reinterpret()` again
5. Verify error: `INTERPRETATION_QUOTA_EXCEEDED`
6. Advance to next month (mock billing_month)
7. Call `reinterpret()` - success, count reset
**Expected Results:**
- Count increments with each interpretation
- Quota exceeded error when limit reached
- Count resets on new billing month
**Acceptance Criteria:**
- ✅ Count increments correctly
- ✅ Quota enforced at limit
- ✅ Monthly reset works
## 4. Test Data Requirements
### 4.1 Sample Files
| Format | Size | Content |
|--------|------|---------|
| PDF | <1MB | Invoice with vendor, date, amount |
| CSV | <100KB | Transaction list with merchant, date, amount |
| JSON | <100KB | Structured data with known fields |
| Text | <50KB | Unstructured note content |
### 4.2 Test Users
- User A: Primary test user
- User B: Secondary user for isolation tests
- User C: User with low quota for quota tests
### 4.3 Edge Cases
- Empty file (should handle gracefully)
- Large file (>10MB, should handle or reject)
- Malformed content (should fail interpretation gracefully)
- Duplicate content (should deduplicate)
- Unknown entity type (should use generic fallback)
## 5. Test Environment
### 5.1 Required Components
- Supabase instance with migrations applied
- Storage bucket `sources` created
- Schema registry seeded
- Edge Functions deployed (workers)
### 5.2 Environment Variables
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY` (for AI interpretation)
### 5.3 Test Isolation
- Each test suite creates own test user
- Cleanup after each test
- No shared state between tests
## 6. Performance Benchmarks
| Operation | Target P95 |
|-----------|------------|
| ingest() (small file, no interpretation) | <500ms |
| ingest() (small file, with interpretation) | <5s |
| reinterpret() | <5s |
| correct() | <200ms |
| merge_entities() | <500ms |
| Query entity with provenance | <100ms |
## 7. Notes
- All tests assume greenfield database (no legacy data)
- AI interpretation tests may have variance; focus on structural correctness
- Timeout tests require ability to mock time or create backdated records
- Cross-user tests require multiple authenticated test users
- Performance benchmarks are targets, not hard requirements for release
