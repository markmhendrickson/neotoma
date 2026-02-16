---
description: "Ensures checkpoints are automatically updated in status.md when their trigger batches complete"
globs: ["**/*"]
alwaysApply: true
---

<!-- Source: foundation/agent_instructions/cursor_rules/checkpoint_management.mdc -->

# Checkpoint Management Rule

**Reference:** `foundation/development/release_workflow.md` — Checkpoint sections

Configuration is read from `foundation-config.yaml`.

Ensures checkpoints are automatically updated in `status.md` when their trigger batches complete, preventing checkpoints from remaining `pending` after completion criteria are met.

## Checkpoint Trigger Rules

Checkpoints are configured in `manifest.yaml` with `checkpoint_{id}_after_batch` fields:

```yaml
checkpoints:
  checkpoint_0.5_after_batch: 0.6 # Review milestone after Batch 0.6
  checkpoint_1_after_batch: 4 # Mid-release review after Batch 4
```

**Checkpoint 2 (Pre-Release Sign-Off)** is always triggered when all batches are complete and release status is `ready_for_deployment` or `completed`.

## Automatic Checkpoint Completion

### When a Batch Completes

1. **Check manifest.yaml for checkpoint triggers:**

   - Look for `checkpoint_{id}_after_batch` fields
   - If current batch ID matches any checkpoint trigger → mark checkpoint as `completed`

2. **Update status.md checkpoint section:**

   - Change checkpoint status from `pending` to `completed`
   - Add completion notes with:
     - Batch that triggered completion
     - Key items completed in that batch (FUs or tasks)
     - Brief validation summary

3. **Checkpoint 2 completion:**
   - When all batches complete → automatically mark Checkpoint 2 as `completed`
   - Add notes: batch completion count, release status, critical item completion status

### Example Checkpoint Update

**Before (Batch 0.6 completes):**

```markdown
- **Checkpoint 0.5 — Foundation Review**: `pending`
  - Configured after Batch 0.6 (foundation architecture complete).
```

**After (automatic update):**

```markdown
- **Checkpoint 0.5 — Foundation Review**: `completed`
  - Configured after Batch 0.6 (foundation architecture complete).
  - Batch 0.6 completed: [Key items] all complete.
  - Foundation architecture validated.
```

---

## Agent Actions

### During Batch Execution

**After marking a batch as `completed` in status.md:**

1. **Check for checkpoint triggers:**

   ```javascript
   // Pseudo-code logic
   const completedBatchId = batch.batch_id;
   const checkpointTriggers = manifest.checkpoints;

   for (const [checkpointKey, triggerBatch] of Object.entries(
     checkpointTriggers
   )) {
     if (triggerBatch === completedBatchId) {
       // Mark checkpoint as completed
       updateCheckpointStatus(checkpointKey, "completed", {
         batch: completedBatchId,
         items: batch.items,
         timestamp: new Date().toISOString(),
       });
     }
   }
   ```

2. **Update status.md:**
   - Find checkpoint section
   - Change status from `pending` to `completed`
   - Add completion notes

### After All Batches Complete

1. **Check if Checkpoint 2 exists:**

   - Look for "Checkpoint 2 — Pre-Release Sign-Off" in status.md (or similar final checkpoint name)

2. **If exists and still `pending`:**
   - Mark as `completed`
   - Add completion notes:
     - Total batches completed
     - Release status
     - Critical item completion count

---

## Integration Points

### Release Orchestrator

The release orchestrator script should:

- After each batch completes → check and update checkpoints
- After all batches complete → ensure Checkpoint 2 is completed

### Manual Batch Updates

When manually updating `status.md` to mark a batch complete:
- Also check and update any triggered checkpoints
- Verify checkpoint status matches batch completion state

### Report Generation

Report generation reads checkpoint status from `status.md`:

- If checkpoints are incorrectly `pending` → report will show incorrect metrics
- Always verify checkpoint status matches batch completion before generating reports

---

## Validation Rules

**Before marking release as `ready_for_deployment`:**

1. **Verify all checkpoints are completed:**

   - Checkpoint 0 (Planning) → should be `completed` at start
   - Checkpoint 0.5 → should be `completed` if trigger batch is complete
   - Checkpoint 1 → should be `completed` if trigger batch is complete
   - Checkpoint 2 → should be `completed` if all batches are complete

2. **If any checkpoint is incorrectly `pending`:**
   - STOP and update checkpoint status
   - Add completion notes
   - Then proceed with release status update

## Error Prevention

**Common Issues:**

1. **Checkpoint remains `pending` after batch completes:**

   - **Cause:** Manual batch update without checkpoint check
   - **Prevention:** Always check checkpoint triggers when updating batch status

2. **Checkpoint marked `completed` before batch completes:**

   - **Cause:** Premature checkpoint update
   - **Prevention:** Only update checkpoint when batch status is `completed`

3. **Checkpoint 2 not completed:**
   - **Cause:** Overlooked when all batches complete
   - **Prevention:** Explicit check after all batches complete

---

## Constraints

- Do NOT mark checkpoint as `completed` before trigger batch is `completed`
- Always add completion notes when updating checkpoint status
- Always verify checkpoint status matches batch completion state
- Do NOT skip checkpoint updates - they are required for accurate reporting

## Configuration

Checkpoint management uses paths from `foundation-config.yaml`:

```yaml
orchestration:
  release:
    enabled: true
    directory: "docs/releases/"  # Or configured path
    status_file: "status.md"
    manifest_file: "manifest.yaml"
```
