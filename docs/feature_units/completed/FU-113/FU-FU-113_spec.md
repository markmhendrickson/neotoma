# Feature Unit: FU-113 Entity Extensions

**Status:** Draft  
**Priority:** P0 (Critical)  
**Risk Level:** High (schema + security)  
**Target Release:** v0.2.0  
**Owner:** Worker Agent  
**Reviewers:** Engineering Lead, Product  
**Created:** 2025-12-18  
**Last Updated:** 2025-12-18

---

## Overview

**Brief Description:**  
Extend the `entities` data model so every entity is scoped to a specific user and tracks merge lineage. Adds `user_id`, `merged_to_entity_id`, and `merged_at` to `entities`, enforces RLS, and updates all entity resolution and query paths to require user context and exclude merged entities.

**User Value:**  
User-isolated entities eliminate cross-tenant leakage and unlock deterministic merge/correction flows. Users can safely deduplicate their own graph while preventing other users from viewing or mutating their entities.

**Defensible Differentiation:**  
Implements privacy-first (per-user isolation + RLS) and deterministic behavior (user-scoped entity IDs, merge redirects) that competitors tied to shared data pools cannot offer. Ensures cross-platform MCP agents always receive user-bounded truth.

**Technical Approach:**  
1. Schema migration extending `entities` table, building `(user_id, …)` indexes, and enforcing new RLS policies.  
2. Update Supabase schema snapshot plus any ORM/types to include the new columns.  
3. Refactor entity resolution (`resolveEntity`) to accept `userId`, include it in deterministic ID generation, and skip merged entities.  
4. Propagate `userId` through ingestion, observation, relationship, and MCP query flows; default to single-user UUID until upstream auth provides real values.  
5. Update graph/relationship queries to add `user_id` filters and `merged_to_entity_id IS NULL` defaults.  
6. Extend tests (unit + integration + e2e) to validate user isolation, merge behavior, and RLS enforcement.

---

## Requirements

### Functional Requirements
1. **Schema Extensions:** `entities` table gains `user_id UUID NOT NULL`, `merged_to_entity_id TEXT REFERENCES entities(id)`, `merged_at TIMESTAMPTZ`. All existing rows backfilled with the single-user UUID before dropping column defaults.  
2. **Indexes:** Create `idx_entities_user`, `idx_entities_user_type`, `idx_entities_user_type_name`, and partial `idx_entities_merged ON entities(user_id, merged_to_entity_id) WHERE merged_to_entity_id IS NOT NULL`.  
3. **RLS:** Enable user-isolated policies:  
   - `Users read own entities` → `USING (user_id = auth.uid())`.  
   - `Service role full access - entities` retains full access for MCP server.  
   - Remove legacy `public read` policy.  
4. **Entity Resolution Service:**  
   - `generateEntityId` must incorporate `userId` to avoid cross-user collisions.  
   - `resolveEntity(entityType, rawValue, userId)` filters and inserts by `user_id` and ignores entities with `merged_to_entity_id` set.  
   - New helper to surface `ENTITY_ALREADY_MERGED` errors when attempting to resolve against merged IDs.  
5. **Observation & Payload Pipelines:** `createObservationsFromRecord` and `createObservationsFromPayload` (and any callers such as `compilePayload` / `submit_payload`) pass the authenticated `userId` through to `resolveEntity` and stamp it on derived inserts (observations, raw fragments, snapshots).  
6. **Graph + Relationship Queries:** All read paths touching `entities` (graph builder, MCP `retrieve_entities`, `get_related_entities`, `get_graph_neighborhood`, relationship helpers, REST actions) must add `user_id` filters and default to `merged_to_entity_id IS NULL` unless explicitly requesting merged records.  
7. **Merge Tracking:**  
   - When merging entities, set `merged_to_entity_id`, `merged_at`, delete stale snapshots for the source, and ensure future lookups redirect to the target.  
   - Provide helper to resolve “live” entity ID (follow `merged_to_entity_id` chain) before writes.  
8. **Backfill & Data Guardrails:**  
   - Backfill existing entities with the default single-user UUID prior to enforcing NOT NULL.  
   - Provide `check` or application validation that rejects cross-user merges or queries without user context.

### Non-Functional Requirements
1. **Security:** Strict RLS on `entities`, `entity_merges`, and downstream queries. No more public read access.  
2. **Determinism:** Same `(user_id, canonical_name, entity_type)` input yields the same hash-derived entity ID; user_id inclusion prevents collisions.  
3. **Consistency:** Strong consistency—entity merge transaction updates `entities`, `observations`, `entity_snapshots`, and `entity_merges` atomically.  
4. **Performance:** Entity lookups must remain <10 ms P95. Indexes cited above are required.  
5. **Privacy/I18n:** No user PII in logs/metrics; user_id values treated as opaque identifiers.

### Invariants
**MUST:**
- Enforce `user_id` on every INSERT/UPDATE touching entities or merges.  
- Redirect any new observation targeting a merged entity to its active target.  
- Exclude merged entities from default query surfaces (MCP tools, graph APIs).  
- Keep entity IDs deterministic and stable within a user boundary.

**MUST NOT:**
- Must not allow cross-user SELECT/UPDATE access (RLS guard).  
- Must not leave entities without `user_id`.  
- Must not allow merge chains (unique `(user_id, from_entity_id)` enforcement).  
- Must not mutate `merged_to_entity_id` after set except via controlled merge reversal procedure (out of scope).

---

## Affected Subsystems

**Primary Subsystems:**
- **Schema:** Supabase schema + migrations for `entities` and related indexes.  
- **Entity Resolution Service (`src/services/entity_resolution.ts`):** user-scoped lookups and deterministic IDs.  
- **Observation Architecture:** ingestion + snapshot reducers now aware of user context.  
- **Graph Builder & Relationships:** queries, orphan detection, and MCP exposures filter by user & merged state.  
- **MCP Server (`src/server.ts` + actions):** tool handlers require user ID parameter and filter logic.

**Dependencies:**
- Depends on FU-110 (sources table) for consistent `user_id` propagation.  
- Blocks FU-116 (Entity Merges Table) and FU-126 (merge_entities MCP tool).  
- Requires docs/subsystems/schema.md, docs/subsystems/entity_merge.md, and docs/releases/in_progress/v0.2.0/release_plan.md alignment.

**Documentation to Load:**
- `docs/foundation/core_identity.md`, `docs/foundation/layered_architecture.md`, `docs/foundation/product_principles.md`.  
- `docs/subsystems/schema.md`, `docs/subsystems/entity_merge.md`, `docs/subsystems/observation_architecture.md`.  
- `docs/releases/in_progress/v0.2.0/release_plan.md`, `docs/feature_units/standards/feature_unit_spec.md`.

---

## Schema Changes

**Tables Affected:**
- `entities`:  
  ```sql
  ALTER TABLE entities
    ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    ADD COLUMN IF NOT EXISTS merged_to_entity_id TEXT REFERENCES entities(id),
    ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;

  UPDATE entities
    SET user_id = '00000000-0000-0000-0000-000000000000'
  WHERE user_id IS NULL;

  ALTER TABLE entities
    ALTER COLUMN user_id DROP DEFAULT;

  CREATE INDEX IF NOT EXISTS idx_entities_user ON entities(user_id);
  CREATE INDEX IF NOT EXISTS idx_entities_user_type ON entities(user_id, entity_type);
  CREATE INDEX IF NOT EXISTS idx_entities_user_type_name
    ON entities(user_id, entity_type, canonical_name);
  CREATE INDEX IF NOT EXISTS idx_entities_merged
    ON entities(user_id, merged_to_entity_id)
    WHERE merged_to_entity_id IS NOT NULL;
  ```

**RLS Policies:**
```sql
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read - entities" ON entities;

CREATE POLICY "Users read own entities" ON entities
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role full access - entities" ON entities
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

**Migration Required:** Yes — `supabase/migrations/<timestamp>_extend_entities_user_scope.sql` adding columns, indexes, policies, and data backfill. Update `supabase/schema.sql` snapshot accordingly.

---

## API/MCP Changes

**Modified MCP Tools / Endpoints:**
- `retrieve_entities`, `get_related_entities`, `get_graph_neighborhood`, `list_relationships`, `create_relationship`, `get_entity_snapshot`, `list_observations`, and any REST `actions.ts` endpoints must require `user_id` (from auth context or explicit parameter) and filter queries with `user_id` + `merged_to_entity_id IS NULL` by default.  
- `merge_entities` (FU-126 dependency) consumes new `merged_to_entity_id` semantics introduced here.  
- Entity search endpoints return an additional `merged_to_entity_id` field (nullable) to allow clients to detect merged rows.

**API Contract Adjustments:**
- Entity payloads now include:
  ```typescript
  interface Entity {
    id: string;
    entity_type: string;
    canonical_name: string;
    aliases: string[];
    user_id: string;
    merged_to_entity_id?: string | null;
    merged_at?: string | null;
    created_at: string;
    updated_at: string;
  }
  ```
- Errors:  
  - `ENTITY_ACCESS_DENIED` when user IDs mismatch.  
  - `ENTITY_ALREADY_MERGED` when referencing a merged source.  
  - `MERGE_TARGET_ALREADY_MERGED` when attempting to merge into a merged target.

---

## UI Changes

None. v0.2.0 is MCP/server-only; any future UI uses the updated API contracts to display merge state badges.

---

## Observability

- **Metrics:**  
  - `entity.merge_redirect_total` (counter) — increments when observations are redirected to merge targets.  
  - `entity.resolve_cache_hit_total` (counter) — user-scoped resolve hits vs misses.  
  - `entity.merged_entities_total` (gauge) — number of merged entities per user.
- **Logs:**  
  - `entity.resolve` (level `info`, fields: `user_id`, `entity_type`, `entity_id`, `source`, `merged_redirect`).  
  - `entity.merge_attempt` / `entity.merge_denied` (level `warn` for cross-user attempts).  
  - `entity.merge_success` (level `info`, fields: `user_id`, `from_entity_id`, `to_entity_id`, `observations_rewritten`).
- **Traces:**  
  - Span `entity.resolve` with attributes `user_id`, `entity_type`, `result`.  
  - Span `entity.merge` with `from_entity_id`, `to_entity_id`, `duration_ms`.

---

## Testing Strategy

**Unit Tests:**
1. `entity_resolution.test.ts`: verify deterministic IDs now include `user_id`, ensure lookups filter by user and ignore merged entities.  
2. `observation_ingestion.test.ts`: ensure observations/ snapshots inherit the provided `userId`.  
3. `graph_builder.test.ts`: tests for orphan-entity detection respect merged entities and user filters.

**Integration Tests:**
1. Supabase migration test verifying `user_id` backfill and RLS enforcement (service_role vs anon).  
2. `tests/integration/entity_merge.spec.ts`: simulate merge, ensure observations and queries redirect to target.  
3. `tests/integration/mcp_entities.spec.ts`: run `retrieve_entities` under two different user contexts; ensure isolation.

**E2E Tests:**
1. Playwright scenario “Entity Merge Flow” (IT-005) now validates merged-entity exclusion and redirect behavior.  
2. Playwright ingestion flow verifying duplicate vendor names under different users create independent entities.

**Property-Based Tests (optional):** same `(user_id, canonical_name)` input always yields same hash.

**Fixtures:** Add multi-user fixture data for entities + merges in `tests/fixtures/entities`.

**Coverage Targets:**  
- Lines ≥90% for `entity_resolution.ts`.  
- Integration coverage for merge + ingestion flows.

---

## Error Scenarios

| Scenario | Error Code | Message | Recovery |
| --- | --- | --- | --- |
| Cross-user entity lookup | `ENTITY_ACCESS_DENIED` | "Entity {id} belongs to another user" | Request entity within same user scope |
| Source already merged | `ENTITY_ALREADY_MERGED` | "Entity {id} merged to {target}" | Use target entity ID |
| Merge target merged | `MERGE_TARGET_ALREADY_MERGED` | "Cannot merge into entity {id}: already merged" | Pick an active target |
| Missing user context | `USER_CONTEXT_REQUIRED` | "user_id is required for entity operations" | Pass explicit user_id / authenticate |
| RLS violation | `RLS_VIOLATION` | Supabase error | Use service_role key or proper auth |

---

## Rollout and Deployment

- **Feature Flags:** None.  
- **Deployment Steps:**  
  1. Apply Supabase migration (`npm run migrate`).  
  2. Deploy backend with updated schema snapshot and services.  
  3. Run `npm run test` + `npm run test:integration` + `npm run test:e2e`.  
  4. Verify RLS via `scripts/check_supabase_advisors.ts`.
- **Rollback Plan:**  
  - Revert migration (drop new columns/indexes) only if no production merges executed; otherwise restore from backup.  
  - Redeploy previous server build.  
- **Monitoring:**  
  - Watch `entity.merge_*` metrics for unexpected spikes.  
  - Verify no `ENTITY_ACCESS_DENIED` errors for legitimate traffic.  
  - Validate Supabase logs for RLS policy hits.

---

## References

- `docs/releases/in_progress/v0.2.0/release_plan.md` — scope + acceptance criteria.  
- `docs/subsystems/schema.md` — canonical schema definitions.  
- `docs/subsystems/entity_merge.md` — merge semantics.  
- `docs/foundation/agent_instructions.md` — repository-wide constraints.
