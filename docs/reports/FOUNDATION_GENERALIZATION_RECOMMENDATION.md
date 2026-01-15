# Foundation Generalization Recommendation: Test Quality Rules

**Date**: 2026-01-15  
**Decision**: Should integration test quality rules be moved to foundation?

## Analysis

### Current State

**Created in Neotoma:**
- `docs/testing/integration_test_quality_rules.mdc` — 563 lines of quality guidelines
- `docs/testing/test_quality_enforcement_rules.mdc` — 382 lines of enforceable patterns

**Foundation has:**
- `foundation/agent_instructions/cursor_rules/plan_execution_testing.mdc` — Test implementation rules
- No comprehensive testing conventions or quality standards

### Generalizability Assessment

#### Highly Generic Principles (95% generic)

These principles apply to **any project** with database operations:

1. **Don't mock database queries in integration tests**
   - Generic pattern: Integration tests should test real integrations
   - Applies to: Any DB (PostgreSQL, MySQL, MongoDB, etc.)
   - Neotoma-specific: Only the examples use Supabase/Neotoma tables

2. **Use strong assertions**
   - Generic pattern: Verify correct outcomes, not just "no error"
   - Applies to: Any testing framework
   - Neotoma-specific: None (completely generic)

3. **Test edge cases (null vs default values)**
   - Generic pattern: Test null, defaults, invalid values
   - Applies to: Any system with nullable fields or default values
   - Neotoma-specific: The specific UUID `00000000-0000-0000-0000-000000000000` is Neotoma's default

4. **Test foreign key constraints**
   - Generic pattern: Test null (if allowed), invalid, valid references
   - Applies to: Any relational database
   - Neotoma-specific: None (completely generic)

5. **Verify database state after operations**
   - Generic pattern: Query to verify actual state, don't trust return values
   - Applies to: Any database system
   - Neotoma-specific: None (completely generic)

6. **Test silent error handling**
   - Generic pattern: Test both success and failure paths
   - Applies to: Any system with try/catch that doesn't rethrow
   - Neotoma-specific: None (completely generic)

7. **Test complete workflows**
   - Generic pattern: Test end-to-end flows, not just individual steps
   - Applies to: Any system with multi-step workflows
   - Neotoma-specific: The specific workflow (auto-enhancement) is Neotoma-specific

### Neotoma-Specific Content (5% specific)

**Specific to Neotoma:**
- Table names: `raw_fragments`, `auto_enhancement_queue`, `schema_recommendations`
- Field names: `fragment_type`, `entity_type`, `fragment_key`
- Workflows: Auto-enhancement queue processing
- Default user: `00000000-0000-0000-0000-000000000000`

**But principles are universal:**
- The pattern "test null vs default UUID" applies to any system with default users
- The pattern "test FK constraints" applies to any relational DB
- The pattern "don't mock DB" applies to any integration test

## Recommendation: YES, Generalize with Layering

### Proposed Structure

```
foundation/conventions/testing_conventions.md
├── Generic principles (database, mocking, assertions, edge cases)
├── Generic examples (pseudocode or generic DB operations)
└── Reference to repository-specific applications

neotoma/docs/testing/integration_test_quality_rules.mdc
├── Import foundation/conventions/testing_conventions.md
├── Apply principles to Neotoma specifics
├── Neotoma-specific examples (raw_fragments, auto_enhancement)
└── Neotoma-specific patterns
```

### What Goes in Foundation

**File**: `foundation/conventions/testing_conventions.md`

**Contents:**
1. **Integration test principles** (generic)
   - Don't mock database queries
   - Use strong assertions
   - Test edge cases
   - Test foreign keys
   - Verify database state
   - Test silent errors
   - Test complete workflows

2. **Generic examples** (no Neotoma specifics)
   - Use generic table names (users, orders, items)
   - Use generic field names (user_id, status, created_at)
   - Use generic workflows (queue processing, async jobs)

3. **When to mock vs not mock** (generic)
   - External APIs: mock
   - Database: don't mock
   - File system: mock
   - Internal services: don't mock

4. **Edge case patterns** (generic)
   - Null vs non-null
   - Default values vs actual values
   - Invalid vs valid references
   - Empty vs populated collections

5. **Validation checklists** (generic)
   - No mocked DB queries
   - Strong assertions
   - Edge cases covered
   - Foreign keys tested
   - Database state verified

### What Stays in Neotoma

**File**: `docs/testing/integration_test_quality_rules.mdc`

**Contents:**
1. **Reference to foundation**:
   ```markdown
   **Reference**: `foundation/conventions/testing_conventions.md` — Generic testing principles
   
   This document applies foundation testing principles to Neotoma specifics.
   ```

2. **Neotoma-specific applications**:
   - How to test `raw_fragments` table
   - How to test `auto_enhancement_queue`
   - How to test Neotoma's default user UUID
   - How to test `fragment_type` vs `entity_type`
   - How to test Neotoma-specific workflows

3. **Neotoma-specific examples**:
   - Actual Neotoma table schemas
   - Actual Neotoma foreign key constraints
   - Actual Neotoma async workflows

## Implementation Plan

### Phase 1: Create Foundation Document
1. Create `foundation/conventions/testing_conventions.md`
2. Extract generic principles from Neotoma rules
3. Write generic examples (no Neotoma specifics)
4. Add validation checklists

### Phase 2: Update Neotoma Document
1. Update `docs/testing/integration_test_quality_rules.mdc`
2. Add reference to foundation document
3. Keep Neotoma-specific applications
4. Cross-reference foundation for generic patterns

### Phase 3: Sync to Cursor Rules
1. Run `setup_cursor_copies.sh`
2. Verify both foundation and Neotoma rules are available
3. Test that agents can load both

## Benefits of Generalization

### For Foundation
- Other repositories can use these proven patterns
- Consistent testing quality across all foundation-using repos
- Centralized maintenance of generic principles

### For Neotoma
- Still has Neotoma-specific applications
- Benefits from foundation updates
- Maintains specific examples and patterns

### For Other Repos
- Can adopt these patterns without Neotoma-specific context
- Can customize for their database (MySQL, MongoDB, etc.)
- Can add their own specific examples

## Trade-offs

### If We Generalize

**Pros:**
- Reusable across repositories
- Centralized maintenance
- Consistent quality standards
- Other repos benefit from lessons learned

**Cons:**
- Need to maintain two documents (foundation + Neotoma)
- Need to keep them in sync
- Generic examples may be less clear than specific ones

### If We Keep in Neotoma

**Pros:**
- Single document to maintain
- Examples are specific and clear
- No coordination with foundation needed

**Cons:**
- Other repos can't benefit
- Lessons learned are siloed
- Each repo must rediscover these patterns

## Recommendation: GENERALIZE

**Why:**
1. **Principles are 95% generic** - Apply to any database-backed system
2. **Lessons are valuable** - Other repos will face same issues
3. **Foundation is the right place** - Testing conventions belong with code conventions
4. **Neotoma keeps specifics** - Can still have detailed Neotoma examples
5. **Future-proof** - Next time we find test quality issues, foundation can be updated once

**Proposed structure:**
```
foundation/conventions/
├── code_conventions.md (exists)
├── documentation_standards.md (exists)
├── testing_conventions.md (NEW - generic principles)
└── writing_style_guide.md (exists)

neotoma/docs/testing/
├── testing_standard.md (exists - references foundation)
├── integration_test_quality_rules.mdc (updated - applies foundation to Neotoma)
└── test_quality_enforcement_rules.mdc (updated - Neotoma-specific enforcement)
```

## Next Steps

1. **Create foundation document**: `foundation/conventions/testing_conventions.md`
2. **Update Neotoma documents**: Reference foundation, keep Neotoma specifics
3. **Sync cursor rules**: Run `setup_cursor_copies.sh`
4. **Validate**: Ensure agents can load both foundation and Neotoma rules
5. **Document**: Update foundation README with new convention

## Example Foundation Content

**Generic principle (goes in foundation):**
```markdown
### Don't Mock Database Queries in Integration Tests

**MUST NOT**: Mock database query builders or ORMs in integration tests.

**Why**: Mocking hides bugs in query construction (wrong column names, incorrect null handling, missing filters).

**Generic example**:
```typescript
// ❌ Incorrect - mocked database
it("should find users", async () => {
  vi.spyOn(db, "query").mockResolvedValue([{ id: 1 }]);
  const users = await service.getUsers();
  expect(users.length).toBe(1);
});

// ✅ Correct - real database
it("should find users", async () => {
  await db.insert({ table: "users", data: { id: 1, name: "Test" } });
  const users = await service.getUsers();
  expect(users.length).toBe(1);
  expect(users[0].name).toBe("Test");
});
```
```

**Neotoma application (stays in Neotoma):**
```markdown
### Applying to Neotoma Auto-Enhancement

**Example from Neotoma auto-enhancement bugs:**
```typescript
// ❌ This mocked test did NOT catch the user_id bug
vi.spyOn(supabase, "from").mockReturnValue({
  select: vi.fn().mockResolvedValue({ data: fragments })
});

// ✅ This real test WOULD have caught the bug
await supabase.from("raw_fragments").insert({
  fragment_type: "task",
  user_id: "00000000-0000-0000-0000-000000000000",
});

const { data, error } = await supabase
  .from("raw_fragments")
  .select("*")
  .eq("fragment_type", "task")
  .eq("user_id", null); // Bug: returns 0 rows

expect(data?.length).toBeGreaterThan(0); // Test FAILS, bug caught
```
```

## Conclusion

**YES, generalize into foundation** with:
- Generic principles and patterns in `foundation/conventions/testing_conventions.md`
- Neotoma-specific applications in `docs/testing/integration_test_quality_rules.mdc`
- Both available to agents via `.cursor/rules/`

This ensures other repositories benefit from these lessons learned while maintaining Neotoma-specific examples and patterns.
