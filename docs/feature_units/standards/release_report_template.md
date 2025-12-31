# Release {RELEASE_ID} — Build Report
**Report Generated:** {REPORT_DATE}  
**Release Name:** {RELEASE_NAME}  
**Release Status:** {RELEASE_STATUS}
## Executive Summary
{STATUS_ICON} **Release Status:** {RELEASE_STATUS}
- **Batches:** {COMPLETED_BATCHES}/{TOTAL_BATCHES} complete ({BATCH_COMPLETION}%)
- **Feature Units:** {COMPLETED_FUS}/{TOTAL_FUS} complete ({FU_COMPLETION}%)
- **Checkpoints:** {COMPLETED_CHECKPOINTS}/{TOTAL_CHECKPOINTS} completed
- **Integration Tests:** {COMPLETED_TESTS}/{TOTAL_TESTS} passed
{CONDITIONAL_WARNINGS}
## 1. Batch Completion Summary
| Batch ID | Feature Units | Status | Completion |
| -------- | ------------- | ------ | ---------- |
{BATCH_ROWS}
**Summary:**
- ✅ **Complete:** {COMPLETED_BATCHES} batch(es)
- ⚠️ **Partial:** {PARTIAL_BATCHES} batch(es)
- ❌ **Incomplete:** {INCOMPLETE_BATCHES} batch(es)
## 2. Feature Unit Completion Summary
### 2.1 By Status
| Status                | Count             | Percentage           |
| --------------------- | ----------------- | -------------------- |
| ✅ Complete           | {COMPLETED_COUNT} | {COMPLETED_PERCENT}% |
| ⚠️ Partial            | {PARTIAL_COUNT}   | {PARTIAL_PERCENT}%   |
| ❌ Failed/Not Started | {FAILED_COUNT}    | {FAILED_PERCENT}%    |
| **Total**             | **{TOTAL}**       | **100%**             |
### 2.2 Feature Unit Details
| FU ID | Name | Status | Notes |
| ----- | ---- | ------ | ----- |
{FU_ROWS}
## 3. Checkpoint Status
{CHECKPOINT_ITEMS}
**Completion:** {COMPLETED_CHECKPOINTS}/{TOTAL_CHECKPOINTS} checkpoints completed
## 4. Integration Test Results
### 4.1 Test Execution Summary
{TEST_TABLE}
**Summary:** {COMPLETED_TESTS}/{TOTAL_TESTS} tests passed
### 4.2 Test Case Details
{TEST_CASE_DETAILS}
## 5. Key Achievements
{COMPLETED_FUS_SECTION}
### Infrastructure Delivered
{INFRASTRUCTURE_FUS}
### Core Services Delivered
{CORE_SERVICES_FUS}
### MCP Actions Delivered
{MCP_ACTIONS_FUS}
## 6. Issues and Blockers
{PARTIAL_FUS_SECTION}
{FAILED_FUS_SECTION}
{FAILED_TESTS_SECTION}
## 7. Decision Log Summary
{DECISION_TABLE}
## 8. Next Steps
{NEXT_STEPS_SECTION}
## 9. Testing Guidance
{TESTING_GUIDANCE_SECTION}
## 10. Release Metrics
### Completion Metrics
- **Batch Completion Rate:** {BATCH_COMPLETION}%
- **Feature Unit Completion Rate:** {FU_COMPLETION}%
- **Checkpoint Completion Rate:** {CHECKPOINT_COMPLETION}%
- **Integration Test Pass Rate:** {TEST_PASS_RATE}%
### Quality Metrics
- **Partial Implementation Rate:** {PARTIAL_RATE}%
- **Failure Rate:** {FAILURE_RATE}%
## 11. Related Documents
- **Release Plan:** `docs/releases/in_progress/{RELEASE_ID}/release_plan.md`
- **Manifest:** `docs/releases/in_progress/{RELEASE_ID}/manifest.yaml`
- **Status:** `docs/releases/in_progress/{RELEASE_ID}/status.md`
- **Execution Schedule:** `docs/releases/in_progress/{RELEASE_ID}/execution_schedule.md`
- **Integration Tests:** `docs/releases/in_progress/{RELEASE_ID}/integration_tests.md`
**Report Generated:** {GENERATION_TIMESTAMP}  
**Report Version:** 1.0  
**Report Specification:** `docs/feature_units/standards/release_report_spec.md`
