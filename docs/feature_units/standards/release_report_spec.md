# Release Report Specification

**Purpose:** Defines the structure, format, and generation rules for release build reports.

**Related Documents:**

- [`release_workflow.md`](./release_workflow.md) — Release workflow integration
- [`discovery_process.md`](./discovery_process.md) — Discovery report formats
- [`../../.cursor/rules/post_build_testing.md`](../../.cursor/rules/post_build_testing.md) — Post-build testing requirements

**CRITICAL REQUIREMENT:** Section 9 (Testing Guidance) is REQUIRED and MUST include all manual test cases from `integration_tests.md`. Agents MUST always describe these test cases after completing a release build.

- [`release_report_generation.md`](./release_report_generation.md) — Step-by-step generation guide
- [`release_report_template.md`](./release_report_template.md) — Report template with placeholders

---

## 1. Report Structure

### 1.1 Required Sections

Release reports MUST include the following sections in order:

1. **Header** — Release metadata (ID, name, status, generation date)
2. **Executive Summary** — High-level completion metrics and status
3. **Batch Completion Summary** — Batch-by-batch completion status
4. **Feature Unit Completion Summary** — Detailed FU status breakdown
5. **Checkpoint Status** — Checkpoint completion tracking
6. **Integration Test Results** — Test execution results
7. **Key Achievements** — Completed FUs grouped by category
8. **Issues and Blockers** — Partial/failed FUs and test failures
9. **Decision Log Summary** — Key decisions made during release
10. **Next Steps** — Recommended actions based on release status
11. **Testing Guidance** — Concrete steps for testing built Feature Units (integration tests, manual validation, acceptance criteria)
12. **Release Metrics** — Quantitative completion and quality metrics
13. **Related Documents** — Links to related release documentation

### 1.2 Section Templates

#### Header Template

```markdown
# Release {RELEASE_ID} — Build Report

**Report Generated:** {REPORT_DATE}
**Release Name:** {RELEASE_NAME}
**Release Status:** {RELEASE_STATUS}
```

#### Executive Summary Template

```markdown
## Executive Summary

{STATUS_ICON} **Release Status:** {RELEASE_STATUS}

- **Batches:** {COMPLETED_BATCHES}/{TOTAL_BATCHES} complete ({BATCH_COMPLETION}%)
- **Feature Units:** {COMPLETED_FUS}/{TOTAL_FUS} complete ({FU_COMPLETION}%)
- **Checkpoints:** {COMPLETED_CHECKPOINTS}/{TOTAL_CHECKPOINTS} completed
- **Integration Tests:** {COMPLETED_TESTS}/{TOTAL_TESTS} passed

{CONDITIONAL_WARNINGS}
```

**Conditional Warnings:**

- If `PARTIAL_FUS > 0`: Show warning about partial FUs
- If `FAILED_FUS > 0`: Show critical alert about failed FUs

#### Batch Completion Summary Template

```markdown
## 1. Batch Completion Summary

| Batch ID | Feature Units | Status | Completion |
| -------- | ------------- | ------ | ---------- |

{BATCH_ROWS}

**Summary:**

- ✅ **Complete:** {COMPLETED_BATCHES} batch(es)
- ⚠️ **Partial:** {PARTIAL_BATCHES} batch(es)
- ❌ **Incomplete:** {INCOMPLETE_BATCHES} batch(es)
```

**Batch Row Format:**

```markdown
| {BATCH_ID} | {FU_LIST} | {STATUS} | {ICON} |
```

**Status Icons:**

- `Complete` → ✅
- `Partial` → ⚠️
- Other → ❌

#### Feature Unit Completion Summary Template

```markdown
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
```

**FU Row Format:**

```markdown
| {FU_ID} | {FU_NAME} | {STATUS_ICON} {STATUS} | {NOTES} |
```

**Status Icons:**

- Status contains "Complete" → ✅
- Status contains "Partial" → ⚠️
- Other → ❌

#### Checkpoint Status Template

```markdown
## 3. Checkpoint Status

{CHECKPOINT_ITEMS}

**Completion:** {COMPLETED}/{TOTAL} checkpoints completed
```

**Checkpoint Item Format:**

```markdown
- {ICON} **{CHECKPOINT_NAME}**: `{STATUS}`
```

**Status Icons:**

- `completed` → ✅
- `pending` → ⏳
- Other → ❌

#### Integration Test Results Template

```markdown
## 4. Integration Test Results

{TEST_TABLE}

**Summary:** {COMPLETED}/{TOTAL} tests passed
```

**Test Table Format:**

```markdown
| Test ID | Name | Status |
| ------- | ---- | ------ |

{TEST_ROWS}
```

**Test Row Format:**

```markdown
| {TEST_ID} | {TEST_NAME} | {ICON} {STATUS} | {FUS_TESTED} | {DESCRIPTION} |
```

**Status Icons:**

- `passed` or `completed` → ✅
- `failed` → ❌
- Other → ⏳

**Test Case Details Format:**

```markdown
#### {TEST_ID}: {TEST_NAME}

**Goal:** {GOAL}

**Test Steps:**
{TEST_STEPS}

**Expected Results:**
{EXPECTED_RESULTS}

**Status:** {ICON} {STATUS}
```

Extract from `integration_tests.md`:

- Goal from "Goal:" line
- Test Steps from "Steps:" section
- Expected Results from "Expected Results:" section
- Status from status.md integration test status

#### Key Achievements Template

```markdown
## 5. Key Achievements

{COMPLETED_FUS_SECTION}

### Infrastructure Delivered

{INFRASTRUCTURE_FUS}

### Core Services Delivered

{CORE_SERVICES_FUS}

### MCP Actions Delivered

{MCP_ACTIONS_FUS}
```

**FU Categories:**

- **Infrastructure:** FU-000, FU-002, FU-050, FU-051, FU-052, FU-053, FU-054
- **Core Services:** FU-100, FU-101, FU-102, FU-103, FU-105
- **MCP Actions:** FU-200, FU-201, FU-202, FU-203, FU-204, FU-205, FU-206, FU-061

**Completed FUs Section Format:**

```markdown
### Completed Feature Units

{FU_LIST}
```

**FU List Item Format:**

```markdown
- ✅ **{FU_ID}**: {FU_NAME}{NOTES}
```

#### Issues and Blockers Template

```markdown
## 6. Issues and Blockers

{PARTIAL_FUS_SECTION}

{FAILED_FUS_SECTION}

{FAILED_TESTS_SECTION}
```

**Partial FUs Section:**

```markdown
### Partial Feature Units Requiring Follow-up

{FU_LIST}
```

**Failed FUs Section:**

```markdown
### Failed or Not Started Feature Units

{FU_LIST}
```

**Failed Tests Section:**

```markdown
### Failed Integration Tests

{TEST_LIST}
```

**FU List Item Format:**

```markdown
- {ICON} **{FU_ID}**: {FU_NAME}
  - {NOTES}
```

#### Decision Log Summary Template

```markdown
## 7. Decision Log Summary

{DECISION_TABLE}
```

**Decision Table Format:**

```markdown
| Date | Decision | Rationale |
| ---- | -------- | --------- |

{DECISION_ROWS}
```

**Decision Row Format:**

```markdown
| {DATE} | {DECISION} | {RATIONALE} |
```

#### Next Steps Template

```markdown
## 8. Next Steps

{STATUS_BASED_RECOMMENDATIONS}

## 9. Testing Guidance

{TESTING_GUIDANCE_SECTION}
```

**Testing Guidance Section Format:**

- Integration Tests: List all tests from `integration_tests.md` with IDs, names, and FUs tested
- Test Commands: Extract npm test commands from test definitions
- Manual Validation: List manual validation steps (e.g., Cursor/ChatGPT integration)
- Acceptance Criteria: Reference acceptance criteria from `release_plan.md` or `acceptance_criteria.md`

**Status-Based Recommendations:**

**Ready for Deployment:**

```markdown
### Ready for Deployment

✅ Release is ready for deployment. Recommended next steps:

1. **Final Review:** Conduct final code review and acceptance criteria validation
2. **Integration Testing:** Run all integration tests to validate end-to-end workflows
3. **Deployment:** Deploy to target environment (internal validation)
4. **Monitoring:** Set up monitoring and observability for post-deployment validation
5. **Documentation:** Update deployment documentation and runbooks
```

**Completed:**

```markdown
### Release Completed

✅ Release has been completed and deployed. Recommended next steps:

1. **Post-Deployment Validation:** Validate all acceptance criteria in production
2. **Monitoring:** Monitor key metrics and system health
3. **Documentation:** Update user documentation and API references
4. **Retrospective:** Conduct release retrospective to capture learnings
5. **Next Release Planning:** Begin planning for next release cycle
```

**In Progress:**

```markdown
### In Progress

⚠️ Release is still in progress. Recommended next steps:

1. **Complete Remaining FUs:** Focus on completing {REMAINING_COUNT} remaining Feature Unit(s)
2. **Integration Testing:** Run integration tests for completed batches
3. **Checkpoint Reviews:** Complete pending checkpoint reviews
4. **Issue Resolution:** Address any blockers or partial implementations
```

#### Release Metrics Template

```markdown
## 9. Release Metrics

### Completion Metrics

- **Batch Completion Rate:** {BATCH_COMPLETION}%
- **Feature Unit Completion Rate:** {FU_COMPLETION}%
- **Checkpoint Completion Rate:** {CHECKPOINT_COMPLETION}%
- **Integration Test Pass Rate:** {TEST_PASS_RATE}%

### Quality Metrics

- **Partial Implementation Rate:** {PARTIAL_RATE}%
- **Failure Rate:** {FAILURE_RATE}%
```

#### Related Documents Template

```markdown
## 10. Related Documents

- **Release Plan:** `docs/releases/in_progress/{RELEASE_ID}/release_plan.md`
- **Manifest:** `docs/releases/in_progress/{RELEASE_ID}/manifest.yaml`
- **Status:** `docs/releases/in_progress/{RELEASE_ID}/status.md`
- **Execution Schedule:** `docs/releases/in_progress/{RELEASE_ID}/execution_schedule.md`
- **Integration Tests:** `docs/releases/in_progress/{RELEASE_ID}/integration_tests.md`
```

---

## 2. Data Sources

Reports MUST be generated from the following sources:

1. **Status File:** `docs/releases/in_progress/{RELEASE_ID}/status.md`

   - Release metadata (ID, name, status)
   - Batch completion status
   - Feature Unit status
   - Checkpoint status
   - Integration test status
   - Decision log

2. **Manifest File:** `docs/releases/in_progress/{RELEASE_ID}/manifest.yaml`
   - Feature Unit definitions
   - Dependencies
   - Execution strategy

---

## 3. Calculation Rules

### 3.1 Completion Percentages

- **Batch Completion:** `(COMPLETED_BATCHES / TOTAL_BATCHES) * 100`
- **FU Completion:** `(COMPLETED_FUS / TOTAL_FUS) * 100`
- **Checkpoint Completion:** `(COMPLETED_CHECKPOINTS / TOTAL_CHECKPOINTS) * 100`
- **Test Pass Rate:** `(PASSED_TESTS / TOTAL_TESTS) * 100`

### 3.2 Status Detection

- **Complete:** Status contains "Complete" (case-insensitive)
- **Partial:** Status contains "Partial" (case-insensitive)
- **Failed:** Status contains "Failed" or "Not Started" (case-insensitive)

### 3.3 FU Categorization

- **Infrastructure:** FU-000, FU-002, FU-050, FU-051, FU-052, FU-053, FU-054
- **Core Services:** FU-100, FU-101, FU-102, FU-103, FU-105
- **MCP Actions:** FU-200, FU-201, FU-202, FU-203, FU-204, FU-205, FU-206, FU-061

---

## 4. Report Generation

### 4.1 When to Generate

Reports MUST be generated:

- After all batches complete (automatic via orchestrator)
- On-demand via manual script execution
- Before release deployment

### 4.2 Output Location

Reports MUST be written to:

```
docs/releases/in_progress/{RELEASE_ID}/release_report.md
```

### 4.3 Report Metadata

Each report MUST include:

- Generation timestamp (ISO 8601)
- Report version (currently 1.0)
- Release ID
- Report type (Build Report)

---

## 5. Report Template

The report structure is defined in:

```
docs/feature_units/standards/release_report_template.md
```

This template file contains placeholders (e.g., `{RELEASE_ID}`, `{BATCH_ROWS}`) that are replaced with actual data during report generation.

## 6. Report Generation Process

**Report generation is documentation-driven.** There is no script - agents or humans follow these instructions to generate reports.

### 6.1 Generation Steps

1. **Load Template:** Read `docs/feature_units/standards/release_report_template.md`
2. **Load Data Sources:**
   - Parse `docs/releases/in_progress/{RELEASE_ID}/status.md`
   - Parse `docs/releases/in_progress/{RELEASE_ID}/manifest.yaml`
3. **Calculate Metrics:** Apply calculation rules from Section 3
4. **Generate Content Sections:**
   - Extract batch data and format rows
   - Extract feature unit data and format rows
   - Extract checkpoint data and format items
   - Extract integration test data and format table
   - Generate achievement sections (infrastructure, core services, MCP actions)
   - Generate issues sections (partial FUs, failed FUs, failed tests)
   - Extract decision log and format table
   - Generate next steps based on release status
5. **Replace Placeholders:** Replace all `{PLACEHOLDER}` tokens in template with calculated/formatted values
6. **Write Report:** Save to `docs/releases/in_progress/{RELEASE_ID}/release_report.md`

### 6.2 Placeholder Reference

| Placeholder               | Source                       | Format                                             |
| ------------------------- | ---------------------------- | -------------------------------------------------- |
| `{RELEASE_ID}`            | Command argument             | String (e.g., "v0.1.0")                            |
| `{REPORT_DATE}`           | Current date                 | ISO date (YYYY-MM-DD)                              |
| `{RELEASE_NAME}`          | status.md                    | String                                             |
| `{RELEASE_STATUS}`        | status.md                    | String                                             |
| `{STATUS_ICON}`           | Calculated from status       | ✅ or ⚠️                                           |
| `{COMPLETED_BATCHES}`     | Calculated                   | Integer                                            |
| `{TOTAL_BATCHES}`         | Calculated                   | Integer                                            |
| `{BATCH_COMPLETION}`      | Calculated                   | Percentage (X.X%)                                  |
| `{COMPLETED_FUS}`         | Calculated                   | Integer                                            |
| `{TOTAL_FUS}`             | Calculated                   | Integer                                            |
| `{FU_COMPLETION}`         | Calculated                   | Percentage (X.X%)                                  |
| `{COMPLETED_CHECKPOINTS}` | Calculated                   | Integer                                            |
| `{TOTAL_CHECKPOINTS}`     | Calculated                   | Integer                                            |
| `{COMPLETED_TESTS}`       | Calculated                   | Integer                                            |
| `{TOTAL_TESTS}`           | Calculated                   | Integer                                            |
| `{CONDITIONAL_WARNINGS}`  | Conditional                  | Markdown (or empty)                                |
| `{BATCH_ROWS}`            | Formatted from batches       | Markdown table rows                                |
| `{PARTIAL_BATCHES}`       | Calculated                   | Integer                                            |
| `{INCOMPLETE_BATCHES}`    | Calculated                   | Integer                                            |
| `{COMPLETED_COUNT}`       | Calculated                   | Integer                                            |
| `{COMPLETED_PERCENT}`     | Calculated                   | Percentage (X.X%)                                  |
| `{PARTIAL_COUNT}`         | Calculated                   | Integer                                            |
| `{PARTIAL_PERCENT}`       | Calculated                   | Percentage (X.X%)                                  |
| `{FAILED_COUNT}`          | Calculated                   | Integer                                            |
| `{FAILED_PERCENT}`        | Calculated                   | Percentage (X.X%)                                  |
| `{TOTAL}`                 | Calculated                   | Integer                                            |
| `{FU_ROWS}`               | Formatted from FUs           | Markdown table rows                                |
| `{CHECKPOINT_ITEMS}`      | Formatted from checkpoints   | Markdown list items                                |
| `{TEST_TABLE}`            | Formatted from tests         | Markdown table (or "No integration tests defined") |
| `{COMPLETED_FUS_SECTION}` | Formatted from completed FUs | Markdown section (or empty)                        |
| `{INFRASTRUCTURE_FUS}`    | Filtered and formatted       | Markdown list items                                |
| `{CORE_SERVICES_FUS}`     | Filtered and formatted       | Markdown list items                                |
| `{MCP_ACTIONS_FUS}`       | Filtered and formatted       | Markdown list items                                |
| `{PARTIAL_FUS_SECTION}`   | Formatted from partial FUs   | Markdown section (or empty)                        |
| `{FAILED_FUS_SECTION}`    | Formatted from failed FUs    | Markdown section (or empty)                        |
| `{FAILED_TESTS_SECTION}`  | Formatted from failed tests  | Markdown section (or empty)                        |
| `{DECISION_TABLE}`        | Formatted from decisions     | Markdown table (or "No decisions recorded")        |
| `{NEXT_STEPS_SECTION}`    | Generated based on status    | Markdown section                                   |
| `{CHECKPOINT_COMPLETION}` | Calculated                   | Percentage (X.X%)                                  |
| `{TEST_PASS_RATE}`        | Calculated                   | Percentage (X.X%)                                  |
| `{PARTIAL_RATE}`          | Calculated                   | Percentage (X.X%)                                  |
| `{FAILURE_RATE}`          | Calculated                   | Percentage (X.X%)                                  |
| `{GENERATION_TIMESTAMP}`  | Current time                 | ISO 8601 timestamp                                 |

### 6.3 Formatting Rules

**Batch Rows Format:**

```markdown
| {BATCH_ID} | {FU_LIST} | {STATUS} | {ICON} |
```

- Icon: ✅ if status contains "Complete", ⚠️ if "Partial", ❌ otherwise

**FU Rows Format:**

```markdown
| {FU_ID} | {FU_NAME} | {ICON} {STATUS} | {NOTES} |
```

- Icon: ✅ if status contains "Complete", ⚠️ if "Partial", ❌ otherwise
- Notes: Use "-" if empty

**Checkpoint Items Format:**

```markdown
- {ICON} **{CHECKPOINT_NAME}**: `{STATUS}`
```

- Icon: ✅ if status is "completed", ⏳ if "pending", ❌ otherwise

**Test Rows Format:**

```markdown
| {TEST_ID} | {TEST_NAME} | {ICON} {STATUS} |
```

- Icon: ✅ if status is "passed" or "completed", ❌ if "failed", ⏳ otherwise

**FU List Items Format:**

```markdown
- ✅ **{FU_ID}**: {FU_NAME}{NOTES}
```

- Notes: Include in parentheses if present

**Decision Rows Format:**

```markdown
| {DATE} | {DECISION} | {RATIONALE} |
```

### 6.4 Conditional Sections

**Conditional Warnings:**

- If `PARTIAL_FUS > 0`: Add warning about partial FUs
- If `FAILED_FUS > 0`: Add critical alert about failed FUs

**Next Steps Section:**

- If status is "ready_for_deployment": Use "Ready for Deployment" template
- If status is "completed": Use "Release Completed" template
- Otherwise: Use "In Progress" template

### 6.5 Agent Instructions

When generating a release report:

1. **Read this specification** to understand the structure and rules
2. **Load the template** from `docs/feature_units/standards/release_report_template.md`
3. **Parse data sources** (status.md, manifest.yaml)
4. **Calculate all metrics** using the rules in Section 3
5. **Format all sections** according to Section 6.3
6. **Replace all placeholders** in the template
7. **Write the report** to `docs/releases/in_progress/{RELEASE_ID}/release_report.md`
8. **Verify completeness** - ensure all placeholders are replaced

**When to Generate:**

- After all batches complete (automatic via orchestrator)
- On-demand when requested
- Before release deployment

---

## 6. Future Enhancements

Potential future enhancements:

- Custom report templates per release type
- Additional metrics (time-to-completion, risk scores)
- Comparison with previous releases
- Export to multiple formats (JSON, HTML, PDF)
