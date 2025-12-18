# Feature Unit: FU-110 Sources Table Migration

**Status:** In Progress  
**Priority:** P0 (Critical)  
**Risk Level:** Medium (schema change + RLS)  
**Target Release:** v0.2.0  
**Owner:** worker_fu110_agent  
**Reviewers:** Mark Hendrickson  
**Created:** 2025-12-18  
**Last Updated:** 2025-12-18  

---

## Overview

**Brief Description:**  
Create the `sources` table that anchors the sources-first ingestion architecture described in `docs/subsystems/sources.md` and `docs/releases/in_progress/v0.2.0/release_plan.md`. The table must store raw content metadata, enforce per-user deduplication via SHA-256 content hashes, and lock down access with RLS so only the owning user (or privileged service role) can read raw provenance.

**User Value:**  
Raw files become first-class, content-addressed objects. Users and agents can trust that re-uploads skip redundant storage while maintaining provable provenance for every observation created downstream. This is the prerequisite for reinterpret, correct, and merge flows.

**Defensible Differentiation:**  
Implements privacy-first, deterministic storage (core differentiators in `docs/foundation/core_identity.md`). Content hashes + per-user uniqueness prove integrity without centralized vendor access, and RLS enforces strict user isolation.

**Technical Approach:**  
- Add the `sources` table with the exact schema defined in `docs/subsystems/schema.md#211-sources-table`.  
- Create supporting indexes, uniqueness constraints, and storage path guidance (`sources/{user_id}/{content_hash}`).  
- Enable RLS with “Users read own sources” and “Service role full access” policies only.  
- Update Supabase schema snapshot and add a dedicated migration SQL file.  
- Document expectations for SHA-256 hashing + dedup in downstream services (FU-120 Raw Storage Service will call into this table).  

---

## Requirements

### Functional Requirements

1. **Schema Creation**  
   - Columns: `id`, `content_hash`, `storage_url`, `storage_status`, `mime_type`, `file_name`, `byte_size`, `source_type`, `source_agent_id`, `source_metadata`, `created_at`, `user_id`.  
   - Defaults: `storage_status='uploaded'`, `source_metadata='{}'::jsonb`, `created_at=NOW()`.  
   - Constraint: `CONSTRAINT unique_content_per_user UNIQUE (content_hash, user_id)`.

2. **Index Coverage**  
   - `idx_sources_hash ON content_hash`.  
   - `idx_sources_user ON user_id`.  
   - `idx_sources_created ON created_at DESC`.  
   - Optional partial index on `storage_status` is deferred to FU-112 (storage infra).

3. **RLS Policies**  
   - `ENABLE ROW LEVEL SECURITY`.  
   - Policy: `"Users read own sources"` for `SELECT USING (user_id = auth.uid())`.  
   - Policy: `"Service role full access - sources"` for `FOR ALL TO service_role`.

4. **Storage Status Contract**  
   - Acceptable values: `uploaded`, `pending`, `failed`.  
   - Application code MUST set `pending` if Supabase upload is still in flight.  
   - `raw_storage_service` (FU-120) transitions `pending -> uploaded` or `failed`.

5. **Storage Path Convention**  
   - Every stored object MUST be written to `sources/{user_id}/{content_hash}`.  
   - `storage_url` must capture the full Supabase Storage URL (not a signed URL).

6. **Deduplication Behavior**  
   - Same `content_hash` + same `user_id` MUST upsert/detect duplicates without writing new blobs.  
   - Different users MAY store identical content (constraint stays per user).  
   - FU-120 will rely on constraint violations to detect duplicates.

7. **Documentation + Schema Snapshot**  
   - Update `supabase/schema.sql` so generated artifacts reflect the new table.  
   - Reference this FU in release docs if additional operational notes emerge.

### Non-Functional Requirements

1. **Performance**  
   - Dedup lookup (`content_hash`, `user_id`) must stay <50ms (index-backed).  
   - Insert + RLS check <100ms for P95.

2. **Determinism**  
   - Hashing algorithm MUST be SHA-256 (`docs/subsystems/sources.md`).  
   - No randomness in IDs or ordering; rely on `gen_random_uuid()` for `id` only.

3. **Consistency**  
   - Strong consistency: writes succeed only when both table insert and storage upload succeed (FU-120 enforces transactional flow).  
   - No eventual consistency allowed for dedup metadata.

4. **Security / Privacy**  
   - No public policies.  
   - `storage_url` MUST never be returned directly to clients outside MCP service-role flows.

### Invariants (MUST / MUST NOT)

**MUST**
- Use SHA-256 for `content_hash`.
- Enforce `(content_hash, user_id)` uniqueness.  
- Enable and enforce RLS before shipping.  
- Store `source_metadata` as JSONB with deterministic keys (sorted keys handled by JSONB automatically).  
- Keep all storage operations deterministic and auditable (log `user_id`, `content_hash` downstream).

**MUST NOT**
- Expose `storage_url` to unauthenticated clients.  
- Allow cross-user reads or writes via RLS gaps.  
- Use best-effort hashing or truncated hashes.  
- Automatically ingest content without explicit user/agent action (explicit over implicit per `docs/foundation/product_principles.md`).

---

## Affected Subsystems

- **Schema (`docs/subsystems/schema.md`)** – adds `sources` section + indexes/policies in actual schema snapshot.  
- **Sources subsystem (`docs/subsystems/sources.md`)** – implementation of its base table.  
- **Storage infrastructure (Supabase Storage bucket `sources`)** – bucket must exist and follow path convention.  

**Dependencies:** none (greenfield table).  
**Blocks:** FU-111 (interpretation runs), FU-120 (raw storage service), FU-121+ (interpretation service), FU-122 (ingest tool), FU-134 (provenance queries).

---

## Schema Changes

| Table | Change | Notes |
| ----- | ------ | ----- |
| `sources` | New table | Columns + constraint per requirements |
| `sources` | Index | `idx_sources_hash` |
| `sources` | Index | `idx_sources_user` |
| `sources` | Index | `idx_sources_created` |
| `sources` | RLS | Enable + two policies |

```sql
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  storage_status TEXT NOT NULL DEFAULT 'uploaded',
  mime_type TEXT NOT NULL,
  file_name TEXT,
  byte_size INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_agent_id TEXT,
  source_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL,
  CONSTRAINT unique_content_per_user UNIQUE(content_hash, user_id)
);
```

---

## API / MCP Changes

None in this FU. MCP tools will start reading from `sources` once FU-120/FU-122 land.

---

## UI Changes

None.

---

## State Machines

Not applicable (simple table migration; storage status transitions documented for FU-120).

---

## Observability

Foundational metrics will be implemented in FU-120 (raw storage service). For this FU simply document expectations: raw storage service must emit `raw_storage.upload_total`, `raw_storage.dedupe_total`, and log dedup decisions (future work).

---

## Testing Strategy

**Unit Tests (planned in FU-120 but validated here via SQL assertions):**
1. `sources_unique_constraint.test.sql` – insert duplicate (same user/hash) → expect constraint violation.
2. `sources_cross_user.test.sql` – same hash different user → allowed.

**Integration Tests (Vitest, using service-role Supabase client mock or local DB):**
1. `tests/integration/release/v0.2.0/it_sources_table.test.ts`
   - Creates source row via service role, verifies indexes exist via `information_schema`.
   - Attempts `select` as authenticated user B → expect RLS failure (`PGRST302`).  
   - Attempts `select` as owning user A → succeeds.

**E2E Tests:** None required for this migration (downstream ingestion flows covered by FU-120/122). Documented in release test matrix as dependency for IT-001 and IT-002.

**Fixtures:** N/A (simple SQL inserts).

**Coverage Expectations:** 100% of new SQL constraint paths covered by integration test (duplicate insert + cross-user RLS).

---

## Error Scenarios

| Scenario | Error Code | Message | Recovery |
| -------- | ---------- | ------- | -------- |
| Duplicate content for user | `SOURCE_DUPLICATE` | "content_hash already exists for user" | Surface dedup result to caller; reuse existing `source_id`. |
| Storage upload pending | `SOURCE_STORAGE_PENDING` | "storage_url unavailable until upload completes" | Retry after upload success; handled by FU-120. |
| RLS violation | `RLS_VIOLATION` | "not authorized to access source" | Ensure caller acts via service role or owns user_id. |

---

## Rollout & Deployment

- **Feature Flags:** None (schema migration only).  
- **Rollback Plan:** Drop `sources` indexes/policies/table via reverse migration if needed (no user data yet).  
- **Monitoring:** Manual verification via Supabase dashboard + upcoming raw storage metrics.  

---

## Links & References

- `docs/subsystems/sources.md`  
- `docs/subsystems/schema.md#211-sources-table`  
- `docs/releases/in_progress/v0.2.0/release_plan.md` (Phase 1 requirements)  
- `docs/foundation/product_principles.md` (Explicit over Implicit, Determinism over Heuristics)  

