---
name: final-review
description: Final review workflow per foundation command.
triggers:
  - final review
  - /final_review
  - final-review
---

# Final Review

Present final implementation for review and approval for Feature Unit {{input:feature_id}}.

Follow `foundation/development/feature_unit_workflow.md` Step 4 (Checkpoint 2 — Final Review). Configuration is read from `foundation-config.yaml`.

Implements Checkpoint 2 of the Feature Unit creation workflow. Presents the completed implementation for human review and approval.

## Trigger

- Implementation complete
- Tests passing
- PR created (if required by config)

## Tasks

1. **Load configuration:**
   - Read `foundation-config.yaml` to get feature unit settings
   - Determine directory structure, testing requirements, git workflow

2. **Run spec compliance validation (if available):**
   - Execute spec compliance validation script (if repository has one)
   - If compliance check fails: STOP and present compliance report to user
     - List all gaps found
     - Require user to fix gaps, update spec, or explicitly defer requirements before proceeding
     - Re-run compliance check after fixes
   - If compliance check passes or not available, continue to next step

3. **Gather implementation summary:**
   - List all files changed
   - List tests added (with pass status)
   - List documentation updated
   - PR link and status (if PR required)
   - Compliance report link (if generated)

4. **Verify completion:**
   - All required tests passing (based on config)
   - Coverage meets configured targets
   - PR created with proper format (if required)
   - Spec compliance validation passed (if available)

5. **Present summary:**
   - Files changed (count and key files)
   - Tests added/passing
   - Coverage achieved vs target
   - Documentation updated
   - PR link (if applicable)
   - Spec compliance status (if available)

6. STOP and prompt user:
   - "Implementation complete. PR: [link]" (if applicable)
   - "Please review the implementation"
   - "Approve for merge? (yes/no)"
   - "Any final changes needed? (list or 'none')"
   - "Spec compliance validation: ✅ Pass / ❌ Fail (see report: [link])" (if available)

7. **If user requests changes:**
   - Apply changes
   - Re-run tests
   - Re-run spec compliance validation (if available)
   - Update PR (if applicable)
   - Repeat until approved

8. **If approved:**
   - Mark spec status as `Completed`
   - Move files from `in_progress/` to `completed/`:
     ```bash
     mv {configured_directory}/in_progress/{{input:feature_id}} {configured_directory}/completed/{{input:feature_id}}
     ```
   - Update manifest `status: "completed"`
   - Update repository-specific FU inventory (if configured)
   - Mark PR as ready for merge (if applicable)
   - **If using worktrees (from config), clean up worktree:**
     ```bash
     # From main repo root
     git worktree remove {configured_worktree_path}
     # Or if worktree still has uncommitted changes:
     git worktree remove --force {configured_worktree_path}
     ```

## Inputs

- `feature_id` (string): The feature identifier

