# Integration Test Execution Guide
**Purpose:** Defines when and how integration tests are executed during release builds.
**Related Documents:**
- [`release_workflow.md`](./release_workflow.md) — Release workflow integration
- [`release_orchestrator.js`](../../../scripts/release_orchestrator.js) — Orchestrator implementation
## Overview
Integration tests are **ALWAYS executed automatically** during the release build process (REQUIRED):
1. **After each batch completes:** Batch-level integration tests run
2. **After all batches complete:** Full integration test suite runs automatically (CANNOT BE SKIPPED)
**Critical:** The release orchestrator **MUST** run the full integration test suite after all batches complete. This is a required step in the release build process.
Test results are automatically updated in `status.md` and reflected in release reports.
## Execution Flow
### 1. Batch-Level Integration Tests
**When:** After each batch completes (all FUs in batch are `completed`)
**What runs:**
- Tests from `integration_tests.md` that cover the completed batch
- Determined by "Batches Covered" field in test definition
**How:**
- Orchestrator calls `runIntegrationTests(batchId, releaseId)`
- Parses `integration_tests.md` to find tests for the batch
- Executes test commands (if test files exist)
- Updates batch status based on test results
**Failure handling:**
- If batch-level tests fail → batch marked as failed, release execution stops
- User must fix issues and re-run
### 2. Full Integration Test Suite
**When:** After ALL batches complete
**What runs:**
- ALL tests from `integration_tests.md` (IT-001 through IT-XXX)
- Complete end-to-end validation of all Feature Units
**How:**
- **Orchestrator AUTOMATICALLY calls `runFullIntegrationTestSuite(releaseId)`** after all batches complete
- This is a **REQUIRED** step in the release build process
- Parses all tests from `integration_tests.md`
- Executes each test command (if defined)
- Updates `status.md` integration test status table with results
**Test Status Values:**
- `passed`: Test executed and passed
- `failed`: Test executed and failed
- `not_run`: Test command not defined or test file missing (acceptable for initial releases)
**Failure handling:**
- If any test **fails** → release status remains `in_progress`
- Release cannot be marked `ready_for_deployment` until all tests pass
- If tests show `not_run` → release can proceed, but tests should be implemented for full validation
- User must fix issues and re-run tests
## Test Status Values
Integration tests can have three status values:
- **`passed`** ✅ — Test executed and passed
- **`failed`** ❌ — Test executed and failed
- **`not_run`** ⏳ — Test not executed (no command defined or test file missing)
## Test Command Resolution
Tests are executed if:
1. **Test command is defined** in `integration_tests.md`:
   - Look for `test: "path/to/test/file.ts"` field
   - Or extract from "Machine-Checkable" section
2. **Test file exists** at the specified path
3. **Test executes successfully** via npm:
   ```bash
   npm run test:integration -- path/to/test/file.ts
   ```
If test command is missing or test file doesn't exist:
- Test is marked as `not_run` (⏳)
- Does not fail the release
- Shows up in report as not executed
## Status.md Updates
The orchestrator automatically updates `status.md`:
**After full test suite:**
- Updates integration test status table (Section 5)
- Sets status to `passed`, `failed`, or `not_run` for each test
- Updates summary: "X/Y tests passed"
**Format:**
```markdown
| Test ID | Name                                  | Status     |
| ------- | ------------------------------------- | ---------- |
| IT-001  | File Upload → Extraction → Query Flow | ✅ passed  |
| IT-002  | Entity Resolution Validation          | ❌ failed  |
| IT-003  | Timeline Event Validation             | ⏳ not_run |
```
## Manual Execution
If orchestrator is not used (manual release execution):
1. **Run tests manually:**
   ```bash
   npm run test:integration -- tests/integration/mcp_workflow.test.ts
   npm run test:integration -- tests/integration/entity_resolution.test.ts
   # ... etc for all tests
   ```
2. **Update status.md manually:**
   - Update integration test status table
   - Set status to `passed` or `failed` for each test
   - Update summary count
3. **Verify all tests pass** before marking release as `ready_for_deployment`
## Why Tests Might Not Run
Tests may show as `not_run` if:
1. **Test command not defined** in `integration_tests.md`
   - Solution: Add `test: "path/to/test/file.ts"` to test definition
2. **Test file doesn't exist yet**
   - Solution: Create test file at specified path
3. **Orchestrator not executed**
   - Solution: Run orchestrator or execute tests manually
4. **Test execution skipped** (test file missing during batch execution)
   - Solution: Ensure test files exist before running orchestrator
## Integration with Release Reports
Release reports automatically reflect integration test status:
- **Section 4.1:** Test execution summary table (shows all tests with status)
- **Section 4.2:** Detailed test case descriptions (from `integration_tests.md`)
- **Metrics:** Integration test pass rate calculated from status
Reports are generated from `status.md`, so test results must be updated there for reports to reflect them.
## Best Practices
1. **Define test commands** in `integration_tests.md` for all tests
2. **Create test files** before running orchestrator
3. **Run full test suite** after all batches complete (automatic via orchestrator)
4. **Update status.md** if running tests manually
5. **Verify all tests pass** before marking release as `ready_for_deployment`
## Troubleshooting
**Tests not running:**
- Check if orchestrator is being used
- Verify test commands are defined in `integration_tests.md`
- Verify test files exist at specified paths
- Check orchestrator logs for errors
**Tests showing as not_run:**
- Add test commands to `integration_tests.md`
- Create missing test files
- Re-run orchestrator after adding tests
**Tests failing:**
- Fix failing tests
- Re-run orchestrator or tests manually
- Update `status.md` when tests pass
