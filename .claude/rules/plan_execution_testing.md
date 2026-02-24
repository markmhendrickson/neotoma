---
description: "Load when executing a plan that includes test tasks: implement full test logic and assertions, not skeleton TODOs; run tests; mark test todos complete only after tests are implemented."
alwaysApply: false
---

<!-- Source: foundation/agent_instructions/cursor_rules/plan_execution_testing.mdc -->

# Plan Execution Testing Rule

## Rule

**When executing a plan that includes test implementation tasks, agents MUST implement the actual test logic, not just create skeleton test files with TODO comments.**

## Requirements

1. **Test Implementation is Mandatory:**
   - When a plan includes "Write unit tests" or "Write integration tests" tasks, these MUST be fully implemented
   - Tests must contain actual test logic, assertions, and mocks (where appropriate)
   - Skeleton tests with only TODO comments are NOT acceptable

2. **Test Coverage:**
   - Unit tests should test individual functions/methods in isolation
   - Integration tests should test end-to-end workflows with real database operations
   - Tests should cover both happy paths and error cases
   - Tests should validate edge cases and boundary conditions

3. **Test Quality:**
   - Tests must be runnable (no syntax errors, proper imports)
   - Tests should use appropriate mocking for unit tests
   - Tests should use real database operations for integration tests (with proper cleanup)
   - Tests should follow existing test patterns in the codebase

4. **When Tests Are Part of Plan:**
   - If plan includes test tasks, implement them during plan execution
   - Do NOT defer test implementation to "later" or mark as "TODO"
   - Complete test implementation before marking test-related todos as completed

## Examples

### ❌ Incorrect (Skeleton Only)
```typescript
it("should return ineligible if field is blacklisted", async () => {
  // TODO: Mock blacklist check
  // const result = await service.checkAutoEnhancementEligibility(...);
  // expect(result.eligible).toBe(false);
});
```

### ✅ Correct (Fully Implemented)
```typescript
it("should return ineligible if field is blacklisted", async () => {
  const mockBlacklistQuery = {
    select: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    data: [{ field_pattern: "_test*" }],
  };
  mockFrom.mockReturnValueOnce(mockBlacklistQuery);

  const result = await service.checkAutoEnhancementEligibility({
    entity_type: "transaction",
    fragment_key: "_test_field",
    user_id: "test-user-id",
  });

  expect(result.eligible).toBe(false);
  expect(result.reasoning).toContain("blacklisted");
});
```

## Integration with Plan Execution

When executing a plan:

1. **Identify Test Tasks:**
   - Look for todos with "test" in the description
   - Check plan phases for "Testing" or "Test" sections

2. **Implement Tests:**
   - Create test files with full implementation
   - Use existing test patterns from the codebase
   - Ensure tests are runnable and follow conventions

3. **Mark Todos Complete:**
   - Only mark test todos as completed after tests are fully implemented
   - Verify tests follow codebase patterns before completion

## Constraints

- **DO NOT** create test files with only TODO comments
- **DO NOT** defer test implementation to "later"
- **DO NOT** mark test todos as completed if tests are not implemented
- **DO** implement full test logic during plan execution
- **DO** follow existing test patterns in the codebase
- **DO** ensure tests are runnable and properly structured

## When This Applies

- During plan execution when plan includes test tasks
- When todos include "Write unit tests" or "Write integration tests"
- When plan phases include testing requirements
- Always when implementing features that require testing
