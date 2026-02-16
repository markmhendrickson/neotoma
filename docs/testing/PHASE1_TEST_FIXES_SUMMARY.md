# Phase 1 MCP Integration Tests - Fix Summary

## Overview

Fixed known issues in Phase 1 MCP integration tests to improve pass rate from 79/200 (39.5%) to 121/200 (60.5%).

**Date:** 2026-02-13
**Status:** In Progress
**Current Results:** 121 passing (60.5%), 57 failing (28.5%), 22 skipped (11%)

## Key Solutions Implemented

### 1. Snapshot Computation Helper Functions

**Problem:** Tests expected entity_snapshots and relationship_snapshots to exist immediately after creating observations, but snapshots are computed via reducers (not automatic).

**Solution:** Added helper functions to `tests/helpers/database_verifiers.ts`:

```typescript
/**
 * Compute entity snapshot from observations
 */
export async function computeEntitySnapshot(entityId: string): Promise<void> {
  const { ObservationReducer } = await import("../../src/reducers/observation_reducer.js");
  const reducer = new ObservationReducer();

  const { data: observations } = await supabase
    .from("observations")
    .select("*")
    .eq("entity_id", entityId);

  const snapshot = await reducer.computeSnapshot(entityId, observations);

  if (snapshot) {
    await supabase.from("entity_snapshots").upsert(snapshot, {
      onConflict: "entity_id",
    });
  }
}

/**
 * Compute relationship snapshot from relationship observations
 */
export async function computeRelationshipSnapshot(
  relationshipType: string,
  sourceEntityId: string,
  targetEntityId: string
): Promise<void> {
  const { RelationshipReducer } = await import("../../src/reducers/relationship_reducer.js");
  const reducer = new RelationshipReducer();

  const { data: observations } = await supabase
    .from("relationship_observations")
    .select("*")
    .eq("relationship_type", relationshipType)
    .eq("source_entity_id", sourceEntityId)
    .eq("target_entity_id", targetEntityId);

  const snapshot = await reducer.computeSnapshot(
    relationshipType,
    sourceEntityId,
    targetEntityId,
    observations
  );

  if (snapshot) {
    await supabase.from("relationship_snapshots").upsert(snapshot, {
      onConflict: "relationship_type,source_entity_id,target_entity_id",
    });
  }
}
```

### 2. Tests Fixed

#### ✅ Entity Tests (13/13 passing - 100%)
- `tests/integration/mcp_entity_variations.test.ts`
- **Fix Applied:** Added `computeEntitySnapshot()` calls after observation inserts
- **Example:**
  ```typescript
  await supabase.from("observations").insert({ ... });
  tracker.trackEntity(entityId);

  // NEW: Compute snapshot
  await computeEntitySnapshot(entityId);

  // Now query works
  const { data: entity } = await supabase
    .from("entity_snapshots")
    .select("*")
    .eq("entity_id", entityId)
    .single();
  ```

#### ✅ Relationship Tests (Partially Fixed)
- `tests/integration/mcp_relationship_variations.test.ts`
- **Fix Applied:**
  - Added snapshot computation to `createTestEntities()` helper
  - Added `computeRelationshipSnapshot()` after each relationship observation insert
- **Status:** Most tests now passing, a few still need fixes

#### ✅ Store Tests (Column Name Fixes)
- `tests/integration/mcp_store_variations.test.ts`
- **Fix Applied:**
  - `byte_size` → `file_size` (correct column name)
  - `file_name` → `original_filename` (correct column name)
- **Status:** Schema errors resolved, most store tests passing

## Remaining Issues

### 1. Correction Tests (8 failing)
- **File:** `tests/integration/mcp_correction_variations.test.ts`
- **Issue:** Correction observation inserts need snapshot computation
- **Fix Needed:** Add `computeEntitySnapshot()` after correction inserts
- **Example:**
  ```typescript
  await supabase.from("observations").insert({
    entity_id: entityId,
    fields: { title: "Corrected Title" },
    priority: 1000
  });

  // ADD THIS:
  await computeEntitySnapshot(entityId);

  // Then verify snapshot has corrected value
  ```

### 2. Query Tests (11 failing)
- **File:** `tests/integration/mcp_query_variations.test.ts`
- **Issue:** `beforeAll` creates 15 entities but doesn't compute snapshots
- **Fix Needed:** Add snapshot computation in `beforeAll` loop
- **Example:**
  ```typescript
  for (let i = 0; i < 15; i++) {
    const entityId = `ent_bulk_${Date.now()}_${i}`;
    await supabase.from("observations").insert({ ... });
    tracker.trackEntity(entityId);

    // ADD THIS:
    await computeEntitySnapshot(entityId);
  }
  ```

### 3. Schema Tests (10 failing)
- **File:** `tests/integration/mcp_schema_variations.test.ts`
- **Issue:** Various schema-related failures
- **Fix Needed:** Review and add snapshot computation where needed

### 4. Graph Tests (8 failing)
- **File:** `tests/integration/mcp_graph_variations.test.ts`
- **Issue:** Multi-entity graph operations need snapshot computation
- **Fix Needed:** Add snapshot computation for all entities in graph operations

### 5. Resource Tests (3 failing)
- **File:** `tests/integration/mcp_resource_variations.test.ts`
- **Issue:** Provenance/timeline tests need snapshots
- **Fix Needed:** Minor fixes for provenance chain tests

## Test Results Progression

| Stage | Passing | Failing | Skipped | Total | Pass Rate |
|-------|---------|---------|---------|-------|-----------|
| Initial | 79 | 74 | 47 | 200 | 39.5% |
| After Entity Fixes | 92 | 74 | 34 | 200 | 46.0% |
| After Relationship Fixes | 108 | 68 | 24 | 200 | 54.0% |
| After Store Fixes | 121 | 57 | 22 | 200 | 60.5% |
| **Target** | **180+** | **<20** | **0** | **200** | **90%+** |

## Implementation Pattern

### Standard Test Pattern (Working)

```typescript
// 1. Create source
const { data: source } = await supabase.from("sources").insert({ ... });
tracker.trackSource(source!.id);

// 2. Create observation(s)
await supabase.from("observations").insert({
  entity_id: entityId,
  entity_type: "task",
  source_id: source!.id,
  fields: { title: "Test", canonical_name: "Test" },
  user_id: testUserId
});

tracker.trackEntity(entityId);

// 3. CRITICAL: Compute snapshot
await computeEntitySnapshot(entityId);

// 4. Now query snapshots works
const { data: entity } = await supabase
  .from("entity_snapshots")
  .select("*")
  .eq("entity_id", entityId)
  .single();

expect(entity).toBeDefined();
expect(entity!.entity_type).toBe("task");
```

### For Relationships

```typescript
// 1. Create entities with observations
await supabase.from("observations").insert([...]);
await computeEntitySnapshot(entity1Id);
await computeEntitySnapshot(entity2Id);

// 2. Create relationship observation
await supabase.from("relationship_observations").insert({
  relationship_type: "PART_OF",
  source_entity_id: entity1Id,
  target_entity_id: entity2Id,
  source_id: source.id
});

// 3. CRITICAL: Compute relationship snapshot
await computeRelationshipSnapshot("PART_OF", entity1Id, entity2Id);

// 4. Now query snapshots works
const { data: relationship } = await supabase
  .from("relationship_snapshots")
  .select("*")
  .eq("relationship_type", "PART_OF")
  .eq("source_entity_id", entity1Id)
  .eq("target_entity_id", entity2Id)
  .single();
```

## Next Steps

### Immediate (Complete Phase 1 Fixes)

1. **Fix Correction Tests** - Add snapshot computation after correction inserts
2. **Fix Query Tests** - Add snapshot computation in `beforeAll` loop
3. **Fix Schema Tests** - Review and add snapshots where needed
4. **Fix Graph Tests** - Add snapshot computation for multi-entity operations
5. **Fix Resource Tests** - Minor provenance/timeline fixes

### Testing Commands

```bash
# Run all Phase 1 tests
npm run test:integration

# Run specific test file
npm run test:integration tests/integration/mcp_entity_variations.test.ts

# Run with verbose output
npm run test:integration -- --reporter=verbose

# Run specific test
npm run test:integration -- -t "should retrieve entity by entity_id"
```

### Validation

After all fixes:
- [ ] All Phase 1 tests pass (target: 180+/200)
- [ ] No skipped tests (0/200)
- [ ] All critical workflows verified (store, entity, relationship, correction)
- [ ] Database state verified in all tests (no mocks)

## Lessons Learned

1. **Snapshot computation is not automatic** - Tests must explicitly compute snapshots after creating observations
2. **Strong assertions catch bugs** - Verifying database state (not just return values) catches real issues
3. **Real database operations required** - Mocking hides schema bugs (wrong column names, FK violations)
4. **Edge cases matter** - Testing null user_id, default UUIDs, and FK constraints catches production bugs
5. **Complete workflows needed** - Testing full observation → snapshot → query flow catches integration issues

## Files Modified

- `tests/helpers/database_verifiers.ts` - Added snapshot computation helpers
- `tests/integration/mcp_entity_variations.test.ts` - Fixed all 13 tests
- `tests/integration/mcp_relationship_variations.test.ts` - Fixed most relationship tests
- `tests/integration/mcp_store_variations.test.ts` - Fixed column names

## Files Remaining

- `tests/integration/mcp_correction_variations.test.ts` - 8 tests need fixes
- `tests/integration/mcp_query_variations.test.ts` - 11 tests need fixes
- `tests/integration/mcp_schema_variations.test.ts` - 10 tests need fixes
- `tests/integration/mcp_graph_variations.test.ts` - 8 tests need fixes
- `tests/integration/mcp_resource_variations.test.ts` - 3 tests need fixes
