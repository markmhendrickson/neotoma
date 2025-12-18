# Feature Unit: FU-110 Sources Table Migration

**Status:** Draft  
**Priority:** P0 (Critical)  
**Risk Level:** Medium  
**Target Release:** v0.2.0  
**Owner:** Worker Agent FU-110  
**Reviewers:** Storage + Database Leads  
**Created:** 2025-12-18  
**Last Updated:** 2025-12-18

---

## Overview

**Brief Description:**  
Create the foundational `sources` table that stores every raw payload with content-addressed deduplication, storage metadata, and enforced RLS boundaries. This table is the anchor for the sources-first ingestion pipeline and unlocks downstream interpretation, correction, and provenance features.

**User Value:**  
Users gain deterministic deduplication (same bytes → same hash) and provable provenance for every observation. Raw attachments are immutably stored once, which reduces storage costs and avoids repeated uploads when agents reinterpret or correct a document.

**Defensible Differentiation:**  
Implements privacy-first, deterministic, cross-platform guarantees: content hashing is deterministic, storage is per-user isolated via RLS, and all MCP agents can rely on a single canonical source location without platform lock-in.

**Technical Approach:**  
Add a new `sources` table (UUID PK, SHA-256 hash, storage metadata, user_id) plus indexes and RLS policies. Provide service-role-only mutation privileges, authenticated read filtering by `user_id`, and store migration + schema documentation. No application-layer API changes occur in this FU; downstream services (FU-120+) will consume the new table.

---

## Requirements

### Functional Requirements

1. **Table creation:** Implement `supabase` migration + schema snapshot for `sources` with fields defined in `docs/subsystems/sources.md` (hash, URL, mime type, byte size, type, metadata, user_id, timestamps).
2. **Content-addressed deduplication:** Enforce `(content_hash, user_id)` uniqueness; reject duplicates at storage layer.
3. **Storage status tracking:** Include `storage_status` with default `uploaded` and optional transitions to `pending`/`failed`.
4. **RLS + access controls:** Enable RLS, add `Users read own sources` (SELECT, `auth.uid()`) and `Service role full access - sources` (ALL, `service_role`).
5. **Operational indexes:** Add BTREE indexes on `content_hash`, `user_id`, and `created_at DESC` for dedup + query speed.
6. **Documentation + manifest:** Ship spec + manifest referencing authoritative docs (`docs/subsystems/sources.md`, `docs/foundation/core_identity.md`).

### Non-Functional Requirements

1. **Performance:** Deduplication lookups (hash + user) MUST stay <50ms per insert via proper indexing.
2. **Determinism:** Hashing uses SHA-256 and table never mutates content metadata once stored.
3. **Consistency:** Strong consistency—insert + dedup uniqueness check happen within the same transaction.
4. **Accessibility:** Not applicable (table is backend only).
5. **Internationalization:** Not applicable (metadata is stored verbatim; interpretation handles locale later).

### Invariants

**MUST**
- Use SHA-256 hashes for `content_hash`.
- Maintain `(user_id, content_hash)` uniqueness to block cross-user dedup collisions.
- Keep `storage_url` opaque; only service role writes.
- Stamp `user_id` on every row for provenance + RLS.

**MUST NOT**
- Allow client-side inserts/updates/deletes (no policies for `authenticated` writes).
- Expose storage URLs to other users or unauthenticated sessions.
- Skip RLS enforcement on the new table.

---

## Affected Subsystems

**Primary Subsystems**
- `schema`: Adds new physical table, indexes, constraints, and RLS policies.
- `sources`: Establishes the persistence layer described in `docs/subsystems/sources.md`.
- `ingestion`: Provides foundation for raw storage + interpretation services (FU-120, FU-121).

**Dependencies**
- Requires no earlier FU (first step in Phase 1).
- Blocks FU-111 (interpretation_runs references `sources`), FU-120 (raw storage service), FU-122 (ingest MCP tool), and FU-134 (query provenance chain).

**Documentation to Load**
- `docs/NEOTOMA_MANIFEST.md`
- `docs/foundation/core_identity.md`
- `docs/subsystems/sources.md`
- `docs/subsystems/schema.md`
- `docs/architecture/determinism.md`

---

## Schema Changes

**Tables**

```sql
CREATE TABLE IF NOT EXISTS sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  storage_status TEXT NOT NULL DEFAULT 'uploaded',
  mime_type TEXT NOT NULL,
  file_name TEXT,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  source_type TEXT NOT NULL,
  source_agent_id TEXT,
  source_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL,
  CONSTRAINT unique_content_per_user UNIQUE(content_hash, user_id)
);
```

**Indexes**

```sql
CREATE INDEX IF NOT EXISTS idx_sources_hash ON sources(content_hash);
CREATE INDEX IF NOT EXISTS idx_sources_user ON sources(user_id);
CREATE INDEX IF NOT EXISTS idx_sources_created ON sources(created_at DESC);
```

**RLS**

```sql
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own sources"
  ON sources FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access - sources"
  ON sources FOR ALL TO service_role USING (true) WITH CHECK (true);
```

**Migration**
- File: `supabase/migrations/20251218140000_add_sources_table.sql`
- Contents: create table, indexes, RLS, and guard clauses to avoid duplicate creation.
- Checklist: run `npm run migrate` (or Supabase SQL editor) after merging; export schema snapshot with `npm run schema:export` when downstream tooling requires.

---

## API / MCP Changes

None in this FU. MCP tools (`ingest`, `ingest_structured`, `reinterpret`) will start inserting sources in FU-120+. This FU simply supplies the persistence primitive.

---

## Observability

- **Metrics (future emission by raw storage service):**
  - `sources_insert_total{status}` – count successes vs failures.
  - `sources_deduplicated_total` – count dedup hits per user.
- **Logs:** Service role should log `content_hash`, `user_id`, `storage_status`, and dedup decisions with trace IDs.
- **Events:** `source.created`, `source.deduplicated` emitted once ingestion service is wired up (not part of this FU).

---

## Testing Strategy

**Unit / Snapshot Tests**
- `tests/schema/sources_schema.test.ts`: parse `supabase/schema.sql` to assert table definition, constraints, indexes, and RLS policies exist.

**Integration Tests (Future)**
- When FU-120 lands, add Supabase integration tests ensuring dedup + RLS enforcement via service role + authenticated sessions.

**Manual Verification**
- Run `npm run migrate -- --dry-run` locally or execute SQL in Supabase dashboard to confirm schema diff.
- Query `pg_indexes` / `pg_policies` to verify indexes + policies after deployment.

Coverage expectation: schema snapshot test must cover presence of table + policies; future service-layer tests will expand coverage of dedup + provenance flows.

---

## Error Scenarios

| Scenario | Error Code | Message | Recovery |
| --- | --- | --- | --- |
| Duplicate content hash for user | `SOURCE_ALREADY_EXISTS` (thrown by ingestion service) | "Content already stored for this user" | Return dedup indicator + existing source_id |
| Storage upload fails | `SOURCE_STORAGE_FAILED` | "Unable to upload to storage" | Set `storage_status = 'failed'`, retry or alert |
| Unauthorized read | `RLS_VIOLATION` | Supabase RLS rejection | Ensure `auth.uid()` matches `user_id`, route through MCP |

---

## Rollout and Deployment

- **Feature Flags:** None.
- **Deployment Steps:** Merge migration + schema snapshot → run `npm run migrate` (or Supabase SQL editor) → redeploy services that rely on Supabase schema.
- **Rollback Plan:** Drop `sources` table (and dependent FK references) if unreleased; otherwise mark feature disabled and prevent new inserts while investigating.
- **Monitoring:** After migration, confirm zero errors from ingestion path; watch Supabase logs for unique-constraint violations or RLS errors.

---

## References

- `docs/subsystems/sources.md`
- `docs/subsystems/schema.md`
- `docs/releases/in_progress/v0.2.0/release_plan.md`
- `docs/NEOTOMA_MANIFEST.md`
