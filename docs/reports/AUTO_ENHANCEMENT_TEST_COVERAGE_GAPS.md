# Auto-Enhancement Test Coverage Gaps

**Date**: 2026-01-15  
**Status**: Analysis of why bugs weren't caught by integration tests

## Bugs That Weren't Caught

### Bug 1: Foreign Key Constraint Violation
**Issue**: Queue items couldn't be created because `user_id='00000000-0000-0000-0000-000000000000'` doesn't exist in `auth.users`.

**Why tests missed it:**
1. **Test doesn't verify queue creation succeeds**: `tests/integration/mcp_auto_enhancement.test.ts:119-127` checks if queue items exist, but doesn't verify they were actually created successfully. If queue creation fails silently (caught and logged), the test would still pass if items exist from a previous run.

2. **No explicit foreign key test**: There's no test that verifies queue items can be created with the default UUID, which would have caught the foreign key constraint violation.

3. **Silent error handling**: The `queueAutoEnhancementCheck` function catches errors and logs them without throwing (`src/services/schema_recommendation.ts:754-760`), so failures are silent and don't cause tests to fail.

### Bug 2: Observation Count Query Bug
**Issue**: Eligibility check used `.eq("user_id", null)` which means `user_id IS NULL`, but observations have the default UUID `'00000000-0000-0000-0000-000000000000'`.

**Why tests missed it:**
1. **Test doesn't verify eligibility check works**: `tests/integration/mcp_auto_enhancement.test.ts:135-193` checks that items were processed, but only verifies `processResult.processed + processResult.skipped > 0`. This would pass even if all items were skipped due to bugs.

2. **No test for observation count query**: The test at line 295-336 tests "row diversity" but doesn't verify that the observation count query works correctly with the default UUID. It just checks that processing ran without errors.

3. **Unit tests mock eligibility check**: `tests/services/auto_enhancement_processor.test.ts` mocks `checkAutoEnhancementEligibility`, so it never tests the actual database queries.

### Bug 3: Fragment Query Bug (entity_type column)
**Issue**: Confidence calculation queried non-existent `entity_type` column in `raw_fragments` table.

**Why tests missed it:**
1. **Unit tests mock confidence calculation**: `tests/services/schema_recommendation.test.ts` mocks `calculateFieldConfidence` in some tests, so it never tests the actual database query.

2. **No integration test for confidence calculation**: There's no integration test that verifies `calculateFieldConfidence` can actually query fragments from the database.

3. **Test doesn't verify confidence values**: The integration test at line 135-193 doesn't verify that confidence scores are calculated correctly - it just checks that recommendations may or may not be created.

### Bug 4: Fragment Query Bug (user_id handling)
**Issue**: Fragment queries didn't handle the default UUID correctly, returning 0 fragments.

**Why tests missed it:**
1. **Test doesn't verify fragments are found**: The test at line 115-117 checks that fragments exist, but doesn't verify that the eligibility check can actually find them when querying.

2. **No test for user_id query handling**: There's no test that verifies queries work correctly with both `user_id=null` and `user_id='00000000-0000-0000-0000-000000000000'`.

## Root Causes

### 1. Over-reliance on Mocks
- Unit tests mock critical functions (`checkAutoEnhancementEligibility`, `calculateFieldConfidence`), so they never test actual database queries.
- This means bugs in query construction (user_id handling, column names) are never caught.

### 2. Weak Assertions
- Integration tests use weak assertions like "items were processed" without verifying they were processed correctly.
- Tests check `processResult.processed + processResult.skipped > 0` which passes even if all items fail.

### 3. Silent Error Handling
- Functions catch errors and log them without throwing, so failures are silent and don't cause tests to fail.
- This means bugs that cause silent failures (like foreign key violations) aren't detected.

### 4. Missing Edge Case Tests
- No tests for the default UUID (`'00000000-0000-0000-0000-000000000000'`) vs `null` handling.
- No tests that verify foreign key constraints work correctly.
- No tests that verify queries work with both `user_id=null` and `user_id=UUID`.

### 5. Test Data Mismatch
- Tests use `testUserId = "00000000-0000-0000-0000-000000000000"` but don't verify this UUID exists in `auth.users`.
- Tests don't verify that data stored with this UUID can actually be queried back.

## Recommendations

### 1. Add Explicit Queue Creation Test
```typescript
it("should create queue items with default UUID without foreign key errors", async () => {
  // Verify queue creation succeeds with default UUID
  const { data, error } = await supabase
    .from("auto_enhancement_queue")
    .insert({
      entity_type: testEntityType,
      fragment_key: "test_field",
      user_id: testUserId, // Default UUID
      status: "pending",
    });
  
  expect(error).toBeNull();
  expect(data).toBeDefined();
});
```

### 2. Add Eligibility Check Integration Test
```typescript
it("should find fragments and observations with default UUID", async () => {
  // Store data with default UUID
  // Verify eligibility check can find fragments
  // Verify observation count query works
  const eligibility = await service.checkAutoEnhancementEligibility({
    entity_type: testEntityType,
    fragment_key: "test_field",
    user_id: testUserId, // Default UUID
  });
  
  expect(eligibility.eligible).toBe(true); // Should pass, not fail silently
});
```

### 3. Add Confidence Calculation Integration Test
```typescript
it("should calculate confidence from actual database fragments", async () => {
  // Store data with unknown fields
  // Verify confidence calculation queries fragments correctly
  const confidence = await service.calculateFieldConfidence({
    entity_type: testEntityType,
    fragment_key: "test_field",
    user_id: testUserId,
  });
  
  expect(confidence.confidence).toBeGreaterThan(0);
  expect(confidence.inferred_type).toBeDefined();
});
```

### 4. Strengthen Assertions
```typescript
// Instead of:
expect(processResult.processed + processResult.skipped).toBeGreaterThan(0);

// Use:
expect(processResult.succeeded).toBeGreaterThan(0); // Must have successes
expect(processResult.failed).toBe(0); // Must have no failures
```

### 5. Test Error Propagation
```typescript
it("should throw errors when queue creation fails", async () => {
  // Test that errors are propagated, not silently caught
  // This would catch foreign key violations
});
```

### 6. Add User ID Handling Tests
```typescript
describe("user_id handling", () => {
  it("should handle null user_id", async () => {
    // Test with user_id: null
  });
  
  it("should handle default UUID", async () => {
    // Test with user_id: '00000000-0000-0000-0000-000000000000'
  });
  
  it("should handle both null and default UUID in queries", async () => {
    // Test that queries find data stored with either value
  });
});
```

## Test Coverage Metrics

**Current Coverage:**
- ✅ Queue creation workflow (but doesn't verify success)
- ✅ Queue processing workflow (but doesn't verify eligibility)
- ✅ Schema recommendations creation (but doesn't verify confidence calculation)
- ❌ Foreign key constraint handling
- ❌ User ID query handling (null vs UUID)
- ❌ Observation count query with default UUID
- ❌ Fragment queries with default UUID
- ❌ Confidence calculation from actual database

**Recommended Coverage:**
- ✅ All of the above
- ✅ Explicit error propagation tests
- ✅ Edge case tests (null, default UUID, both)
- ✅ Integration tests that don't mock database queries
- ✅ Tests that verify actual database state matches expectations
