# Release v0.3.0 — Integration Tests

**Release**: Operational Hardening  
**Status**: `planning`  
**Last Updated**: 2024-12-19

---

## 1. Purpose

Define the **integration test suite** for Release `v0.3.0` (Operational Hardening). These tests:

- Validate async upload retry behavior via the Upload Queue Processor.
- Verify stale interpretation cleanup behavior using timeout/heartbeat columns.
- Validate strict quota enforcement using `storage_usage` (storage + interpretation quotas).
- Verify that operational metrics (queue depth, timeouts, quota rejections) can be observed.
- Are required to pass before release approval.

---

## 2. Test Matrix

| ID     | Name                               | FUs Involved              | Acceptance Criteria Covered                  |
| ------ | ---------------------------------- | ------------------------- | -------------------------------------------- |
| IT-001 | Upload Queue Retry Flow            | FU-112, FU-130            | Async retry, queue behavior                  |
| IT-002 | Stale Interpretation Cleanup Flow  | FU-135, FU-131            | Timeout handling, cleanup correctness        |
| IT-003 | Storage Usage Tracking & Quotas    | FU-112, FU-136            | Quota tracking, rejection behavior           |
| IT-004 | Combined Operational Metrics Check | FU-112, FU-130, FU-131    | Monitoring of queue depth, timeouts, quotas  |

---

## 3. Test Definitions

### IT-001: Upload Queue Retry Flow

**Purpose**: Validate that failed uploads are retried asynchronously using `upload_queue` and the Upload Queue Processor.

**Preconditions:**

- `upload_queue` table created and wired into ingestion path (FU-112).
- Upload Queue Processor worker deployed and scheduled via cron (FU-130).
- Supabase instance running with logs accessible.

**Steps:**

1. Simulate a storage failure during ingestion (e.g., mock Supabase Storage error) so that an entry is written to `upload_queue`.
2. Verify that the initial ingestion request returns an appropriate error but records the queued upload.
3. Wait for the Upload Queue Processor cron to run (or trigger manually in test).
4. Verify that the worker:
   - Picks up the queued item.
   - Attempts upload and marks it as succeeded.
   - Increments retry counters appropriately.
5. Simulate repeated failures to reach max retry count.
6. Verify that the item is marked as permanently failed after max retries.

**Expected Results:**

- Queued uploads are retried without manual intervention.
- Successful retries result in stored files and cleared queue entries.
- Items exceeding max retries are marked failed and no longer retried.

**Acceptance Criteria:**

- ✅ Uploads are retried up to configured max retries.
- ✅ Successful retries result in persisted content.
- ✅ Permanently failed items are clearly marked and not retried.

---

### IT-002: Stale Interpretation Cleanup Flow

**Purpose**: Validate that stale `interpretation_runs` are detected and cleaned up using `timeout_at` and `heartbeat_at`.

**Preconditions:**

- `interpretation_runs` table extended with `timeout_at` and `heartbeat_at` (FU-135).
- Stale Interpretation Cleanup worker deployed and scheduled (FU-131).
- Test harness can insert synthetic `interpretation_runs`.

**Steps:**

1. Insert one `interpretation_run` with:
   - `timeout_at` in the past.
   - `heartbeat_at` far in the past (no recent heartbeat).
2. Insert another `interpretation_run` with:
   - `timeout_at` in the future.
   - Recent `heartbeat_at`.
3. Trigger the Stale Interpretation Cleanup worker.
4. Verify that:
   - The stale run is marked as failed (status/state updated).
   - The non-stale run is left untouched.
5. Verify any associated metrics (e.g., `interpretation.timeout_total`) are incremented.

**Expected Results:**

- Only stale runs (past timeout, no recent heartbeat) are cleaned up.
- Non-stale runs remain active.

**Acceptance Criteria:**

- ✅ Stale runs are correctly identified and marked failed.
- ✅ Healthy runs are not modified.
- ✅ Timeout metrics are updated.

---

### IT-003: Storage Usage Tracking & Quotas

**Purpose**: Validate that `storage_usage` tracks per-user storage/interpretation usage and that strict quotas are enforced.

**Preconditions:**

- `storage_usage` table created with per-user counters (FU-112).
- Strict quota enforcement logic implemented (FU-136).
- Test configuration with low quota thresholds for storage and interpretations.

**Steps:**

1. Configure a small storage quota (e.g., 1 MB) and a small interpretation quota for a test user.
2. Ingest data for the test user until just below the quota.
3. Verify that additional ingestion is allowed and `storage_usage` reflects updated counts.
4. Attempt another ingestion that would exceed the quota.
5. Verify that:
   - The operation is rejected with a clear, machine-readable error (e.g., `QUOTA_EXCEEDED`).
   - `storage_usage` does not exceed the configured limit.
6. Repeat for interpretation quota (number of interpretation runs or tokens).

**Expected Results:**

- Quotas are enforced consistently at the ingestion boundary.
- Users receive clear error messages and cannot exceed configured limits.

**Acceptance Criteria:**

- ✅ `storage_usage` updated accurately for each ingestion/interpretation.
- ✅ Operations that would exceed quotas are rejected.
- ✅ Error responses clearly indicate quota issues.

---

### IT-004: Combined Operational Metrics Check

**Purpose**: Validate that key operational metrics for this release are emitted and observable (queue depth, timeouts, quota rejections).

**Preconditions:**

- Metrics instrumentation for:
  - Queue depth and retry counts (FU-130).
  - Interpretation timeouts (FU-131/FU-135).
  - Quota rejections (FU-136).
- Metrics backend configured (or test harness can capture logs/metrics).

**Steps:**

1. Reuse IT-001, IT-002, and IT-003 flows, ensuring that:
   - At least one upload is queued and retried.
   - At least one interpretation run times out.
   - At least one ingestion is rejected due to quota.
2. Query the metrics system or logs to verify:
   - Queue depth metrics reflect enqueued and drained items.
   - Timeout metrics incremented for stale runs.
   - Quota rejection metrics incremented for failed requests.

**Expected Results:**

- All key operational events are captured via metrics.

**Acceptance Criteria:**

- ✅ Queue depth/retry metrics populated and non-zero.
- ✅ Timeout metrics updated for stale interpretations.
- ✅ Quota rejection metrics updated.

---

## 4. Test Data Requirements

### 4.1 Required Database State

- `upload_queue` and `storage_usage` tables created per v0.3.0 migrations.
- `interpretation_runs` table extended with `timeout_at` and `heartbeat_at`.

### 4.2 Synthetic Workloads

- Sample uploads that can be forced to fail storage to populate `upload_queue`.
- Sample interpretation runs in various states:
  - Healthy (future `timeout_at`, recent `heartbeat_at`).
  - Stale (past `timeout_at`, old `heartbeat_at`).
- Users with different quota thresholds (free vs pro) for testing enforcement.

---

## 5. Test Environment

### 5.1 Required Components

- **Node.js**: v18+ with npm.
- **Supabase**: Instance with v0.2.0 + v0.3.0 migrations applied.
- **Workers**: Upload Queue Processor and Stale Interpretation Cleanup deployed as Supabase Edge Functions.
- **Metrics Backend**: Logging/metrics sink for operational metrics.

### 5.2 Environment Variables

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` for direct DB and Edge Function tests.
- Any metric sink configuration variables (if applicable).

### 5.3 Test Execution

- Integration tests can be run via `npm test` or a dedicated `npm run test:integration:v0.3.0` command (to be defined).
- Tests should:
  - Seed initial database state.
  - Trigger workers.
  - Assert on DB state and metrics.

---

## 6. Notes

- Tests must run after v0.2.0 ingestion schemas are in place.
- Focus is on **operational behavior**, not user-facing UI.
- These tests should be part of the automatic release pipeline for v0.3.0 and future operational hardening work.
