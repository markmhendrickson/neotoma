---
name: create-release
description: Create a new software release with planning, manifest, and execution schedule.
triggers:
  - new release
  - create release
  - plan release
  - create-release
  - /create-release
---

# Create New Release

Orchestrates multiple Feature Units into a cohesive release. Implements the Release workflow from `foundation/development/release_workflow.md`.

## When to Use

**Explicit Command:** Use when you know exactly what you want: start a new release, plan multi-FU work with dependency resolution, generate execution schedules with parallelization, orchestrate FU creation/execution in dependency order, run cross-FU integration tests.

**Automatic Detection:** This workflow can also be triggered automatically via `.cursor/rules/release_detection.md` when you mention release-related patterns in natural language (e.g., "new release", "release v1.1.0"). Both paths execute the same workflow.

This is a foundation command. If installed, it will be available in `.cursor/commands/` via symlink.

## Prerequisites

- Release ID chosen (format: `vX.Y.Z`, e.g., `v1.0.0`)
- Release scope roughly defined (what's in, what's out)
- FU IDs for included work identified (or to be created)

## Command Execution

### Step 1: Load Documentation

Load required documents:
- `foundation/development/release_workflow.md` (primary workflow)
- `docs/feature_units/standards/creating_feature_units.md` (FU creation)
- `docs/feature_units/standards/execution_instructions.md` (FU execution)
- `docs/specs/MVP_FEATURE_UNITS.md` (if working on MVP)

### Step 2: Checkpoint 0 — Release Planning

Check if Release plan exists:

- Look for `docs/releases/in_progress/{release_id}/release_plan.md`
- Look for `docs/releases/in_progress/{release_id}/manifest.yaml`

**If Release plan exists:** Load and validate. If complete → proceed to Step 3. If incomplete → prompt user to complete.

**If Release plan does NOT exist:** Prompt user interactively for Release details:

1. **Release name and version** (e.g., "MVP", "v1.0.0")
2. **Release goal** (1-2 sentence summary of what this ships)
3. **Target ship date** (date or "when ready")
4. **Priority** (P0 critical / P1 high / P2 normal)
5. **Included Feature Units** (list of FU IDs, e.g., "FU-100, FU-101, FU-102" or "all P0 FUs from MVP_FEATURE_UNITS.md")
6. **Excluded scope** (what's explicitly NOT in this release)
7. **Release-level acceptance criteria:**
   - Product acceptance (core workflows, empty/error states)
   - Technical acceptance (test coverage, performance, integrity)
   - Business acceptance (metrics, KPIs)
8. **Cross-FU integration test requirements** (flows that span multiple FUs)
9. **Deployment strategy** (staging_first / canary / full_rollout)
10. **Rollback plan** (how to revert if issues found)
11. **Post-release monitoring plan** (key metrics, alerts)

**After user input:** Generate complete Release plan (`release_plan.md`), create manifest YAML (`manifest.yaml`), create integration test spec (`integration_tests.md`), create status tracker (`status.md`), save all to `docs/releases/in_progress/{release_id}/`.

### Step 3: Dependency Analysis and Schedule Generation

Analyze dependencies:

1. **Load all FU manifests** for FUs in Release
2. **Extract dependencies** from each FU's `dependencies.requires` field
3. **Build dependency graph**: FU → [list of required FUs]
4. **Detect cycles:** If cycle found → REJECT with error message. List cycle: "FU-A → FU-B → FU-C → FU-A"
5. **Validate dependencies:** If any required FU is ⏳ Not Started and not in this Release → REJECT. If any required FU is 🔨 Partial → WARN but allow with user confirmation. If any required FU is ✅ Complete → proceed.

Generate execution schedule:

1. **Perform topological sort** of FU dependency graph
2. **Group into batches**:
   - Batch 0: FUs with no dependencies
   - Batch 1: FUs that depend only on Batch 0
   - Batch 2: FUs that depend only on Batch 0 or 1
   - ... continue until all FUs assigned to batches
3. **Identify parallelization opportunities**:
   - Within each batch, FUs can execute in parallel
4. **Estimate timeline**:
   - Sum FU effort estimates per batch
   - Account for parallelization (divide by number of parallel agents if applicable)
5. **Save execution schedule** to `execution_schedule.md`

Pre-Mortem Analysis:

1. Identify top 3-5 most likely failure modes for this Release
2. For each failure mode, specify:
   - Early warning signals (metrics, test failures, timeline slips)
   - Mitigating FUs or actions
   - Rollback plan
3. Present pre-mortem to user and ask:
   - "Do these failure modes match your concerns? (yes/no)"
   - "What other failure modes should we plan for?"
4. Incorporate feedback and add "Pre-Mortem" section to Release plan

WIP and Parallelization Limits:

1. Encode limits in `manifest.yaml`:
   - `max_parallel_fus: <number>` (default: 3)
   - `max_high_risk_in_parallel: <number>` (default: 1)
2. Present limits to user: "Proposed limits: max_parallel_fus=3, max_high_risk_in_parallel=1. Approve? (yes/modify)"

Machine-Checkable Exit Criteria:

1. For each Release acceptance criterion, define:
   - Concrete test suite or script that validates it
   - Single metric or query that proves it
2. Add these to `integration_tests.md` with explicit pass/fail conditions
3. Present to user: "Each acceptance criterion now has a machine-checkable test. Review? (yes/modify)"

Present schedule to user: Display batch breakdown, show which FUs run in parallel, show estimated timeline, show WIP limits and pre-mortem failure modes. STOP and prompt: "Approve execution schedule? (yes/no/modify)"

**If user approves:**

- Initialize `status.md` with "Decision Log" section (empty initially)
- Update Release status to `in_progress`
- Proceed to Step 4

**If user requests modifications:**

- Adjust schedule based on user input
- Re-present for approval

---

### Step 4: Execute FU Batches (Autonomous)

Before starting execution, prompt user for execution strategy:
- Run `node scripts/release_orchestrator.js <release_id>`
- Orchestrator will prompt: "How would you like to execute this release build? 1. Single-agent (sequential execution) 2. Multi-agent (parallel execution)"
- If single-agent selected, orchestrator recommends model based on release complexity
- Selected strategy saved to `manifest.yaml`

For each batch in execution schedule (in order):

**Batch Execution Loop:**

1. **Start all FUs in batch:**

   - For each FU in batch:
     - Check if FU spec exists
     - If not, run `Create New Feature Unit` command (Checkpoint 0)
     - If UI FU and no prototype, run `Create Prototype` command
     - If UI FU and prototype not approved, run Checkpoint 1 (Prototype Review)
     - Run `Run Feature Workflow` command to implement FU
     - Run `Final Review` command (Checkpoint 2) for FU approval
   - If multiple FUs in batch, suggest running in parallel (separate agent sessions or worktrees)

2. **Wait for all FUs in batch to complete**

3. **Run cross-FU integration tests:**

   - Execute integration test suite from `integration_tests.md`
   - Test flows that span multiple FUs in this batch
   - If tests fail: STOP and report failures to user. User decides: fix and retry, skip FU, or abort Release
   - If tests pass, proceed

4. **Update Release status:**
   - Mark batch as `completed` in `status.md`
   - Update progress percentage: `(completed_batches / total_batches) * 100`
   - If any decisions were made during batch execution (scope changes, FU deferrals, etc.), append to Decision Log in `status.md` with timestamp

**After all batches complete:**

- Mark all FUs as `completed` in status tracker
- Proceed to Step 5

---

### Step 5: Checkpoint 1 — Mid-Release Review (Optional)

Check if mid-release checkpoint is configured: Look for `checkpoint_1_after_batch` in `manifest.yaml`. If not configured, skip to Step 6.

If configured and batch threshold reached, present mid-release status:

- "Mid-release checkpoint reached"
- "FUs completed: X/Y"
- "Integration tests: [pass/fail summary]"
- "Current batch: N"
- "Remaining batches: [list]"

**STOP and prompt user:**

- "Continue to remaining FUs? (yes/no/pause)"

**If user responds:**

- **yes** → continue to remaining batches
- **no** → halt execution, mark Release as `paused`
- **pause** → halt execution, user can resume later

---

### Step 6: Cross-Release Integration Testing

Run full integration test suite:

1. **Execute all tests** from `integration_tests.md`
2. **Run end-to-end user flows** that span multiple FUs
3. **Verify no regressions** in existing functionality
4. **Run performance benchmarks** (if specified in acceptance criteria)
5. **Verify graph integrity** (0 orphans, 0 cycles if applicable)

Check Release-level acceptance criteria:

- Product acceptance: Core workflows functional?
- Technical acceptance: Test coverage met? Performance targets hit?
- Business acceptance: Metrics instrumented? Analytics ready?

Generate integration test report:

- Save to `integration_test_report.md`
- Include:
  - Pass/fail summary
  - Performance metrics
  - Regression test results
  - Issues found (if any)

**If tests fail:** STOP and report failures to user. User decides: fix issues and re-test, or abort Release.

**If all tests pass:** Proceed to Step 7.

### Step 7: Checkpoint 2 — Pre-Release Sign-Off

Present Release summary:

- FUs completed: X/Y (with list)
- Integration tests: [pass/fail summary with link to report]
- Acceptance criteria: [checklist with ✅ / ❌ status]
- Release plan: [link]
- Integration test report: [link]

**STOP and prompt user:**

- "Release {release_id} ready for deployment."
- "All FUs complete: [list with status]"
- "Integration tests passed: [summary]"
- "Acceptance criteria met: [checklist]"
- "Approve for deployment? (yes/no)"
- "Any final changes needed? (list or 'none')"

**If user requests changes:**

- Apply changes
- Re-run affected tests
- Update status
- Repeat Checkpoint 2 until approved

**If user approves:**

- Update Release status to `ready_for_deployment`
- Proceed to Step 8

---

### Step 8: Deployment

Execute deployment plan:

1. **Follow deployment strategy** from Release plan:
   - **staging_first**: Deploy to staging, run smoke tests, then production
   - **canary**: Deploy to small % of users, monitor, then full rollout
   - **full_rollout**: Deploy to all users at once
2. **Run deployment steps:**
   - Build production bundle
   - Run database migrations (if any)
   - Deploy backend services
   - Deploy frontend assets
   - Run health checks
   - Run smoke tests
3. **Verify deployment success:**
   - Health checks pass?
   - Smoke tests pass?
   - Key metrics normal?

**If deployment fails:** STOP and report failure, execute rollback plan, user investigates and fixes.

**If deployment succeeds:** Update Release status to `deployed`, record deployment timestamp, proceed to Step 9.

### Step 9: Post-Release Monitoring Setup

Setup monitoring:

1. **Verify metrics instrumentation:**
   - Check that key metrics from acceptance criteria are being collected
   - Verify dashboards are accessible
2. **Setup alerts:**
   - Configure alerts for critical metrics (error rates, latency, etc.)
3. **Document monitoring links:**
   - Add links to dashboards, alerts to Release status doc

Mark Release as completed:

- Update status to `completed`
- Move Release files from `in_progress/` to `completed/`:
  ```bash
  mv docs/releases/in_progress/{release_id} docs/releases/completed/{release_id}
  ```

Present completion summary:

- "Release {release_id} deployed and complete!"
- "Deployed at: {timestamp}"
- "Monitoring: {dashboard_links}"
- "FUs shipped: [list]"

## Example Interaction

```
User: Create release v1.0.0 for MVP

Agent: Loading Release workflow documentation...

Agent: No existing Release plan found for v1.0.0. Starting interactive Release planning (Checkpoint 0).

Agent: What is the Release name and version?
User: MVP, v1.0.0

Agent: What is the Release goal? (1-2 sentence summary)
User: Ship deterministic Truth Layer with ingestion, extraction, entity resolution, timeline, and MCP access for AI tools. Support multi-user teams.

Agent: What is the target ship date?
User: 2025-03-01

Agent: What is the priority?
User: P0 critical

Agent: Which Feature Units should be included? (list FU IDs or "all P0 from MVP_FEATURE_UNITS")
User: all P0 from MVP_FEATURE_UNITS.md

Agent: [loads MVP_FEATURE_UNITS.md, extracts P0 FUs: FU-100, FU-101, FU-102, FU-103, FU-105, FU-300, FU-700, FU-701]

Agent: What scope is explicitly excluded from this release?
User: Semantic search, Plaid integration, X/Instagram integrations (all post-MVP)

Agent: What are the Release-level acceptance criteria? (product, technical, business)
User: [provides criteria from MVP_EXECUTION_PLAN.md]

Agent: What cross-FU integration tests are required?
User: Full user flow: upload → extraction → entity resolution → event generation → timeline display → AI query via MCP

Agent: What is the deployment strategy?
User: staging_first

Agent: What is the rollback plan?
User: Revert to previous release tag, restore DB snapshot if needed

Agent: What monitoring plan should be setup post-release?
User: Monitor upload success rate, P95 latency, DAU, orphan node count

Agent: Generating Release plan, manifest, and integration test spec...
Agent: Analyzing FU dependencies...
Agent: Dependency graph:
  FU-100 → []
  FU-101 → [FU-100]
  FU-102 → [FU-100]
  FU-103 → [FU-101, FU-102]
  FU-105 → [FU-103]
  FU-300 → []
  FU-700 → []
  FU-701 → [FU-700]

Agent: Generating execution schedule...
Agent: Execution schedule:
  Batch 0: FU-100, FU-300, FU-700 (can run in parallel)
  Batch 1: FU-101, FU-102 (can run in parallel, depend on FU-100)
  Batch 2: FU-103 (depends on FU-101, FU-102)
  Batch 3: FU-105, FU-701 (can run in parallel, FU-105 depends on FU-103, FU-701 depends on FU-700)

Agent: Estimated timeline: 11-14 days (with parallelization across 3 agents)

Agent: Approve execution schedule? (yes/no/modify)
User: yes

Agent: Starting batch execution...
Agent: Batch 0: Starting FU-100, FU-300, FU-700 in parallel...
[FU execution proceeds autonomously]
Agent: Batch 0 complete. Running cross-FU integration tests...
Agent: Integration tests passed.
Agent: Batch 1: Starting FU-101, FU-102 in parallel...
[continues through all batches]

Agent: All batches complete. Running full integration test suite...
Agent: All integration tests passed.
Agent: Release v1.0.0 ready for deployment.
Agent: All FUs complete: FU-100 ✅, FU-101 ✅, FU-102 ✅, FU-103 ✅, FU-105 ✅, FU-300 ✅, FU-700 ✅, FU-701 ✅
Agent: Integration tests passed: 12/12
Agent: Acceptance criteria met: ✅ Product, ✅ Technical, ✅ Business
Agent: Approve for deployment? (yes/no)
User: yes

Agent: Deploying to staging...
Agent: Staging smoke tests passed.
Agent: Deploying to production...
Agent: Production health checks passed.
Agent: Release v1.0.0 deployed and complete!
Agent: Monitoring: [dashboard links]
```

## Agent Instructions

### Load Order

1. `foundation/development/release_workflow.md` (primary)
2. `docs/feature_units/standards/creating_feature_units.md` (for FU creation)
3. `docs/feature_units/standards/execution_instructions.md` (for FU execution)
4. `docs/specs/MVP_FEATURE_UNITS.md` (if release_id is v1.0.0 / MVP)

### Constraints

- Do NOT proceed past Checkpoint 0 without complete Release plan
- Always validate FU dependencies before generating schedule
- REJECT if circular dependencies detected
- Always run cross-FU integration tests after each batch
- Always get user approval at Checkpoints 0, 1 (if configured), 2
- Do NOT deploy without passing integration tests and acceptance criteria

### Forbidden Patterns

- Starting FUs out of dependency order
- Skipping integration tests
- Proceeding without user approval at checkpoints
- Deploying with failing tests or unmet acceptance criteria
