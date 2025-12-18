# Feature Unit: FU-112 Storage Infrastructure

**Status:** In Progress  
**Priority:** P0 (Critical)  
**Risk Level:** Medium  
**Target Release:** v0.2.0  
**Owner:** Engineering Team  
**Reviewers:** Tech Lead  
**Created:** 2025-12-18  
**Last Updated:** 2025-12-18

---

## Overview

**Brief Description:**  
Build deterministic storage infrastructure for ingestion by persisting failed uploads into an `upload_queue` table, wiring the HTTP upload path to enqueue retries, and tracking per-user storage/interpretation usage via `storage_usage`. This lays the foundation for the async upload worker (FU-130) and strict quota enforcement (FU-136).

**User Value:**  
Users can rely on uploads completing even when object storage is briefly unavailable, and they gain transparent quota management once usage surfaces are connected. This prevents silent failures and offers predictable enforcement before monetisation tiers roll out.

**Defensible Differentiation:**  
Deterministic retry queues plus explicit quota tracking reinforce Neotoma’s privacy-first/deterministic positioning—every byte is accounted for with provenance, no background ingestion occurs without user intent, and cross-platform agents can trust consistent retry semantics.

**Technical Approach:**  
- Extend the schema (per `docs/subsystems/schema.md` + payload model) with `upload_queue` and `storage_usage`, including helper functions for cumulative counters.  
- Persist failed uploads to disk (`UPLOAD_QUEUE_DIR`) and mirror metadata in `upload_queue` so FU-130 can replay.  
- Update `upload_file` HTTP action to hash files, enqueue failures, and increment usage on success.  
- Emit metrics/logs to observe retry depth, failures, and quota hits.  
- Keep logic user-scoped (default single-user UUID today) to remain compatible with upcoming multi-user/RLS work.

---

## Requirements

### Functional Requirements
1. **Upload Queue Persistence:** Create `upload_queue` rows with deterministic `content_hash`, `temp_file_path`, `bucket`, `object_path`, `byte_size`, `user_id`, retry bookkeeping fields, and metadata needed to rebuild payload context.  
2. **HTTP Upload Integration:** `POST /upload_file` MUST enqueue a retry when Supabase Storage upload fails instead of returning a raw 500. Response must include queue ID and `storage_status: "pending_retry"`.  
3. **Storage Usage Tracking:** Create `storage_usage` table plus `increment_storage_usage(p_user_id, p_bytes)` and `increment_interpretation_count(p_user_id)` functions.  
4. **Automatic Usage Increment:** Successful upload + record creation MUST invoke `increment_storage_usage` with byte size to keep quotas authoritative. Failures log warnings without blocking ingestion.  
5. **Quota Surfaces:** Provide RPC-level enforcement hooks so FU-136 can reject requests once `total_bytes` or `interpretation_count_month` exceed configured limits.

### Non-Functional Requirements
1. **Performance:** Queue insert ≤ 10 ms (local disk write + DB insert). Usage RPC ≤ 5 ms.  
2. **Determinism:** `content_hash` uses SHA-256 of raw bytes; queue metadata derived solely from request payload.  
3. **Consistency:** Strong consistency—queue rows and usage counters written in same request transaction scope; no eventual consistency.  
4. **Reliability:** Queue directory must survive process restarts (path configurable). Files cleaned after successful retry.  
5. **Security/Privacy:** Temp files stored locally with restrictive permissions; queue metadata contains no raw PII beyond IDs/hash.

### Invariants (MUST/MUST NOT)
**MUST**
- Hash every upload and store `content_hash` + byte size before enqueue.
- Attach `user_id` to every queue/usage row (default single-user UUID until FU-701 introduces true multi-user).
- Enable RLS on new tables with service-role only policies.
- Maintain sorted retry schedule via `next_retry_at`.

**MUST NOT**
- MUST NOT delete original upload metadata after enqueue; worker depends on it.
- MUST NOT auto-retry uploads synchronously (queue + worker only).
- MUST NOT mutate `storage_usage.total_bytes` outside stored procedures/RPC.
- MUST NOT log file contents or queue temp-file paths in plaintext user-facing logs.

---

## Affected Subsystems

- **Ingestion / Storage:** `upload_file` HTTP route, payload compilation (future), Supabase Storage buckets.
- **Database Schema:** New tables/functions per `docs/subsystems/schema.md`.
- **Observability:** Metrics + logs defined in `docs/architecture/ingestion/sources-first_ingestion_v12_final.md`.
- **Quota Enforcement:** `storage_usage` feeds FU-136 strict rejection logic.

**Dependencies:**  
- FU-110 (Sources table / payload onboarding) supplies canonical payload metadata.  
- FU-135 (interpretation timeout columns) shares release batch but independent.  
- FU-130 (Upload Queue Processor) and FU-136 (Strict Quota Enforcement) depend on this FU.

**Documentation to Load:**  
- `docs/subsystems/schema.md` (schema canon)  
- `docs/subsystems/sources.md` (ingestion + quotas)  
- `docs/architecture/ingestion/sources-first_ingestion_v12_final.md` (queue/worker flow)  
- `docs/architecture/payload_model.md` (payload-first ingestion)  
- `docs/testing/testing_standard.md` (required coverage)

---

## Schema Changes

### Tables

- **`upload_queue`**  
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`  
  - `temp_file_path TEXT NOT NULL` (absolute path in `UPLOAD_QUEUE_DIR`)  
  - `bucket TEXT NOT NULL` (Supabase bucket name)  
  - `object_path TEXT NOT NULL` (intended storage key)  
  - `content_hash TEXT NOT NULL` (SHA-256)  
  - `byte_size BIGINT NOT NULL`  
  - `retry_count INTEGER NOT NULL DEFAULT 0`  
  - `max_retries INTEGER NOT NULL DEFAULT 5`  
  - `next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`  
  - `error_message TEXT`  
  - `metadata JSONB NOT NULL DEFAULT '{}'` (payload + request context until `sources` table lands)  
  - `user_id UUID NOT NULL`  
  - `payload_submission_id UUID REFERENCES payload_submissions(id) ON DELETE SET NULL` (optional future linkage)  
  - Indexes: `idx_upload_queue_next_retry` (partial) + `idx_upload_queue_user`.  
  - RLS: enable; allow service_role full access only.

- **`storage_usage`**  
  - `user_id UUID PRIMARY KEY`  
  - `total_bytes BIGINT NOT NULL DEFAULT 0`  
  - `total_sources INTEGER NOT NULL DEFAULT 0`  
  - `last_calculated TIMESTAMPTZ NOT NULL DEFAULT NOW()`  
  - `interpretation_count_month INTEGER NOT NULL DEFAULT 0`  
  - `interpretation_limit_month INTEGER NOT NULL DEFAULT 100`  
  - `billing_month TEXT NOT NULL DEFAULT to_char(NOW(), 'YYYY-MM')`  
  - Index: primary key suffices (lookup by user).  
  - RLS: enable; service_role full access (future user policies once auth lands).

### Functions
- `increment_storage_usage(p_user_id UUID, p_bytes BIGINT)`  
  - Inserts or updates row atomically (`ON CONFLICT DO UPDATE`).  
  - Increments `total_bytes`, `total_sources`, refreshes `last_calculated`.

- `increment_interpretation_count(p_user_id UUID)`  
  - Maintains rolling monthly counter keyed by `billing_month`.  
  - Resets count automatically when month changes.

---

## API / MCP Changes

- **`POST /upload_file` (Actions server)**  
  - On storage success: call `increment_storage_usage`, log `storage.upload.success_total`.  
  - On storage failure:  
    - Persist buffer to `UPLOAD_QUEUE_DIR`.  
    - Insert row into `upload_queue` with deterministic metadata + captured request context.  
    - Return `202 Accepted` payload:  
      ```json
      {
        "status": "pending_retry",
        "queue_id": "<uuid>",
        "storage_status": "pending_retry"
      }
      ```  
  - Existing success payload remains unchanged.  
  - Behavior is deterministic; queue ID surfaces for status tracking (future MCP tool).

No new MCP action is introduced, but `upload_file`’s contract is now explicit about eventual completion semantics and queue hand-offs.

---

## Observability

- **Metrics:**  
  - `storage.upload.success_total` (counter, labels: bucket)  
  - `storage.upload.failure_total` (counter, labels: bucket, reason)  
  - `storage.queue.depth` (gauge, pending rows)  
  - `storage.queue.processed_total` (counter, labels: status)  
  - `storage_usage.bytes` (gauge exported from table snapshots)  
  - `quota.interpretation.exceeded_total` (counter, emitted when FU-136 rejects)

- **Logs:**  
  - `UploadQueueEnqueue` (info) – fields: queue_id, bucket, object_path, byte_size, retry_count=0.  
  - `UploadQueueEnqueueFailed` (error) – fields: bucket, error_code, trace_id.  
  - `StorageUsageIncrementFailed` (warn) – fields: user_id, byte_size, reason.

- **Events:**  
  - `storage.upload.enqueued`  
  - `storage.upload.retry_failed` (after max retries, consumed by FU-130)  
  - `quota.storage.exceeded` (future once FU-136 enforces)

---

## Testing Strategy

**Unit Tests**
1. `enqueueFailedUpload` writes file, inserts DB row, cleans temp file on insert failure.  
2. `incrementStorageUsage` calls Supabase RPC with correct params and surfaces errors.  
3. SHA-256 hashing helper produces deterministic output (100-run property test).

**Integration Tests** (extend `docs/releases/in_progress/v0.2.0/integration_tests.md`)  
- **IT-007 Upload Queue Retry:** Force storage failure → queue row created → future worker drains row → source marked uploaded.  
- **IT-010 Interpretation Quota Enforcement:** Use `storage_usage` counters to reject reinterpretation when limit reached (once FU-136 plugs in).  
- Mock Supabase storage to simulate transient errors and confirm HTTP 202 path.

**E2E Tests**  
- Browser-driven upload (Playwright) verifying user receives “processing” state when queue engaged.  
- Bulk upload scenario verifying usage counters increase and appear in UI (future surface).  
- Negative path verifying user sees actionable messaging when queue exhausted after max retries.

Coverage expectations: >85 % lines for new services/routes, 100 % of queue logic branches, deterministic hashing property test (100 iterations).

---

## Error Scenarios

| Scenario | Error Code | Message | Recovery |
| --- | --- | --- | --- |
| Supabase Storage down | `STORAGE_PENDING_RETRY` (HTTP 202) | "Upload deferred and will retry automatically" | Worker retries; user can poll status |
| Queue insert fails | `STORAGE_QUEUE_FAILED` (HTTP 500) | "Unable to persist upload retry" | User retries upload manually |
| Usage RPC fails | `USAGE_TRACKING_FAILED` (hidden) | Logged warning only | Ops follow-up; upload succeeds |
| Quota exceeded (future) | `STORAGE_QUOTA_EXCEEDED` | "Monthly storage quota reached" | User upgrades plan or waits next month |

---

## Rollout & Deployment

- **Feature Flags:** None; behavior gates on whether storage upload succeeds. (Future: optional flag to bypass queue in dev).  
- **Deployment Order:** Apply migrations → redeploy API server (new services + route behavior).  
- **Rollback Plan:**  
  1. Revert API changes to previous commit (no queue/usage).  
  2. Leave DB tables in place (safe, additive).  
  3. Manually delete temp files in `UPLOAD_QUEUE_DIR` if rollback lasts >24h.  
- **Monitoring:** Track `storage.queue.depth` and `storage.upload.failure_total` after deploy; alert if depth grows > threshold (e.g., >100 pending for >15 min).

---

## Notes & Open Questions

- `upload_queue.source_id` in older docs maps to `payload_submission_id` once payload model fully replaces legacy records. Until FU-110 lands, queue metadata stores ingestion context in `metadata` JSON.  
- Worker implementation (FU-130) must delete temp files and update `payload_submissions`/records accordingly.  
- Quota readouts (UI + MCP) will be handled in FU-136 / FU-305 dashboards.  
- Need follow-up doc update in `docs/subsystems/sources.md` once payload terminology fully replaces `sources`.

