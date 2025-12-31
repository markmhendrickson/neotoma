# Creating Feature Units
## Overview
The Feature Unit creation workflow has **3 interactive checkpoints** where human input is required:
1. **Checkpoint 0: Spec Creation + UX Input** — Interactive questions to flesh out complete spec (includes UX requirements if UI changes present)
2. **Checkpoint 1: Prototype Review** — Human approval before implementation (UI Feature Units only)
3. **Checkpoint 2: Final Review** — Human approval before completion
All other steps are autonomous.
**Git Workflow:** Each Feature Unit is developed in its own git worktree (recommended) or branch, then merged to `dev` after final approval. See `docs/developer/development_workflow.md` for worktree setup details.
## Prerequisites
Before creating a Feature Unit, verify:
- [ ] Feature Unit ID follows format: `FU-YYYY-MM-NNN` (e.g., `FU-2025-01-001`)
- [ ] Feature Unit is not a duplicate of existing work
- [ ] Feature Unit scope is atomic (single logical feature/fix)
- [ ] All dependencies are identified
## Workflow Steps
### Step 0: Checkpoint 0 — Spec Creation
**Trigger:** User requests creation of Feature Unit with `feature_id`
**Agent Actions:**
1. **Check if spec exists:**
   - Look for `docs/feature_units/completed/FU-XXX/FU-XXX_spec.md`
   - Look for `docs/feature_units/in_progress/FU-XXX/FU-XXX_spec.md`
   - Look for `docs/specs/MVP_FEATURE_UNITS.md` (for MVP FUs)
2. **If spec exists:**
   - Load existing spec
   - Validate completeness using template checklist
   - If complete → proceed to Step 1
   - If incomplete → prompt user to complete missing sections
3. **If spec does NOT exist:**
   - **STOP and prompt user interactively** for required information:
   **Required Questions:**
   - Feature name and brief description
   - Priority (P0/P1/P2/P3)
   - Risk level (Low/Medium/High) — reference `docs/private/governance/risk_classification.md`
   - User value (why this matters)
   - Functional requirements (list)
   - Non-functional requirements (performance, determinism, accessibility, i18n)
   - Affected subsystems (primary subsystems and what changes)
   - Dependencies (list of `feature_id`s this FU requires)
   - Schema changes (if any)
   - API/MCP changes (if any)
   - UI changes (if any) — brief description
   - Testing strategy (unit, integration, E2E)
   - Observability (metrics, logs, events) — **REQUIRED**: At least one metric or log pattern that would catch this FU misbehaving
   - Kill switch / defer criteria (conditions under which this FU should be dropped from current release or postponed)
   - Cross-cutting concern tags (e.g., ["schema", "security", "ui", "ingestion", "search"]) — used for scheduling
   **If UI changes are indicated, also ask UX Questions:**
   - User flow description (step-by-step user journey)
   - Visual design requirements (layout, styling preferences)
   - Interaction patterns (how users interact with components)
   - Responsive design requirements (mobile, tablet, desktop)
   - Accessibility priorities (keyboard nav, screen readers, etc.)
   - Empty states (what users see when no data)
   - Error states (how errors are displayed)
   - Loading states (how loading is indicated)
   - Success states (confirmation, feedback)
   - Any mockups, wireframes, or design references
   **Agent Actions After User Input:**
   - Generate complete spec following `docs/feature_units/standards/feature_unit_spec.md` template
   - If UX input was collected, add "UX Requirements" section to spec with all UX details
   - Create manifest following `docs/feature_units/standards/manifest_template.yaml`
   - If UX input was collected, update manifest `ui` section with UX details
   - Validate all required sections present
   - Save to `docs/feature_units/in_progress/FU-XXX/FU-XXX_spec.md` and `manifest.yaml`
   **Alignment Check (Spec vs Mental Model):**
   After drafting the spec (and before any prototype or implementation work), the agent MUST:
   - Produce a concise summary of the Feature Unit, covering:
     - The problem it solves and why it exists (in plain language).
     - What is explicitly in scope and explicitly out of scope.
     - Which subsystems and schema types it will touch.
     - Any critical invariants or constraints (determinism, boundaries, schema doctrine).
   - Present this summary to the user and ask explicitly:
     - "Does this accurately capture what you want this Feature Unit to do? (yes/no)"
     - "What feels off, missing, or over-scoped compared to your intent?"
   - Incorporate corrections into the spec immediately and re-summarize if changes are substantial.
   **MUST NOT** proceed to prototype creation or implementation until the user has confirmed that the spec summary matches their mental model (or has explicitly accepted any divergence).
4. **Dependency Validation (CRITICAL):**
   - Extract all `feature_id`s from `dependencies.requires` in manifest
   - For each dependency, check:
     - If listed in `docs/specs/MVP_FEATURE_UNITS.md`: check status (✅ Complete | 🔨 Partial | ⏳ Not Started)
     - If status is **⏳ Not Started**: **REJECT creation** with error:
       ```
       ERROR: Cannot create FU-XXX. Required dependency FU-YYY is not yet implemented.
       Please implement FU-YYY first, or remove the dependency if not actually required.
       ```
     - If status is **🔨 Partial**: **WARN** but allow (user must confirm)
     - If status is **✅ Complete**: proceed
     - If dependency spec exists in `docs/feature_units/completed/FU-YYY/`: check `status` field — must be `completed`
     - If dependency not found: **REJECT** with same error
5. **Create file structure:**
   ```
   docs/feature_units/in_progress/FU-XXX/
     ├── FU-XXX_spec.md
     ├── manifest.yaml
     └── (DSL file created later if UI component)
   ```
6. **Create test directory structure:**
   ```
   tests/unit/features/FU-XXX/
   tests/integration/features/FU-XXX/
   tests/e2e/features/FU-XXX/
   tests/regression/features/FU-XXX/
   ```
   (Create directories, but do not populate with tests yet)
### Step 1: Prototype Creation (UI Feature Units Only)
**Trigger:** Spec created with UX requirements (if UI changes) OR no UI changes required
**Agent Actions:**
1. **If UI changes present:**
   - Create fully functional client-side prototype:
     - Use `frontend/src/prototype/` directory structure
     - Create prototype component(s) with comprehensive mocked API calls
     - Mock all backend APIs needed for full interactivity
     - Use existing design system components from `frontend/src/components/ui/`
     - Include all states (loading, error, empty, success)
     - Add keyboard navigation and ARIA labels
     - Make prototype runnable via `npm run dev:prototype` or similar
2. **Prototype requirements:**
   - Fully interactive (users can click, type, navigate)
   - All API calls mocked (no real backend needed)
   - All UI states testable (empty, error, loading, success)
   - Accessible (keyboard nav, ARIA)
   - Uses existing design system
   - Documented mock API responses in `frontend/src/prototype/fixtures/`
3. **Save prototype:**
   - Components: `frontend/src/prototype/components/FU-XXX_*.tsx`
   - Fixtures: `frontend/src/prototype/fixtures/FU-XXX_*.ts`
   - Integration: Update `frontend/src/prototype/main.tsx` to include new prototype
4. **If no UI changes:**
   - Skip to Step 2
### Step 2: Checkpoint 1 — Prototype Review (UI Feature Units Only)
**Trigger:** Prototype created (or no UI changes required)
**Agent Actions:**
1. **Present prototype for review:**
   - Display prototype location and how to run it
   - Summarize what the prototype demonstrates
   - List all mocked APIs and interactions
2. **STOP and prompt user:**
   - "Please review the prototype at [location]. Run with [command]."
   - "Does the prototype meet your requirements? (yes/no)"
   - "Any changes needed? (list changes or 'none')"
3. **If user requests changes:**
   - Update prototype based on feedback
   - Repeat Step 3 until approved
4. **If approved:**
   - Document approval in spec: `**Prototype Approved:** YYYY-MM-DD`
   - Proceed to Step 3
### Step 3: Implementation
**Trigger:** Prototype approved (if UI Feature Unit) OR spec created with no UI changes
**Agent Actions:**
1. **Load implementation documents:**
   - `docs/feature_units/standards/execution_instructions.md`
   - `docs/feature_units/standards/feature_unit_spec.md` (this FU's spec)
   - `docs/NEOTOMA_MANIFEST.md`
   - Relevant subsystem docs from `docs/subsystems/`
   - Relevant architecture docs from `docs/architecture/`
2. **Create worktree and feature branch:**
   ```bash
   # Navigate to main repo root (if using worktrees)
   cd /path/to/neotoma
   # Ensure dev is up to date
   git fetch origin
   git checkout dev
   git pull origin dev
   # Create worktree for this Feature Unit (creates branch from current branch, which should be dev)
   git worktree add ../neotoma-FU-XXX -b feature/FU-XXX-short-description
   # Navigate to worktree
   cd ../neotoma-FU-XXX
   # Verify branch is based on dev
   git branch --show-current  # Should show feature/FU-XXX-short-description
   git log --oneline -1       # Should show latest dev commit
   # Setup worktree environment (copies .env files)
   npm run copy:env || node scripts/copy-env-to-worktree.js
   # Install dependencies in worktree
   npm install
   # Push branch to remote
   git push -u origin feature/FU-XXX-short-description
   ```
   **Note:** Using worktrees allows parallel development of multiple Feature Units. Each worktree is isolated with its own `node_modules`, `.env`, and build artifacts. If not using worktrees, create branch in main repo instead (see `docs/developer/development_workflow.md`).
3. **Follow implementation order (from execution_instructions.md):**
   - Domain logic (deterministic, pure functions)
   - Application logic (services, orchestration)
   - UI implementation (if applicable) — use prototype as reference
   - Tests (unit, integration, E2E)
   - Documentation updates
   - Observability (metrics, logs, events)
4. **Implementation requirements:**
   - Follow all architectural invariants
   - Maintain determinism where required
   - Respect layer boundaries (Truth Layer purity)
   - Include comprehensive tests
   - Update subsystem docs if patterns change
   - Add error codes to `docs/reference/error_codes.md` if new codes
   - Follow i18n and accessibility standards
5. **Run tests:**
   ```bash
   npm test -- --testPathPattern=FU-XXX
   npm run test:e2e -- --grep "FU-XXX"
   ```
6. **Spec-to-Implementation Diff Checkpoint (CRITICAL):**
   Before creating the PR, the agent MUST:
   - Compare the implemented code against the spec
   - List any ways implementation **intentionally diverged** from spec (even if small)
   - For each divergence:
     - Either update the spec to reflect the change (if divergence is intentional and correct)
     - Or mark the divergence as a bug to be fixed (if divergence is unintentional)
   - Present this diff to the user:
     - "Implementation vs Spec Diff: [list of divergences]"
     - "For each divergence, should I update the spec or fix the implementation? (spec/implementation/list)"
   - **MUST NOT** proceed to Final Review until spec and implementation are aligned (either by updating spec or fixing implementation)
7. **Create pull request:**
   - PR title: `FU-XXX: Feature Description`
   - PR body includes spec link, changes summary, test results, spec-to-implementation diff summary
   - Reference: `docs/developer/development_workflow.md` for PR format
### Step 4: Checkpoint 2 — Final Review
**Trigger:** Implementation complete, tests passing, PR created
**Agent Actions:**
1. **Present implementation summary:**
   - Files changed
   - Tests added/passing
   - Documentation updated
   - PR link
2. **STOP and prompt user:**
   - "Implementation complete. PR: [link]"
   - "Please review the implementation and PR."
   - "Approve for merge? (yes/no)"
   - "Any final changes needed? (list or 'none')"
3. **If user requests changes:**
   - Apply changes
   - Re-run tests
   - Update PR
   - Repeat Step 5 until approved
4. **If approved:**
   - Mark spec status as `Completed`
   - Move files from `in_progress/` to `completed/`:
     ```bash
     mv docs/feature_units/in_progress/FU-XXX docs/feature_units/completed/FU-XXX
     ```
   - Update manifest `status: "completed"`
   - Update `docs/specs/MVP_FEATURE_UNITS.md` (if MVP FU) with ✅ Complete status
   - Merge PR (or wait for merge, then complete)
## File Locations
### In Progress Feature Units
```
docs/feature_units/in_progress/FU-XXX/
  ├── FU-XXX_spec.md          # Feature Unit specification
  ├── manifest.yaml            # Manifest (YAML)
  └── FU-XXX_dsl.yaml         # UI DSL (if UI component, optional)
```
### Completed Feature Units
```
docs/feature_units/completed/FU-XXX/
  ├── FU-XXX_spec.md          # Feature Unit specification
  └── manifest.yaml            # Manifest (YAML)
```
### Test Files
```
tests/unit/features/FU-XXX/       # Unit tests
tests/integration/features/FU-XXX/ # Integration tests
tests/e2e/features/FU-XXX/        # E2E tests
tests/regression/features/FU-XXX/ # Regression tests
```
### Prototype Files (UI Feature Units)
```
frontend/src/prototype/components/FU-XXX_*.tsx  # Prototype components
frontend/src/prototype/fixtures/FU-XXX_*.ts     # Mock API responses
```
## Dependency Validation Algorithm
```typescript
function validateDependencies(
  featureId: string,
  manifest: Manifest
): ValidationResult {
  const dependencies = manifest.dependencies?.requires || [];
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const dep of dependencies) {
    const depId = dep.feature_id;
    // Check MVP_FEATURE_UNITS.md
    const mvpStatus = checkMVPStatus(depId);
    if (mvpStatus === "not_started") {
      errors.push(
        `Dependency FU-${depId} is not yet implemented (status: ⏳ Not Started)`
      );
      continue;
    }
    if (mvpStatus === "partial") {
      warnings.push(
        `Dependency FU-${depId} is partially complete (status: 🔨 Partial)`
      );
    }
    // Check completed feature units
    const completedSpec = findCompletedSpec(depId);
    if (completedSpec) {
      const status = completedSpec.manifest.status;
      if (status !== "completed") {
        errors.push(
          `Dependency FU-${depId} exists but status is "${status}", not "completed"`
        );
      }
    } else if (mvpStatus === null) {
      // Not in MVP and not completed
      errors.push(
        `Dependency FU-${depId} not found in MVP plan or completed features`
      );
    }
  }
  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      warnings,
    };
  }
  return {
    valid: true,
    errors: [],
    warnings,
  };
}
```
**Validation Rules:**
- ✅ **Allow:** Dependency status `completed` or `✅ Complete`
- ⚠️ **Warn but allow:** Dependency status `🔨 Partial` (requires user confirmation)
- ❌ **Reject:** Dependency status `⏳ Not Started` or missing
## Agent Instructions
### When to Load This Document
Load when:
- User requests creation of new Feature Unit
- Validating Feature Unit dependencies
- Understanding the Feature Unit creation workflow
### Required Co-Loaded Documents
- `docs/feature_units/standards/feature_unit_spec.md` — Spec template
- `docs/feature_units/standards/manifest_template.yaml` — Manifest template
- `docs/feature_units/standards/execution_instructions.md` — Implementation flow
- `docs/specs/MVP_FEATURE_UNITS.md` — For dependency checking
- `docs/developer/development_workflow.md` — For git/PR process
### Constraints Agents Must Enforce
1. **NEVER create Feature Unit without complete spec**
2. **ALWAYS validate dependencies before proceeding**
3. **REJECT creation if dependencies are not implemented**
4. **ALWAYS prompt user at Checkpoints 0, 1, 2 (combined spec + UX at Checkpoint 0 if UI changes)**
5. **ALWAYS create prototype for UI Feature Units before implementation**
6. **ALWAYS get user approval before proceeding past each checkpoint**
7. **ALWAYS include at least one observability metric or log pattern** (required to catch FU misbehaving)
8. **ALWAYS perform spec-to-implementation diff check** before Final Review (align spec or fix implementation)
9. **ALWAYS check kill switch conditions** during execution (stop and ask user if condition met)
### Forbidden Patterns
- Creating Feature Unit when dependencies are not implemented
- Implementing code before prototype approval (for UI FUs)
- Skipping dependency validation
- Proceeding past checkpoints without user approval
- Creating incomplete specs
- **Creating FUs without observability** (at least one metric/log required)
- **Proceeding to Final Review without spec-to-implementation diff check**
- **Ignoring kill switch conditions** (must stop and ask user)
## Quick Reference
### Command Sequence
1. **Create Feature Unit:** Use `Create New Feature Unit` command with `feature_id`
2. **Interactive spec + UX creation:** Answer questions at Checkpoint 0 (includes UX questions if UI changes present)
3. **Review prototype (if UI):** Approve prototype at Checkpoint 1 (UI Feature Units only)
4. **Implementation:** Autonomous (agent follows execution_instructions.md)
5. **Final review:** Approve implementation at Checkpoint 2
### Status Flow
```
Draft → In Progress → Review → Completed
```
- **Draft:** Spec created, not yet implemented
- **In Progress:** Implementation in progress
- **Review:** Implementation complete, awaiting review
- **Completed:** Merged and deployed
## Troubleshooting
### "Dependency not implemented" error
**Solution:**
- Check if dependency is truly required
- If not required, remove from `dependencies.requires` in manifest
- If required, implement dependency first
### Prototype not functional
**Solution:**
- Ensure all API calls are mocked
- Check fixture files exist and are properly formatted
- Verify prototype is integrated into `frontend/src/prototype/main.tsx`
### Tests failing after implementation
**Solution:**
- Run tests locally: `npm test -- --testPathPattern=FU-XXX`
- Check error messages and fix issues
- Ensure test fixtures match implementation
