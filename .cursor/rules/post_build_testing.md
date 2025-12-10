# Post-Build Testing Rule

**Purpose:** Ensures agents always describe manual test cases after completing a release build.

**Related Documents:**

- [`release_report_generation.md`](../docs/feature_units/standards/release_report_generation.md) — Report generation with test cases
- [`integration_test_execution.md`](../docs/feature_units/standards/integration_test_execution.md) — Integration test execution

---

## Rule

**After completing a release build, agents MUST:**

1. **Generate or update release report** with Section 9 (Testing Guidance) containing:

   - All manual test cases from `integration_tests.md`
   - Each test formatted as user-facing instructions
   - Step-by-step actions (not technical commands)
   - Expected results for each test

2. **Present test cases to user** with:

   - Summary: "After building this release, run the following manual test cases:"
   - List of all test IDs and names
   - Reference to Section 9 in release report for detailed instructions

3. **Include manual validation requirements** from `integration_tests.md` Section 5 (if present):
   - Cursor integration steps
   - ChatGPT integration steps

---

## When This Applies

- **After release orchestrator completes** all batches
- **After manual release build completion**
- **When generating release reports** (always include Section 9)
- **When user asks "what should I test?"** after a build

---

## Agent Actions

### After Release Build Completes

**Agent MUST:**

1. **Load integration tests:**

   - Read `docs/releases/in_progress/{RELEASE_ID}/integration_tests.md`
   - Extract all test definitions (ID, name, goal, steps, expected results)

2. **Generate test case descriptions:**

   - Format each test as user-facing instructions
   - Convert technical steps to user actions
   - Include expected results

3. **Update release report:**

   - Ensure Section 9 (Testing Guidance) exists and is populated
   - Include all tests from `integration_tests.md`
   - Format as manual test cases

4. **Present to user:**

   ```
   Release build complete. To validate functionality, run these manual test cases:

   See Section 9 (Testing Guidance) in release_report.md for detailed instructions:
   - IT-001: File Upload → Extraction → Query Flow
   - IT-002: Entity Resolution Validation
   - IT-003: Timeline Event Validation
   ... (list all tests)

   Each test includes step-by-step user actions and expected results.
   ```

---

## Test Case Format

Each test case MUST include:

```markdown
#### {TEST_ID}: {TEST_NAME}

**Goal:** {GOAL}

**Steps to test:**

1. {USER_ACTION_1}
2. {USER_ACTION_2}
   ...

**Expected results:**

- {EXPECTED_RESULT_1}
- {EXPECTED_RESULT_2}
```

**Step conversion rules:**

- "Call MCP `action`" → "Call MCP `action` via Cursor or ChatGPT"
- "Query table" → "Query using MCP actions or database queries"
- "Verify X" → "Verify X matches expected behavior"
- Remove technical implementation details
- Keep user actions clear and actionable

---

## Integration Points

### Release Orchestrator

After all batches complete:

1. Run full integration test suite (if test files exist)
2. Update `status.md` with test results
3. **Generate release report** (which includes Section 9 with manual test cases)
4. Log: "See release_report.md Section 9 for manual test cases"

### Release Report Generation

Section 9 (Testing Guidance) is **REQUIRED** and MUST:

- Include all tests from `integration_tests.md`
- Format as user-facing manual test cases
- Include manual validation requirements

### Manual Build Completion

If release is built manually (not via orchestrator):

- Agent MUST still generate/update release report with Section 9
- Agent MUST present test cases to user

---

## Constraints

- **NEVER skip** test case descriptions after build completion
- **ALWAYS include** all tests from `integration_tests.md`
- **ALWAYS format** as user-facing instructions (not developer commands)
- **ALWAYS reference** Section 9 in release report when presenting to user

---

## Related Documents

- `docs/feature_units/standards/release_report_generation.md` — Report generation process
- `docs/feature_units/standards/integration_test_execution.md` — Test execution details
- `docs/releases/in_progress/{RELEASE_ID}/integration_tests.md` — Test definitions

