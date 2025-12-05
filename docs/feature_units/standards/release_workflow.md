# Release Workflow

_(Orchestrating Multiple Feature Units into Cohesive Releases)_

---

## Purpose

Defines the **Release workflow** — the highest-level unit of work in Neotoma development. A Release is a collection of Feature Units that ship together with integrated testing, acceptance criteria, and deployment orchestration.

This workflow enables autonomous, checkpoint-driven execution of multi-FU releases (like MVP, v1.1, v2.0) with automatic dependency resolution, parallelization planning, and cross-FU integration testing.

---

## Hierarchy

```
Release (e.g., MVP, v1.1)
  ├── Feature Units (e.g., FU-100, FU-101, FU-102...)
  │     ├── Spec + Manifest
  │     ├── Prototype (if UI)
  │     ├── Implementation
  │     └── Tests (unit, integration, E2E)
  ├── Cross-FU Integration Tests
  ├── Release-Level Acceptance Criteria
  └── Deployment Plan
```

**MVP is the first Release; subsequent releases follow the same pattern.**

---

## Overview

The Release workflow has **3 interactive checkpoints** where human input is required:

1. **Checkpoint 0: Release Planning** — Define scope, FUs, priorities, dependencies, acceptance criteria
2. **Checkpoint 1: Mid-Release Review** — After critical-path FUs complete, validate cross-FU integration
3. **Checkpoint 2: Pre-Release Sign-Off** — All FUs complete, integration tests pass, ready to deploy

All other steps are autonomous, including:

- FU dependency analysis
- Execution schedule generation (sequential + parallel batches)
- FU creation and execution in dependency order
- Cross-FU integration testing
- Status tracking and reporting

---

## Prerequisites

Before creating a Release, verify:

- [ ] Release ID follows format: `vX.Y.Z` (e.g., `v1.0.0` for MVP, `v1.1.0` for next minor release)
- [ ] Release scope is defined (what's in, what's out)
- [ ] All included FUs are identified with IDs
- [ ] Release-level acceptance criteria are clear
- [ ] Deployment target is defined (staging, production)

---

## Workflow Steps

### Step 0: Checkpoint 0 — Release Planning

**Trigger:** User requests creation of Release with `release_id` (e.g., `v1.0.0`)

**Agent Actions:**

1. **Alignment Check (Spec vs Mental Model):**

   Before doing any planning work, the agent MUST:

   - Load and summarize the **canonical specs** relevant to this Release (e.g., `NEOTOMA_MANIFEST.md`, `MVP_OVERVIEW.md`, `GENERAL_REQUIREMENTS.md`, `MVP_FEATURE_UNITS.md` for MVP).
   - Present a concise, structured summary to the user covering:
     - What this Release will and will NOT change (in plain language).
     - Which subsystems and schema types are in scope.
     - The critical constraints that MUST NOT be violated (determinism, schema-first, no LLM extraction in Truth Layer, etc.).
   - Ask the user explicitly:
     - "Does this match your current mental model of this Release? (yes/no)"
     - "What feels off, missing, or over-scoped compared to what you actually want?"
   - Incorporate any corrections immediately and restate the updated understanding.

   **MUST NOT** proceed to plan creation until the user has confirmed that the summary matches their intent (or has explicitly accepted any divergence as temporary).

2. **Check if Release plan exists:**

   - Look for `docs/releases/vX.Y.Z/release_plan.md`
   - Look for `docs/releases/vX.Y.Z/manifest.yaml`

3. **If Release plan exists:**

   - Load existing plan and manifest
   - Validate completeness using checklist
   - If complete → proceed to Step 1
   - If incomplete → prompt user to complete missing sections

4. **If Release plan does NOT exist:**

   - **STOP and prompt user interactively** for required information:

   **Required Questions:**

   - Release name and version (e.g., "MVP", "v1.0.0")
   - Release goal (1-2 sentence summary)
   - Target ship date (date or "when ready")
   - Priority (P0 critical / P1 high / P2 normal)
   - Included Feature Units (list of `feature_id`s)
   - Excluded scope (what's explicitly NOT in this release)
   - Release-level acceptance criteria (product + technical + business)
   - Cross-FU integration test requirements
   - Deployment strategy (staging first, canary, full rollout)
   - Rollback plan (how to revert if issues found)
   - Post-release monitoring plan (metrics, alerts)

   **Agent Actions After User Input:**

   - Generate complete Release plan following template
   - Create manifest YAML with all FU dependencies
   - Validate all required sections present
   - Save to `docs/releases/vX.Y.Z/release_plan.md` and `manifest.yaml`

5. **Dependency Analysis (CRITICAL):**

   - Extract all FU IDs from manifest
   - For each FU, load its manifest and extract `dependencies.requires`
   - Build dependency graph (FU → [dependencies])
   - Detect cycles (if found, **REJECT** with error)
   - Validate all dependencies are satisfied:
     - If any required FU is ⏳ Not Started and not in this Release → **REJECT**
     - If any required FU is 🔨 Partial → **WARN** but allow with user confirmation
   - Generate **topological sort** of FUs (respects dependencies)

6. **Execution Schedule Generation:**

   - Group FUs into **batches**:
     - Batch 0: FUs with no dependencies
     - Batch 1: FUs that depend only on Batch 0
     - Batch 2: FUs that depend only on Batch 0 or 1
     - ... and so on
   - Within each batch, FUs can execute **in parallel**
   - Output execution schedule to `docs/releases/vX.Y.Z/execution_schedule.md`

7. **Create Release file structure:**

   ```
   docs/releases/vX.Y.Z/
     ├── release_plan.md           # Release goals, scope, acceptance criteria, pre-mortem
     ├── manifest.yaml              # FU list, dependencies, schedule, WIP limits
     ├── execution_schedule.md      # Generated execution plan with batches
     ├── integration_tests.md       # Cross-FU integration test specs (machine-checkable)
     └── status.md                  # Live status tracking + decision log
   ```

8. **Pre-Mortem Analysis (Failure Mode Identification):**

   Before finalizing the plan, the agent MUST:

   - Identify the **top 3-5 most likely failure modes** for this Release (e.g., "RLS migration breaks existing tenants", "graph integrity regressions", "MVP date slips by 2 weeks", "critical FU takes 2x longer than estimated").
   - For each failure mode, specify:
     - **Early warning signals** (metrics, test failures, timeline slips)
     - **Mitigating FUs or actions** (which FUs reduce this risk, what can be done proactively)
     - **Rollback plan** (how to detect and revert if this failure occurs)
   - Present this pre-mortem to the user and ask:
     - "Do these failure modes match your concerns? (yes/no)"
     - "What other failure modes should we plan for?"
   - Incorporate user feedback and update the Release plan with a "Pre-Mortem" section.

9. **WIP and Parallelization Limits:**

   - Encode limits in `manifest.yaml`:
     - `max_parallel_fus: <number>` (default: 3, adjust based on team size)
     - `max_high_risk_in_parallel: <number>` (default: 1, only one high-risk FU at a time)
   - Agent MUST enforce these limits during execution:
     - If a batch would exceed `max_parallel_fus`, split into sub-batches
     - If multiple high-risk FUs are ready, queue them sequentially
   - Present limits to user for approval: "Proposed limits: max_parallel_fus=3, max_high_risk_in_parallel=1. Approve? (yes/modify)"

10. **Machine-Checkable Exit Criteria:**

    - For each Release acceptance criterion, the agent MUST:
      - Define a **concrete test suite or script** that validates it
      - Specify a **single metric or query** that proves it (e.g., "0 orphans" → `SELECT COUNT(*) FROM events WHERE record_id NOT IN (SELECT id FROM records)` must return 0)
      - Add these to `integration_tests.md` with explicit pass/fail conditions
    - Present to user: "Each acceptance criterion now has a machine-checkable test. Review? (yes/modify)"

11. **Present execution schedule to user for approval:**

    - Display batches and parallel execution opportunities
    - Show estimated timeline based on FU complexity estimates
    - Show WIP limits and pre-mortem failure modes
    - **STOP and prompt user:** "Approve execution schedule? (yes/no/modify)"

12. **If approved:**
    - Initialize `status.md` with a "Decision Log" section (empty initially)
    - Mark Release status as `in_progress`
    - Proceed to Step 1

---

### Step 1: Execute FU Batches

**Trigger:** Execution schedule approved

**Agent Actions:**

1. **For each batch in execution schedule (in order):**

   a. **Start all FUs in batch (in parallel if multiple):**

   - For each FU in batch:
     - Check if FU spec exists; if not, run `Create New Feature Unit` workflow (Checkpoint 0)
     - If UI FU and prototype doesn't exist, run `Create Prototype` workflow
     - If UI FU and prototype not approved, run Checkpoint 1 (Prototype Review)
     - Run `Run Feature Workflow` to implement FU
     - Run `Final Review` (Checkpoint 2) for FU approval

   b. **Wait for all FUs in batch to complete**

   c. **Run cross-FU integration tests for this batch:**

   - Execute integration test suite from `integration_tests.md`
   - If tests fail:
     - **STOP** and report failures to user
     - User decides: fix and retry, skip FU, or abort Release
   - If tests pass, proceed to next batch

   d. **Update Release status:**

   - Mark batch as `completed` in `status.md`
   - Update overall Release progress percentage
   - If any decisions were made during batch execution (scope changes, FU deferrals, etc.), append to Decision Log in `status.md` with timestamp

2. **After all batches complete:**
   - Mark all FUs as `completed`
   - Proceed to Step 2

---

### Step 2: Checkpoint 1 — Mid-Release Review (Optional)

**Trigger:** Critical-path FUs complete (e.g., 50% of batches done)

**Agent Actions:**

1. **Check if mid-release checkpoint is configured:**

   - Look for `checkpoint_1_after_batch` in manifest
   - If not configured, skip this checkpoint

2. **If configured:**

   - **STOP and prompt user:**
     - "Mid-release checkpoint reached. X/Y FUs complete."
     - "Integration tests: [pass/fail summary]"
     - "Continue to remaining FUs? (yes/no/pause)"
   - If "no" or "pause": halt execution, allow user to review and resume later
   - If "yes": continue to remaining batches

---

### Step 3: Cross-Release Integration Testing

**Trigger:** All FU batches complete

**Agent Actions:**

1. **Run full cross-FU integration test suite:**

   - Execute all tests from `integration_tests.md`
   - Run end-to-end user flows that span multiple FUs
   - Verify no regressions in existing functionality

2. **Run Release-level acceptance criteria checks:**

   - Product acceptance: Core workflows functional, empty/error states handled
   - Technical acceptance: Performance benchmarks, test coverage, graph integrity
   - Business acceptance: Metrics instrumented, analytics ready

3. **Generate integration test report:**

   - Save to `docs/releases/vX.Y.Z/integration_test_report.md`
   - Include pass/fail summary, performance metrics, issues found

4. **If tests fail:**

   - **STOP** and report failures to user
   - User decides: fix issues and re-test, or abort Release

5. **If all tests pass:**
   - Proceed to Step 4

---

### Step 4: Checkpoint 2 — Pre-Release Sign-Off

**Trigger:** All FUs complete, integration tests pass

**Agent Actions:**

1. **Present Release summary:**

   - FUs completed: X/Y
   - Integration tests: [pass/fail summary]
   - Acceptance criteria: [checklist with status]
   - Release plan link
   - Integration test report link

2. **STOP and prompt user:**

   - "Release vX.Y.Z ready for deployment."
   - "All FUs complete: [list]"
   - "Integration tests passed: [summary]"
   - "Acceptance criteria met: [checklist]"
   - "Approve for deployment? (yes/no)"
   - "Any final changes needed? (list or 'none')"

3. **If user requests changes:**

   - Make changes
   - Re-run affected tests
   - Repeat Checkpoint 2 until approved

4. **If approved:**
   - Mark Release status as `ready_for_deployment`
   - Proceed to Step 5

---

### Step 5: Deployment

**Trigger:** Release approved for deployment

**Agent Actions:**

1. **Execute deployment plan:**

   - Follow deployment strategy from Release plan (staging first, canary, full rollout)
   - Run deployment scripts or guide user through manual steps
   - Verify deployment success (health checks, smoke tests)

2. **Update Release status:**

   - Mark Release as `deployed`
   - Record deployment timestamp

3. **Setup post-release monitoring:**

   - Verify metrics and alerts are active
   - Start monitoring key metrics from Release acceptance criteria

4. **COMPLETE:**
   - Move Release files from `in_progress/` to `completed/`:
     ```bash
     mv docs/releases/in_progress/vX.Y.Z docs/releases/completed/vX.Y.Z
     ```
   - Update Release status to `completed`

---

## File Locations

### In Progress Releases

```
docs/releases/in_progress/vX.Y.Z/
  ├── release_plan.md           # Release goals, scope, acceptance criteria
  ├── manifest.yaml              # FU list, dependencies, schedule
  ├── execution_schedule.md      # Generated execution plan with batches
  ├── integration_tests.md       # Cross-FU integration test specs
  └── status.md                  # Live status tracking
```

### Completed Releases

```
docs/releases/completed/vX.Y.Z/
  ├── release_plan.md
  ├── manifest.yaml
  ├── execution_schedule.md
  ├── integration_tests.md
  ├── integration_test_report.md
  └── status.md
```

---

## Release Manifest Format

```yaml
release:
  id: "v1.0.0"
  name: "MVP"
  status: "in_progress" # in_progress | ready_for_deployment | deployed | completed
  target_date: "2025-03-01"
  priority: "P0"

# WIP and parallelization limits
execution_limits:
  max_parallel_fus: 3 # Maximum FUs executing simultaneously
  max_high_risk_in_parallel: 1 # Maximum high-risk FUs executing simultaneously

feature_units:
  - id: "FU-100"
    priority: "P0"
    dependencies: ["FU-000"]
  - id: "FU-101"
    priority: "P0"
    dependencies: ["FU-100"]
  - id: "FU-102"
    priority: "P0"
    dependencies: ["FU-100"]
  - id: "FU-103"
    priority: "P0"
    dependencies: ["FU-101", "FU-102"]

execution_schedule:
  batches:
    - batch_id: 0
      feature_units: ["FU-100"]
      dependencies: []
    - batch_id: 1
      feature_units: ["FU-101", "FU-102"] # Can run in parallel
      dependencies: ["FU-100"]
    - batch_id: 2
      feature_units: ["FU-103"]
      dependencies: ["FU-101", "FU-102"]

checkpoints:
  checkpoint_1_after_batch: 1 # Optional mid-release review

acceptance_criteria:
  product:
    - criterion: "Core workflows functional (upload → extraction → timeline → AI query)"
      test: "playwright/tests/e2e/core_workflows.spec.ts"
      metric: null
    - criterion: "Empty states handled"
      test: "playwright/tests/e2e/empty_states.spec.ts"
      metric: null
    - criterion: "Error states handled with retry"
      test: "playwright/tests/e2e/error_states.spec.ts"
      metric: null
  technical:
    - criterion: "All P0 FUs deployed"
      test: null
      metric: "SELECT COUNT(*) FROM feature_units WHERE priority='P0' AND status='completed'"
    - criterion: "100% critical path test coverage"
      test: "npm run test:coverage -- --critical-path"
      metric: "coverage.critical_path >= 100"
    - criterion: "Graph integrity verified (0 orphans, 0 cycles)"
      test: "tests/integration/graph_integrity.test.ts"
      metric: "SELECT COUNT(*) FROM events WHERE record_id NOT IN (SELECT id FROM records) = 0"
  business:
    - criterion: "10 DAU (MVP launch)"
      test: null
      metric: "SELECT COUNT(DISTINCT user_id) FROM user_sessions WHERE date = CURRENT_DATE >= 10"
    - criterion: "100 total records ingested (first week)"
      test: null
      metric: "SELECT COUNT(*) FROM records WHERE created_at >= NOW() - INTERVAL '7 days' >= 100"

pre_mortem:
  failure_modes:
    - mode: "RLS migration breaks existing tenants"
      early_warning: "Test failures in multi-user isolation tests, migration dry-run errors"
      mitigation: "FU-701 includes comprehensive migration testing, staged rollout"
      rollback: "Revert migration, restore DB snapshot, disable RLS temporarily"
    - mode: "Graph integrity regressions"
      early_warning: "Integration tests fail, orphan node count > 0"
      mitigation: "FU-103 includes property-based tests, batch-level integration tests"
      rollback: "Disable graph builder, revert to single-record inserts"
    - mode: "MVP date slips by 2 weeks"
      early_warning: "FU completion rate < 80% after 50% of batches, critical FUs delayed"
      mitigation: "Mid-release checkpoint (Checkpoint 1), descope P1 FUs if needed"
      rollback: "Move non-critical FUs to v1.1.0, focus on P0 only"

deployment:
  strategy: "staging_first" # staging_first | canary | full_rollout
  rollback_plan: "Revert to previous release tag, restore DB snapshot if needed"

monitoring:
  key_metrics:
    - "Upload success rate (target: >95%)"
    - "P95 upload latency (target: <5s)"
    - "DAU (target: 10)"
```

---

## Dependency Graph Algorithm

```typescript
interface FUNode {
  id: string;
  dependencies: string[];
  status: "not_started" | "in_progress" | "completed";
}

function generateExecutionSchedule(fus: FUNode[]): Batch[] {
  const batches: Batch[] = [];
  const remaining = new Set(fus.map((fu) => fu.id));
  const completed = new Set<string>();

  while (remaining.size > 0) {
    // Find FUs whose dependencies are all completed
    const readyFUs = Array.from(remaining).filter((fuId) => {
      const fu = fus.find((f) => f.id === fuId);
      return fu.dependencies.every((dep) => completed.has(dep));
    });

    if (readyFUs.length === 0 && remaining.size > 0) {
      throw new Error("Circular dependency detected or missing dependencies");
    }

    // Create batch with all ready FUs (can execute in parallel)
    batches.push({
      batch_id: batches.length,
      feature_units: readyFUs,
      dependencies: [...completed],
    });

    // Mark as completed and remove from remaining
    readyFUs.forEach((fuId) => {
      completed.add(fuId);
      remaining.delete(fuId);
    });
  }

  return batches;
}
```

---

## Agent Instructions

### When to Load This Document

Load when:

- User requests creation of a new Release
- Planning multi-FU work
- Understanding Release orchestration
- Setting up Release-level integration tests

### Required Co-Loaded Documents

- `docs/feature_units/standards/creating_feature_units.md` — FU creation workflow
- `docs/feature_units/standards/execution_instructions.md` — FU execution flow
- `docs/specs/MVP_FEATURE_UNITS.md` — For MVP Release (first release)

### Constraints Agents Must Enforce

1. **NEVER start Release without complete Release plan**
2. **ALWAYS validate FU dependencies before generating schedule**
3. **REJECT Release if circular dependencies detected**
4. **ALWAYS run cross-FU integration tests after each batch**
5. **ALWAYS get user approval at Checkpoints 0, 1 (if configured), 2**
6. **NEVER deploy without passing integration tests**

### Forbidden Patterns

- Starting FUs out of dependency order
- Skipping cross-FU integration tests
- Proceeding past checkpoints without user approval
- Deploying with failing acceptance criteria

---

## Quick Reference

### Command Sequence

1. **Create Release:** Use `Create New Release` command with `release_id` (e.g., `v1.0.0`)
2. **Interactive Release planning:** Answer questions at Checkpoint 0
3. **Review execution schedule:** Approve batch plan and parallelization
4. **Autonomous FU execution:** Agent runs FUs in batch order with parallelization
5. **Mid-release review (optional):** Checkpoint 1 after critical-path FUs
6. **Pre-release sign-off:** Approve deployment at Checkpoint 2
7. **Deployment:** Follow deployment plan, setup monitoring

### Status Flow

```
Planning → In Progress → Ready for Deployment → Deployed → Completed
```

- **Planning:** Release plan being defined
- **In Progress:** FUs being executed in batches
- **Ready for Deployment:** All FUs complete, integration tests pass, user approved
- **Deployed:** Release deployed to production
- **Completed:** Release shipped and monitored

---

## Integration with Existing Workflows

**MVP as First Release:**

The MVP is treated as Release `v1.0.0`. The existing `docs/specs/MVP_EXECUTION_PLAN.md` and `docs/specs/MVP_FEATURE_UNITS.md` serve as the Release plan and FU inventory for `v1.0.0`.

**Future Releases:**

Subsequent releases (v1.1.0, v2.0.0) follow this same Release workflow pattern, each with their own:

- Release plan
- FU inventory
- Execution schedule
- Integration tests
- Acceptance criteria

**Relationship to Feature Units:**

- Release workflow orchestrates **multiple** Feature Units
- Feature Unit workflow (`creating_feature_units.md`) handles **individual** FUs
- Release workflow calls Feature Unit workflow for each FU in the schedule

---

## Example: MVP Release Execution

```
Release: v1.0.0 (MVP)
FUs: FU-100, FU-101, FU-102, FU-103, FU-300, FU-700, FU-701

Checkpoint 0: Release Planning
→ User defines scope, FUs, acceptance criteria
→ Agent generates dependency graph
→ Agent generates execution schedule:
    Batch 0: FU-100
    Batch 1: FU-101, FU-102 (parallel)
    Batch 2: FU-103
    Batch 3: FU-300, FU-700 (parallel)
    Batch 4: FU-701
→ User approves schedule

Step 1: Execute Batches
→ Batch 0: FU-100 (File Analysis) executes
→ Cross-FU integration tests pass
→ Batch 1: FU-101 (Entity Resolution) and FU-102 (Event Generation) execute in parallel
→ Cross-FU integration tests pass
→ Batch 2: FU-103 (Graph Builder) executes
→ Cross-FU integration tests pass
→ [Optional] Checkpoint 1: Mid-Release Review
→ Batch 3: FU-300 (Design System) and FU-700 (Auth) execute in parallel
→ Cross-FU integration tests pass
→ Batch 4: FU-701 (RLS) executes
→ Cross-FU integration tests pass

Step 3: Cross-Release Integration Testing
→ Full integration test suite runs
→ All tests pass

Checkpoint 2: Pre-Release Sign-Off
→ User reviews completion status
→ User approves deployment

Step 5: Deployment
→ Deploy to staging
→ Smoke tests pass
→ Deploy to production
→ Setup monitoring
→ Mark Release as completed
```

---

## Troubleshooting

### "Circular dependency detected" error

**Solution:**

- Review FU dependency graph
- Identify cycle: FU-A → FU-B → FU-C → FU-A
- Break cycle by removing one dependency or refactoring FUs

### Integration tests failing after batch

**Solution:**

- Review integration test failure report
- Identify which FUs caused regression
- Fix FU implementation and re-run batch
- Option: Skip failing FU and continue (if non-critical)

### Release taking longer than estimated

**Solution:**

- Review execution schedule and batch progress
- Identify bottlenecks (FUs taking longer than expected)
- Consider: Adding more parallel capacity, descoping P2 FUs, adjusting timeline
