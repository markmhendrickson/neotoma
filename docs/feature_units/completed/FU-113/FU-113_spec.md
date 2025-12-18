# Feature Unit: FU-113 Entity Extensions

**Status:** Draft  
**Priority:** P0 (Critical)  
**Risk Level:** Medium (schema + security)  
**Target Release:** v0.2.0  
**Owner:** Worker Agent (Cursor)  
**Reviewers:** Platform Engineering, Data Architecture  
**Created:** 2025-12-18  
**Last Updated:** 2025-12-18

---

## Overview

**Brief Description:**
Add user isolation and merge tracking to the `entities` table so every canonical entity is scoped to a single user, carries explicit provenance, and can be deterministically excluded once merged. This FU introduces `user_id`, `merged_to_entity_id`, `merged_at`, supporting indexes, and user-aware RLS policies. Application services are updated to stamp `user_id`, reject cross-user merges, and surface merged-entity state everywhere entities are resolved or queried.

**User Value:**
- Guarantees privacy-first behavior: entities created from one user's data are invisible to others.  
- Powers deterministic merge/correction flows by tracking which entities were merged and when.  
- Unblocks MCP tooling (FU-116, FU-126) that relies on user-scoped entity graphs and audit-friendly merge trails.

**Defensible Differentiation:**
Validates Neotoma's privacy-first + deterministic differentiators. User isolation is enforced at the schema/RLS layer, and merge tracking ensures deterministic provenance during manual correction flows—capabilities that hosted LLM memory providers typically cannot ship because of multi-tenant inference architectures.

**Technical Approach:**
- Schema migration extends `entities` with `user_id`, `metadata`, `first_seen_at`, `last_seen_at`, `merged_to_entity_id`, `merged_at`.  
- Create composite indexes for user + entity type/name lookups and merged-entity filtering.  
- Replace permissive `public read` policy with `Users read own entities` + keep service-role policy.  
- Application services (`entity_resolution`, `observation_ingestion`, MCP HTTP actions) require a `userId` parameter and stamp it on every insert/update.  
- Introduce repo-wide `DEFAULT_USER_ID` constant (single-user placeholder) so current flows keep functioning until auth plumbs real IDs.  
- Update tests + ingestion pipelines to assert user-aware behavior and merged-entity invariants.

---

## Requirements

### Functional Requirements

1. **Schema Extension:** `entities` gains the new columns described in Section 2.4 with NOT NULL/default constraints where applicable.  
2. **RLS Enforcement:** Replace permissive policies with user-isolated RLS (select/update/delete guarded by `user_id = auth.uid()`), while retaining service-role full access.  
3. **User-Aware Resolution:** `resolveEntity` must accept a `userId`, look up entities scoped to that user, stamp `user_id` on insert, and refresh `last_seen_at` on reuse.  
4. **Merge Tracking:** `merged_to_entity_id` + `merged_at` are populated when merge logic runs. Downstream queries (list/search) must filter out merged entities by default.  
5. **Cross-FU Contracts:** Provide deterministic base for FU-116 (Entity Merges table) and FU-126 (merge_entities MCP tool) by exposing merged state and user-scoped IDs via Supabase + MCP endpoints.

### Non-Functional Requirements

1. **Performance:** Entity resolution lookups (by ID/type/name) must remain <15 ms P95 against Supabase (indexes required).  
2. **Determinism:** Given `(entity_type, canonical_name, user_id)` the same `entity_id` must be returned on every run; merges are deterministic (idempotent updates).  
3. **Consistency:** Strong consistency for entity rows—writes happen synchronously inside ingestion pipeline transactions.  
4. **Accessibility / i18n:** No UI changes; ensure API messages remain ASCII + i18n neutral.  
5. **Security:** RLS policies must not expose other users' data. Service role is the only role allowed to bypass `user_id` filters.

### Invariants (MUST / MUST NOT)

**MUST:**
- Stamp `user_id` on every insert/update into `entities`, `relationships`, `entity_merges`, and any dependent table that references entities.  
- Keep `merged_to_entity_id` NULL until a merge happens; once populated it never reverts.  
- Update `last_seen_at` whenever an entity is resolved for a new observation.  
- Filter merged entities out of list/search endpoints unless caller explicitly requests merged rows.  
- Maintain deterministic hash-based IDs (still derived from entity type + normalized value).

**MUST NOT:**
- Allow cross-user merges or entity resolution (reject if `user_id` mismatch).  
- Permit anonymous/public RLS policies on `entities`.  
- Introduce nondeterministic merge IDs or timestamps (all server-generated).  
- Mutate `canonical_name` post-creation (immutability preserved).

---

## Affected Subsystems

**Primary Subsystems:**
- `schema`: `entities` table, indexes, RLS policies.  
- `ingestion/entity_resolution`: Deterministic user-aware ID generation + stamping.  
- `observation_architecture`: Observation creation + reducer inputs reference user-scoped entities.  
- `server` / MCP HTTP actions: entity queries/search/graph responses respect merge + user scope.

**Dependencies:**
- Blocks `FU-116` (Entity Merges table requires merged-to metadata).  
- Blocks `FU-126` (merge_entities MCP tool expects user-scoped entities).  
- Relies on `FU-110` base schema migration being applied first.

**Documentation to Load:**
- `docs/subsystems/schema.md`  
- `docs/subsystems/entity_merge.md`  
- `docs/subsystems/ingestion/ingestion.md`  
- `docs/foundation/entity_resolution.md`

---

## Schema Changes

**Tables Affected:**

```sql
ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS merged_to_entity_id TEXT REFERENCES entities(id),
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;

UPDATE entities
SET user_id = '00000000-0000-0000-0000-000000000000'
WHERE user_id IS NULL;
ALTER TABLE entities ALTER COLUMN user_id DROP DEFAULT;
```

**Indexes:**

```sql
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
CREATE POLICY "Users mutate own entities" ON entities
  FOR INSERT WITH CHECK (user_id = auth.uid())
  TO authenticated;
CREATE POLICY "Service role full access - entities" ON entities
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

**Migration Required:** Yes — `supabase/migrations/20251218100000_fu_113_entity_extensions.sql`.

---

## API / MCP Changes

- `resolveEntity(entityType, rawValue, userId)` signature change; all call sites (ingestion pipeline, /store_record MCP action, observation ingestion) pass the authenticated `userId` (falls back to default single-user ID until auth wiring lands).  
- Entity search endpoints (`retrieve_entities`, `get_entity_by_identifier`, `get_related_entities`) filter out merged entities by default and only operate on caller's `user_id`.  
- Relationship + provenance endpoints maintain behavior but rely on `user_id` derived from request context.  
- No new MCP actions introduced; schema change is prerequisite for `merge_entities()` (FU-126) but that action is not part of this FU.

_API Contract snippet (resolveEntity):_

```typescript
export async function resolveEntity(
  entityType: string,
  rawValue: string,
  userId: string,
): Promise<Entity>;
```

Errors thrown: `ENTITY_ACCESS_DENIED`, `ENTITY_ALREADY_MERGED`, `MERGE_TARGET_ALREADY_MERGED` (see entity_merge spec).

---

## UI Changes

None. v0.2.0 is still MCP-only; CLI/agent responses inherit new merge flags through API responses (structured JSON only).

---

## State Machines

No new state machines introduced. Merge lifecycle documented in `docs/subsystems/entity_merge.md` (reuse existing diagram).

---

## Observability

**Metrics:**
- `entity.resolve_total` (counter, labels: `result=created|reused`, `entity_type`).  
- `entity.merge_redirects_total` (counter, increments when merged entity is requested and redirected).  
- `entity.merged_active_total` (gauge, tracks active merged entities per user).

**Logs:**
- `info`: "Entity resolved" (fields: `entity_id`, `user_id`, `result`).  
- `warn`: "Merge target rejected" (fields: `from_entity_id`, `to_entity_id`, `user_id`).

**Events:**
- `entity.merged` domain event once merge pipeline runs (payload: `from`, `to`, `user_id`, `observations_rewritten`).

**Traces:**
- Span `resolve_entity` covering normalization + lookup/inserts; attributes include `user_id`, `entity_type`, `result`.

---

## Testing Strategy

**Unit Tests:**
- `src/services/entity_resolution.test.ts`: verifies `resolveEntity` uses `userId`, stamps `user_id`, updates `last_seen_at`, and prevents cross-user reuse.  
- `src/services/observation_ingestion.test.ts`: ensures observation creation passes through `userId` and ignores merged entities.  
- `src/services/payload_compiler.test.ts`: asserts compiled payloads propagate `userId` into downstream observation creation.

**Integration Tests:**
- `tests/actions.integration.test.ts`: `store_record` flow should create entities + observations with `user_id` set, `idx_entities_user_type_name` leveraged, and merged entities excluded from default queries.  
- `tests/graph_builder` suite: confirm orphan-entity detector respects `user_id` (fixtures updated).

**E2E Tests (Playwright):**
- `tests/e2e/entity_merge.spec.ts` (new) or existing ingestion e2e: ingest duplicate record, verify MCP `retrieve_entities` hides merged entity after manual merge (simulate by updating `merged_to_entity_id`).

**Fixtures:**
- Update `tests/__fixtures__/entities/*.json` if applicable to include `user_id`.  
- Add sample merged-entity fixture for future MCP merge tests.

**Expected Coverage:** >85% lines/branches for touched services; 100% coverage for new branches inside `resolveEntity`.

---

## Error Scenarios

| Scenario | Error Code | Message | Recovery |
| --- | --- | --- | --- |
| Missing user context | `ENTITY_ACCESS_DENIED` | "User ID required for entity resolution" | Provide authenticated user_id in MCP call |
| Entity already merged | `ENTITY_ALREADY_MERGED` | "Entity {id} merged to {target}" | Redirect to `merged_to_entity_id`, ask client to retry |
| Merge target merged | `MERGE_TARGET_ALREADY_MERGED` | "Cannot merge to inactive entity" | Choose active entity as target |
| RLS violation | `RLS_VIOLATION` | "Entity does not belong to caller" | Fix auth wiring / pass correct user_id |

---

## Rollout and Deployment

**Feature Flags:** None. Schema + application updates deploy together.

**Rollback Plan:**
1. Revert application changes (restore old `resolveEntity`, constants).  
2. Rollback migration (drop added columns + indexes) only if absolutely necessary; otherwise keep schema and disable RLS policy via Supabase.  
3. Verify ingestion + MCP actions still function (run `npm run test` + `npm run test:integration`).

**Monitoring:**
- Track Supabase errors involving `entities` table post-deploy.  
- Watch `entity.resolve_total{result="created"}` ratio; spikes may signal dedup regressions.  
- Alert on `entity.merged_active_total` if growth deviates (>10% of total entities => indicates duplicates or failed merges).

---

## Notes

- `DEFAULT_USER_ID` is a temporary shim. Once auth is wired, plumbing real `userId` through MCP actions is mandatory; this FU keeps that change localized.  
- Merge behavior (FU-116/FU-126) depends on the merged-to metadata added here; do not defer `merged_to_entity_id` even if merge tooling ships later.  
- Documentation references (`schema.md`, `entity_merge.md`, `ingestion.md`) must stay synchronized with the final schema + API behavior delivered by this FU.
