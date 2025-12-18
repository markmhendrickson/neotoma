# Release v0.3.0 — Execution Schedule

**Release**: Operational Hardening  
**Status**: `planning`  
**Last Updated**: 2024-12-19

---

## Execution Order

### Batch 0: Schema + Storage Foundation

**FU-112: Storage Infrastructure**

- **Dependencies**: None
- **Estimated Time**: 6–8h (migrations, RLS, basic quotas)
- **Status**: ⏳ Not Started

**FU-135: Interpretation Timeout Columns**

- **Dependencies**: None
- **Estimated Time**: 2–3h (columns, migrations, wiring into services)
- **Status**: ⏳ Not Started

**Steps (Batch 0):**

1. Design and implement `upload_queue` and `storage_usage` tables (FU-112).
2. Add RLS and basic per-user tracking to `storage_usage` (FU-112).
3. Add `timeout_at` and `heartbeat_at` columns to `interpretation_runs` (FU-135).
4. Update interpretation services to maintain heartbeat/timeout state (FU-135).
5. Write unit tests and basic integration tests for schema changes.

### Batch 1: Workers + Strict Quota Enforcement

**FU-130: Upload Queue Processor**

- **Dependencies**: FU-112
- **Estimated Time**: 4–6h
- **Status**: ⏳ Not Started

**FU-131: Stale Interpretation Cleanup**

- **Dependencies**: None
- **Estimated Time**: 3–4h
- **Status**: ⏳ Not Started

**FU-136: Strict Quota Enforcement**

- **Dependencies**: FU-112
- **Estimated Time**: 4–6h
- **Status**: ⏳ Not Started

**Steps (Batch 1):**

1. Implement Upload Queue Processor worker (Supabase Edge Function + cron) to:
   - Dequeue failed uploads from `upload_queue`.
   - Retry with exponential backoff and max retry count (FU-130).
2. Implement Stale Interpretation Cleanup worker to:
   - Scan `interpretation_runs` using `timeout_at` and `heartbeat_at`.
   - Mark timed-out runs as failed and increment appropriate metrics (FU-131).
3. Implement strict quota enforcement logic using `storage_usage`:
   - Enforce per-plan storage and interpretation quotas.
   - Reject operations that exceed quota with clear error messages (FU-136).
4. Add integration tests for async retry, timeout cleanup, and quota enforcement.
5. Wire metrics for queue depth, timeouts, and quota rejections.

---

## Timeline Estimate

**Assumption:** All development timeline estimates assume Cursor agent execution (not human developers). Human review time is separate and noted below.

- **Batch 0**: 8–11h (schema + timeout columns + tests)
- **Batch 1**: 11–16h (workers + quotas + integration tests)
- **Total Estimated Time**: 19–27h (agent execution)
- **Human Review Time**: 3–4h (migrations review, worker behavior, test plans)

---

## Parallelization

- **Batch 0:** `FU-112` and `FU-135` can run in parallel (no dependencies).
- **Batch 1:** `FU-130` and `FU-136` depend on `FU-112`; `FU-131` can start once Batch 0 is complete.

---

## Critical Path

- `FU-112` (Storage Infrastructure) is critical for `FU-130` and `FU-136`.
- The overall critical path is:
  - `FU-112` → `FU-130` / `FU-136` plus independent completion of `FU-135` and `FU-131`.

---

## Dependencies

- `FU-130` depends on `FU-112`.
- `FU-136` depends on `FU-112`.
- `FU-131` and `FU-135` have no FU-level dependencies but rely on v0.2.0 core ingestion schema.

---

## Notes

- This release MUST start only after v0.2.0 is validated with real usage.
- All workers should be implemented as Supabase Edge Functions with cron triggers.
- Integration tests for this release should focus on:
  - Upload retry behavior under transient failure.
  - Correct handling of stale interpretations.
  - Quota enforcement and error surfaces to agents.
