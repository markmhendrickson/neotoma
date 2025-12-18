# Feature Unit: FU-112 Storage Infrastructure

**Status:** In Progress  
**Priority:** P0 (Critical)  
**Risk Level:** Medium (schema + quota tracking)  
**Target Release:** v0.2.0  
**Owner:** Cursor Worker Agent (FU-112)  
**Reviewers:** Tech Lead, Data Platform Lead  
**Created:** 2025-12-18  
**Last Updated:** 2025-12-18

---

## Overview

**Brief Description:**  
Add the storage infrastructure that underpins sources-first ingestion: an `upload_queue` table for async retry of failed storage writes and a `storage_usage` table plus helper functions for per-user quota accounting. This FU provides the durable persistence needed by FU-120 (Raw Storage Service) and FU-136 (Strict Quota Enforcement) without yet implementing the workers or enforcement logic.

**User Value:**  
Users gain resilient uploads (no data loss when storage briefly fails) and deterministic usage tracking that will power upcoming quota enforcement and billing. This prevents silent ingestion failures and enables transparency around storage consumption.

**Defensible Differentiation:**  
Supports Neotoma’s privacy-first, deterministic posture by guaranteeing that retries and quota calculations are auditable, user-scoped, and deterministic. The infrastructure is cross-platform (implemented directly in Supabase/Postgres) and keeps ingestion under explicit user control.

**Technical Approach:**  
Introduce schema migrations for `upload_queue` and `storage_usage`, add deterministic plpgsql helpers (`increment_storage_usage`, `increment_interpretation_count`), wire up RLS policies, and expose service-layer utilities the rest of the ingestion stack can call once FU-120/FU-136 land.

---

## Requirements

### Functional Requirements

1. **`upload_queue` Table**
   - Columns: `id UUID PK`, `source_id UUID NOT NULL`, `temp_file_path TEXT NOT NULL`, `content_hash TEXT NOT NULL`, `byte_size BIGINT NOT NULL`, `retry_count INTEGER DEFAULT 0`, `max_retries INTEGER DEFAULT 5`, `next_retry_at TIMESTAMPTZ DEFAULT NOW()`, `error_message TEXT`, `created_at TIMESTAMPTZ DEFAULT NOW()`, `user_id UUID NOT NULL`.
   - Filtered index on `(next_retry_at)` where `retry_count < max_retries`.
   - Index on `user_id` for per-user queue introspection.
   - RLS: users can only see their rows, service role has full access.

2. **`storage_usage` Table + Helpers**
   - Columns: `user_id UUID PRIMARY KEY`, `total_bytes BIGINT DEFAULT 0`, `total_sources INTEGER DEFAULT 0`, `last_calculated TIMESTAMPTZ DEFAULT NOW()`, `interpretation_count_month INTEGER DEFAULT 0`, `interpretation_limit_month INTEGER DEFAULT 100`, `billing_month TEXT DEFAULT to_char(NOW(), 'YYYY-MM')`.
   - Functions:
     - `increment_storage_usage(user_id UUID, bytes BIGINT)` — upserts and increments totals deterministically (idempotent per new source).
     - `increment_interpretation_count(user_id UUID)` — upserts monthly counter, resets automatically when billing month rolls over.
   - Future-proof by including `interpretation_limit_month` even though strict enforcement lives in FU-136.

3. **Service Utilities (TypeScript)**
   - Add `StorageQueueService.enqueueFailure(...)` and `StorageUsageService.incrementBytes(...)` wrappers that call Supabase RPCs / tables with deterministic logging.
   - These helpers are no-ops until FU-120 consumes them but provide the contract now.

4. **Integration with Existing Schema Tooling**
   - Include migrations via `supabase/migrations/<timestamp>_add_storage_infrastructure.sql`.
   - Update `supabase/schema.sql` snapshot and any schema documentation references.

5. **Documentation Updates**
   - `docs/subsystems/schema.md` and `docs/subsystems/sources.md` reference live schema (remove “deferred” wording once implemented).
   - Add FU references to release manifests.

### Non-Functional Requirements

1. **Performance:** queue polling queries (by `next_retry_at`) must use the filtered index to keep lookups <10ms for 10k rows. Storage usage increments must run inside ingestion transaction and add <5ms overhead.
2. **Determinism:** helper functions must be pure/idempotent; same sequence of source insertions → same counters. No random scheduling.
3. **Consistency:** queue mutations and storage usage increments run in the same transaction that detects upload failure or successful ingestion (strong consistency).
4. **Accessibility / Privacy:** no PII stored in `error_message`; use deterministic error codes.
5. **Internationalization:** `billing_month` stored as `YYYY-MM` string, no locale-specific formatting.

### Invariants (MUST/MUST NOT)

**MUST**
- Enforce RLS on both tables (user_id scoped).
- Gate queue dequeue logic on `retry_count < max_retries`.
- Write deterministic timestamps using `NOW()` exclusively inside DB (no application clocks).
- Keep functions SECURITY DEFINER with locked `search_path`.

**MUST NOT**
- Must not allow public read access.
- Must not increment storage usage for deduplicated uploads (FU-120 will guard via hash comparison; this FU provides API to support that).
- Must not leak file paths outside user’s namespace.

---

## Affected Subsystems

- **Schema:** New tables and functions in Postgres (migrations + schema snapshot).
- **Ingestion / Storage:** Future raw storage service consumes queue + usage helpers.
- **Observability:** Adds storage metrics placeholders (queue depth, bytes).

**Dependencies:**  
- Requires FU-110 (Sources Table Migration) for referential integrity on `source_id`. Migration must defend by creating FK only when `sources` exists.  
- Blocks FU-120 (Raw Storage Service), FU-130 (Upload Queue Processor), FU-136 (Strict Quota Enforcement).

**Documentation to Load:**  
- `docs/subsystems/schema.md`, `docs/subsystems/sources.md`, `docs/architecture/ingestion/sources-first_ingestion_v12_final.md`, `docs/foundation/agent_instructions.md`.

---

## Schema Changes

1. **Create `upload_queue` table** with filtered index + user index.
2. **Create `storage_usage` table** with PK on `user_id`.
3. **Create helper functions** `increment_storage_usage` & `increment_interpretation_count`.
4. **Add RLS policies** for both tables (`auth.uid()` matches `user_id`; service_role full access).
5. **(Conditional) Foreign Keys:** add FK from `upload_queue.source_id` → `sources.id` once FU-110 lands (use DO-block that adds constraint only if table already exists).

---

## API/MCP Changes

No new MCP actions. Existing ingestion-related actions will consume new services in FU-120/130/136. This FU only surfaces internal helpers:

```typescript
await storageQueue.enqueue({
  sourceId,
  tempFilePath,
  contentHash,
  byteSize,
  userId,
  errorMessage,
});

await storageUsage.incrementBytes({ userId, byteSize });
await storageUsage.incrementInterpretations({ userId });
```

---

## UI Changes

None in this FU. Future UI surfacing of quotas happens in FU-136/FU-702.

---

## State Machines

N/A — queue processing handled in FU-130.

---

## Observability

- **Metrics:**  
  - `storage.queue.depth` (gauge) — number of pending rows (`retry_count < max_retries`).  
  - `storage.queue.retry_total` (counter) — increments when an item is re-queued.  
  - `storage_usage.bytes` (gauge) — total bytes per user (sourced from table).
- **Logs:**  
  - `info`: `storage.queue.enqueued` (fields: user_id, source_id, retry_count).  
  - `warn`: `storage.queue.retry_saturated` (retry_count == max_retries).  
  - `info`: `storage.usage.incremented` (fields: user_id, bytes, total_bytes).
- **Events:** none new.
- **Tracing:** add span wrappers (`storage.queue.enqueue`, `storage.usage.increment`) for ingestion pipeline to adopt later.

---

## Testing Strategy

**Unit Tests**
1. `StorageUsageService` wrappers – ensures correct payload sent to Supabase RPC/table.
2. Helper for queue insertion – ensures deterministic payload plus error sanitization.

**Integration Tests**
1. Migration smoke test via `scripts/apply_migrations_direct.js` verifying tables & functions exist.
2. Postgres-level tests using `pgTap`-style assertions (or Node script) verifying RLS and helper functions increment counters idempotently.

**E2E Tests**
None (functionality will be exercised once FU-120 integrates queue + usage).

**Property Tests**
Ensure `increment_interpretation_count` resets when billing month changes.

**Fixtures**
- Add sample queue rows & storage usage snapshots under `tests/fixtures/storage/`.

**Coverage Expectations**
- 90%+ for new service helpers (`storage_queue.ts`, `storage_usage.ts`).

---

## Error Scenarios

| Scenario | Error Code | Message | Recovery |
| --- | --- | --- | --- |
| Queue row exceeds retry limit | `UPLOAD_RETRY_MAXED` | “Upload retry attempts exhausted” | Surface to worker, mark source `storage_status='failed'` |
| Supabase insert fails due to RLS | `RLS_DENIED` | “User cannot enqueue for another account” | Ensure caller passes correct `user_id` |
| Storage usage increment called with negative bytes | `INVALID_USAGE_DELTA` | “Bytes delta must be positive” | Throw before DB call |

---

## Rollout and Deployment

- **Feature Flags:** No.
- **Rollback Plan:** Drop new tables/functions via down migration if unforeseen issues occur (no data yet, greenfield).  
- **Monitoring:** Watch `storage.queue.depth` and `storage_usage.bytes` after deployment; ensure queue stays empty (<10) during initial testing.

---

## Open Questions / Follow-Ups

1. Confirm final FK strategy once FU-110 lands (either re-run migration or add additive constraint).
2. Determine plan-specific limits feeding `interpretation_limit_month` (placeholder default = 100).
3. Decide whether queue should store storage region / bucket for multi-region deployments (not required in v0.2.0).
