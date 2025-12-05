# Final Review

Present final implementation for review and approval for Feature Unit {{input:feature_id}}.

**Follow:** `docs/feature_units/standards/creating_feature_units.md` Step 4 (Checkpoint 2 — Final Review)

## Purpose

This command implements **Checkpoint 2** of the Feature Unit creation workflow. It presents the completed implementation for human review and approval.

## Trigger

- Implementation complete
- Tests passing
- PR created

## Tasks

1. **Gather implementation summary:**
   - List all files changed
   - List tests added (with pass status)
   - List documentation updated
   - PR link and status

2. **Verify completion:**
   - All tests passing: `npm test -- --testPathPattern={{input:feature_id}}`
   - All E2E tests passing: `npm run test:e2e -- --grep "{{input:feature_id}}"`
   - PR created with proper format
   - Code follows architectural invariants

3. **Present summary:**
   - Files changed (count and key files)
   - Tests added/passing
   - Documentation updated
   - PR link

4. **STOP and prompt user:**
   - "Implementation complete. PR: [link]"
   - "Please review the implementation and PR."
   - "Approve for merge? (yes/no)"
   - "Any final changes needed? (list or 'none')"

5. **If user requests changes:**
   - Apply changes
   - Re-run tests
   - Update PR
   - Repeat until approved

6. **If approved:**
   - Mark spec status as `Completed`
   - Move files from `in_progress/` to `completed/`:
     ```bash
     mv docs/feature_units/in_progress/{{input:feature_id}} docs/feature_units/completed/{{input:feature_id}}
     ```
   - Update manifest `status: "completed"`
   - Update `docs/specs/MVP_FEATURE_UNITS.md` (if MVP FU) with ✅ Complete status
   - Mark PR as ready for merge (or wait for merge)
   - **After merge, clean up worktree (if using worktrees):**
     ```bash
     # From main repo root
     git worktree remove ../neotoma-{{input:feature_id}}
     # Or if worktree still has uncommitted changes:
     git worktree remove --force ../neotoma-{{input:feature_id}}
     ```

## Inputs

- `feature_id` (string): The feature identifier

