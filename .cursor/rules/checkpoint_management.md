# Checkpoint Management Rule

**Reference:** `docs/feature_units/standards/release_workflow.md` — Checkpoint sections

## Purpose

Ensures checkpoints are automatically updated in `status.md` when their trigger batches complete, preventing checkpoints from remaining `pending` after completion criteria are met.

---

## Checkpoint Trigger Rules

Checkpoints are configured in `manifest.yaml` with `checkpoint_{id}_after_batch` fields:

```yaml
checkpoints:
  checkpoint_0.5_after_batch: 0.6 # Review blockchain foundation after Batch 0.6
  checkpoint_1_after_batch: 4 # Mid-release review after Batch 4
```

**Checkpoint 2 (Pre-Release Sign-Off)** is always triggered when:

- All batches are complete
- Release status is `ready_for_deployment` or `completed`

---

## Automatic Checkpoint Completion

### When a Batch Completes

**Agent MUST:**

1. **Check manifest.yaml for checkpoint triggers:**

   - Look for `checkpoint_{id}_after_batch` fields
   - If current batch ID matches any checkpoint trigger → mark checkpoint as `completed`

2. **Update status.md checkpoint section:**

   - Change checkpoint status from `pending` to `completed`
   - Add completion notes with:
     - Batch that triggered completion
     - Key FUs completed in that batch
     - Brief validation summary

3. **Checkpoint 2 completion:**
   - When all batches complete → automatically mark Checkpoint 2 as `completed`
   - Add notes: batch completion count, release status, P0 FU completion status

### Example Checkpoint Update

**Before (Batch 0.6 completes):**

```markdown
- **Checkpoint 0.5 — Blockchain Foundation Review**: `pending`
  - Configured after Batch 0.6 (blockchain-ready architecture foundation complete).
```

**After (automatic update):**

```markdown
- **Checkpoint 0.5 — Blockchain Foundation Review**: `completed`
  - Configured after Batch 0.6 (blockchain-ready architecture foundation complete).
  - Batch 0.6 completed: FU-052 (Reducer Versioning), FU-053 (Cryptographic Fields), FU-054 (Hash Chaining) all complete.
  - Blockchain-ready architecture foundation validated.
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
         fus: batch.feature_units,
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

**Agent MUST:**

1. **Check if Checkpoint 2 exists:**

   - Look for "Checkpoint 2 — Pre-Release Sign-Off" in status.md

2. **If exists and still `pending`:**
   - Mark as `completed`
   - Add completion notes:
     - Total batches completed
     - Release status
     - P0 FU completion count

---

## Integration Points

### Release Orchestrator

The `scripts/release_orchestrator.js` should:

- After each batch completes → check and update checkpoints
- After all batches complete → ensure Checkpoint 2 is completed

### Manual Batch Updates

When agents manually update `status.md` to mark a batch complete:

- **MUST** also check and update any triggered checkpoints
- **MUST** verify checkpoint status matches batch completion state

### Report Generation

Report generation (`docs/feature_units/standards/release_report_generation.md`) reads checkpoint status from `status.md`:

- If checkpoints are incorrectly `pending` → report will show incorrect metrics
- Always verify checkpoint status matches batch completion before generating reports

---

## Validation Rules

**Before marking release as `ready_for_deployment`:**

1. **Verify all checkpoints are completed:**

   - Checkpoint 0 (Planning) → should be `completed` at start
   - Checkpoint 0.5 → should be `completed` if Batch 0.6 is complete
   - Checkpoint 1 → should be `completed` if Batch 4 is complete
   - Checkpoint 2 → should be `completed` if all batches are complete

2. **If any checkpoint is incorrectly `pending`:**
   - **STOP** and update checkpoint status
   - Add completion notes
   - Then proceed with release status update

---

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

- **NEVER** mark checkpoint as `completed` before trigger batch is `completed`
- **ALWAYS** add completion notes when updating checkpoint status
- **ALWAYS** verify checkpoint status matches batch completion state
- **NEVER** skip checkpoint updates — they are required for accurate reporting

---

## Related Documents

- `docs/feature_units/standards/release_workflow.md` — Release workflow with checkpoint definitions
- `docs/releases/in_progress/{RELEASE_ID}/manifest.yaml` — Checkpoint trigger configuration
- `docs/releases/in_progress/{RELEASE_ID}/status.md` — Checkpoint status tracking
- `docs/feature_units/standards/release_report_generation.md` — Report generation (reads checkpoint status)






