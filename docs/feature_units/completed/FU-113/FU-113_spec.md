# Feature Unit: FU-113 Entity Extensions

**Status:** Draft  
**Priority:** P0 (Critical)  
**Risk Level:** High (schema + security)  
**Target Release:** v0.2.0  
**Owner:** Engineering Team  
**Reviewers:** Tech Lead, Data Architect  
**Created:** 2025-12-18  
**Last Updated:** 2025-12-18

---

## Overview

**Brief Description:**  
Extend the `entities` table with user isolation (`user_id`) and merge-tracking metadata (`merged_to_entity_id`, `merged_at`), enforce row-level security, and update ingestion + MCP services so every entity read/write is user-scoped and merge-aware. This unlocks Phase 1 of v0.2.0 (Core Schema + RLS) and is a hard prerequisite for the Entity Merges table (FU-116) and the `merge_entities()` MCP tool (FU-126).

**User Value:**  
Guarantees that user-uploaded data never leaks across accounts, keeps entity merges auditable, and ensures timeline/snapshot queries only include active (non-merged) entities. Without this, duplicate-resolution tooling cannot be trusted and MCP agents would be able to read other users’ graph data.

**Defensible Differentiation:**  
Reinforces Neotoma’s privacy-first + deterministic positioning: every entity now carries explicit ownership metadata, queries are deterministic per user, and merges produce traceable audit state. This is a structural capability that conversational memory competitors lack.

**Technical Approach:**  
- Add the new columns and indexes to `entities`, backfill existing rows, and update Supabase schema + migration scripts.  
- Replace public-read policies with user-scoped RLS for `entities` (and other tables that depend on entity ownership).  
- Pass `user_id` through the entity-resolution, ingestion, and MCP layers; default to the single-user ID for v0.1.0 compatibility.  
- Teach services to exclude merged entities by default and surface merge metadata when explicitly requested.  
- Add regression tests (unit + integration) to verify user-scoped entity resolution, merge metadata persistence, and RLS enforcement.

---

## Requirements

### Functional Requirements

1. **Schema Extension:**  
   - `entities.user_id UUID NOT NULL` (backfill existing rows with the single-user ID `00000000-0000-0000-0000-000000000000`).  
   - `entities.merged_to_entity_id TEXT REFERENCES entities(id)` and `entities.merged_at TIMESTAMPTZ`.  
   - Indexes:  
     - `idx_entities_user (user_id)`  
     - `idx_entities_user_type (user_id, entity_type)`  
     - `idx_entities_user_type_name (user_id, entity_type, canonical_name)`  
     - `idx_entities_merged (user_id, merged_to_entity_id) WHERE merged_to_entity_id IS NOT NULL`

2. **RLS & Policies:**  
   - Remove legacy `public read` policies on `entities` and add:  
     - `Users read own entities` (`SELECT` restricted to `auth.uid()`).  
     - `Service role full access` (unchanged).  
   - Mirror the policy change for `entity_snapshots`, ensuring snapshots inherit `user_id` from upstream observations.

3. **User-Scoped Entity Resolution:**  
   - `resolveEntity()` must accept `userId` and only return matches for that user.  
   - Inserts MUST stamp `user_id`.  
   - When a merged entity is requested, it MUST return the merged metadata so callers can redirect/deny.

4. **Graph & MCP Integration:**  
   - All MCP actions that list/search entities must filter by `user_id` and exclude merged entities by default.  
   - Observation ingestion, graph builder edges, and relationship queries must propagate the same user scope.

5. **Merge Semantics:**  
   - Queries that create new observations MUST check `merged_to_entity_id` and redirect to the target entity.  
   - Merge metadata MUST remain immutable once set (only FU-116/FU-126 will update them).

6. **Backfill & Data Hygiene:**  
   - Existing entities with `NULL` `user_id` must be stamped with the default single-user UUID during migration.  
   - Existing snapshots referencing those entities must retain consistent `user_id`.

### Non-Functional Requirements

1. **Performance:**  
   - Entity lookups scoped by `user_id` must continue to resolve within <10 ms (P95) for the default dataset.  
   - The merged-entity index must keep merge lookups <5 ms even with 10k merged rows.

2. **Determinism:**  
   - Same `(user_id, entity_type, canonical_name)` → same entity ID and merge metadata every time.  
   - Redirect logic MUST be deterministic (no random fallbacks).

3. **Consistency:**  
   - Strong consistency for entity reads/writes (service role writes only).  
   - Merge metadata updates happen in a single transaction (enforced in FU-116 but prepped here).

4. **Accessibility & i18n:**  
   - N/A (no UI). All API surfaces continue to return JSON with ISO timestamps.

### Invariants (MUST/MUST NOT)

**MUST:**  
- Enforce `user_id` on every entity row and Supabase query.  
- Exclude merged entities in default list/search endpoints.  
- Keep merge metadata immutable except via dedicated merge workflow.  
- Maintain referential integrity: `entity_snapshots.user_id` must match `entities.user_id`.

**MUST NOT:**  
- Expose cross-user data via MCP or integrations.  
- Allow entity creation without `user_id`.  
- Remove historical merged entities (audit trail must persist).  
- Re-enable public-read RLS policies.

---

## Affected Subsystems

- **Schema / Database:** `entities`, `entity_snapshots`, related indexes & RLS.  
- **Ingestion + Observation Architecture:** `resolveEntity`, `observation_ingestion`, `graph_builder`.  
- **Entity Merge Infrastructure:** Prepares metadata required by FU-116/FU-126.  
- **MCP Server (`src/server.ts` / `actions.ts`):** Entity listing/searching must filter by user + exclude merged.  
- **Testing:** Unit tests for entity resolution, integration tests covering ingestion → entities → relationships.

**Dependencies:**  
- Requires FU-000 baseline schema.  
- Blocks FU-116 (Entity Merges table) and FU-126 (`merge_entities()` MCP tool).  

**Documentation to Load:**  
- `docs/subsystems/schema.md`  
- `docs/subsystems/entity_merge.md`  
- `docs/subsystems/ingestion/ingestion.md` Section 7  
- `docs/architecture/ingestion/sources-first_ingestion_v12_final.md`

---

## Schema Changes

**Tables Affected:** `entities`, `entity_snapshots`

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

CREATE INDEX idx_entities_user ON entities(user_id);
CREATE INDEX idx_entities_user_type ON entities(user_id, entity_type);
CREATE INDEX idx_entities_user_type_name ON entities(user_id, entity_type, canonical_name);
CREATE INDEX idx_entities_merged ON entities(user_id, merged_to_entity_id)
  WHERE merged_to_entity_id IS NOT NULL;

ALTER TABLE entity_snapshots
  ALTER COLUMN user_id SET NOT NULL;
```

**RLS Policies:**

```sql
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read - entities" ON entities;
CREATE POLICY "Users read own entities" ON entities
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access - entities" ON entities
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE entity_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read - entity_snapshots" ON entity_snapshots;
CREATE POLICY "Users read own entity_snapshots" ON entity_snapshots
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access - entity_snapshots" ON entity_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

---

## API / MCP Changes

- **Entity Listing (`retrieveEntities`, `getRelatedEntities`, `listRelationships`):**  
  - Accept `user_id` context (temporary default to single-user UUID).  
  - Filter queries with `.eq("user_id", userId)` and `.is("merged_to_entity_id", null)` unless `include_merged=true`.

- **Observation / Record Pipelines (`store_record`, ingestion helpers):**  
  - Pass `userId` into `resolveEntity`.  
  - When writing snapshots/observations, reuse the same user scope.

- **Error Codes:**  
  - Reuse existing `ENTITY_ACCESS_DENIED` for cross-user access attempts.  
  - Surface `MERGED_ENTITY` warning when clients target merged IDs.

---

## Observability

- **Metrics:**  
  - `entity.resolution.lookup_duration_ms` (histogram, label `result=hit|miss`).  
  - `entity.merged_redirect_total` (counter when ingestion redirects to merged target).

- **Logs:**  
  - `entity_resolution.user_scope_missing` (error).  
  - `entity.merge_metadata_missing` (warn if merged entity lacks metadata).  
  - `entity.query_merged_excluded` (debug, high-volume sampling).

- **Events:**  
  - Emit `entity.merge_metadata_updated` when FU-116 updates metadata (future hook).

---

## Testing Strategy

**Unit Tests:**  
1. `generateEntityId` + `resolveEntity` (new suite)  
   - Same `(user_id, entity_type, name)` ⇒ same row.  
   - Different `user_id` ⇒ independent inserts (post multi-user).  
2. `entity_resolution.test.ts`  
   - Ensures existing entity is reused for same user; new insert when user differs.  
3. `listEntities` helper filters merged entities by default.

**Integration Tests:**  
1. `IT-002 Entity Resolution`  
   - After ingestion, verify `entities.user_id` matches default user.  
   - Verify merged entities excluded from list API.  
2. `IT-004 Graph Integrity`  
   - Creating relationships respects user scope.  
3. `IT-011 Relationship Types`  
   - Relationships inherit entity `user_id` and fail if mismatch.

**E2E Tests:**  
- `npm run test:e2e` ingestion flow ensures entity list API only returns default user’s data and snapshots include `user_id`.

**Expected Coverage:**  
- Entities service modules ≥90% line coverage.  
- Integration suites exercise schema migration + RLS boundaries.

---

## Error Scenarios

| Scenario | Error Code | Message | Recovery |
| --- | --- | --- | --- |
| Missing user_id when inserting entity | `ENTITY_USER_NOT_SET` | "Entity creation requires user_id" | Fix caller to pass authenticated user |
| Cross-user access attempt | `ENTITY_ACCESS_DENIED` | "Entity does not belong to requesting user" | Authenticate as correct user |
| Target entity already merged | `MERGE_TARGET_ALREADY_MERGED` | "Cannot merge into merged entity" | Select an active entity |
| Source entity already merged | `ENTITY_ALREADY_MERGED` | "Entity was already merged" | Use merge destination |

---

## Rollout & Deployment

- **Feature Flags:** None. Migration must land before code deploy.  
- **Rollback Plan:**  
  1. Revert code changes.  
  2. Run down-migration removing the new columns + policies (only if no data relies on them).  
  3. Restore public-read policies temporarily if required to unblock MCP access (not preferred).
- **Monitoring:**  
  - Watch Supabase logs for `permission denied for relation entities`.  
  - Track `entity.resolution.lookup_duration_ms` for regressions.  
  - Verify no increase in ingestion failures after deployment.

---

## Open Questions

1. When multi-user accounts arrive, should entity IDs be re-namespaced per user or should the primary key become `(user_id, id)`? (Blocked until FU-110/FU-112 decisions.)  
2. Do we need soft-delete semantics for merged entities beyond metadata? (Likely handled by FU-116.)

---

## References

- `docs/releases/in_progress/v0.2.0/release_plan.md` (Phase 1 requirements)  
- `docs/subsystems/entity_merge.md` (merge semantics)  
- `.cursor/plans/sources-first-ingestion-v12-final.plan.md` Section C  
- `docs/subsystems/ingestion/ingestion.md` Section 7.3 (user-scoped entity resolution)
