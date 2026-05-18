---
title: Neotoma Entity Merge Mechanism
summary: "**Authoritative Vocabulary:** [`docs/vocabulary/canonical_terms.md`](../vocabulary/canonical_terms.md)"
---

# Neotoma Entity Merge Mechanism

**Authoritative Vocabulary:** [`docs/vocabulary/canonical_terms.md`](../vocabulary/canonical_terms.md)

## Scope

This document covers:
- `entity_merges` table structure and semantics
- `merge_entities()` MCP tool
- Observation rewriting during merge
- Snapshot deletion and recomputation
- Merged entity exclusion from queries
- Observation redirect for merged entities
This document does NOT cover:
- Entity resolution (see `docs/subsystems/ingestion/ingestion.md`)
- Observation creation (see `docs/subsystems/observation_architecture.md`)
- Automated duplicate detection (post-launch capability)
## 1. Why Entity Merge?
### 1.1 Heuristic Entity Resolution
Entity resolution uses heuristics to match entities:
- Exact match on `external_id`
- Fuzzy match on key fields (name, date, amount)
- User-scoped matching
**Limitation:** Heuristics cannot achieve perfect deduplication. The same real-world entity may be created multiple times:
- "Acme Corp" and "Acme Corporation" → two entities
- Same merchant with different spellings → two entities
- Same person referenced differently → two entities
### 1.2 Merge as Repair Mechanism
Rather than attempting perfect entity resolution (impossible), Neotoma provides a merge mechanism to repair duplicates after the fact:
1. **Detection**: User or agent identifies duplicates
2. **Merge**: `merge_entities(from_id, to_id)` combines entities
3. **Rewrite**: Observations pointing to `from_entity` are rewritten to `to_entity`
4. **Cleanup**: `from_entity` is marked as merged; snapshot deleted
5. **Recompute**: `to_entity` snapshot recomputed with all observations
## 2. Entity Merges Table
### 2.1 Schema
```sql
CREATE TABLE entity_merges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  from_entity_id TEXT NOT NULL REFERENCES entities(id),
  to_entity_id TEXT NOT NULL REFERENCES entities(id),
  reason TEXT,
  merged_by TEXT NOT NULL,
  observations_rewritten INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT entity_merges_no_self_merge CHECK (from_entity_id <> to_entity_id)
);
```
**Note:** `from_entity_id` and `to_entity_id` are TEXT to match `entities.id` type.
### 2.2 Indexes
```sql
CREATE UNIQUE INDEX idx_entity_merges_from_unique ON entity_merges(user_id, from_entity_id);
CREATE INDEX idx_entity_merges_user ON entity_merges(user_id);
CREATE INDEX idx_entity_merges_to ON entity_merges(user_id, to_entity_id);
```
The unique index on `(user_id, from_entity_id)` prevents merge chains (each entity can only be merged once).
### 2.3 RLS Policies
```sql
ALTER TABLE entity_merges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own entity_merges" ON entity_merges
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access" ON entity_merges
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
## 3. Entities Table Extensions
### 3.1 Merge Tracking Columns
```sql
ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS merged_to_entity_id TEXT REFERENCES entities(id),
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;
```
| Column | Purpose |
|--------|---------|
| `merged_to_entity_id` | Target entity if this entity was merged |
| `merged_at` | Timestamp when merge occurred |
### 3.2 Merged Entity Index
```sql
CREATE INDEX idx_entities_merged ON entities(user_id, merged_to_entity_id)
  WHERE merged_to_entity_id IS NOT NULL;
```
## 4. Merge Execution
### 4.1 MCP Tool
```typescript
merge_entities({
  from_entity_id: string,
  to_entity_id: string,
  reason?: string
})
→ {
  merged: true,
  observations_rewritten: number,
  snapshots_recomputed: string[]
}
```
### 4.2 Validation
```typescript
async function validateMerge(
  fromId: string, 
  toId: string, 
  userId: string
): Promise<void> {
  // 1. Both entities must exist and belong to same user
  const fromEntity = await getEntity(fromId);
  const toEntity = await getEntity(toId);
  if (!fromEntity || !toEntity) {
    throw new IngestionError({ code: 'ENTITY_NOT_FOUND' });
  }
  if (fromEntity.user_id !== userId || toEntity.user_id !== userId) {
    throw new IngestionError({ 
      code: 'ENTITY_ACCESS_DENIED',
      message: 'Cannot merge entities belonging to different users'
    });
  }
  // 2. from_entity must not be already merged
  if (fromEntity.merged_to_entity_id) {
    throw new IngestionError({
      code: 'ENTITY_ALREADY_MERGED',
      message: `Entity ${fromId} was already merged to ${fromEntity.merged_to_entity_id}`
    });
  }
  // 3. to_entity must not be already merged (prevent merge-to-dead-entity)
  if (toEntity.merged_to_entity_id) {
    throw new IngestionError({
      code: 'MERGE_TARGET_ALREADY_MERGED',
      message: `Cannot merge to ${toId}: it was already merged to ${toEntity.merged_to_entity_id}`
    });
  }
}
```
### 4.3 Execution
```typescript
async function executeMerge(
  fromId: string,
  toId: string,
  userId: string,
  reason?: string,
  mergedBy: string
): Promise<{ observations_rewritten: number }> {
  return await db.transaction(async (tx) => {
    // 1. Insert audit log
    await tx.query(`
      INSERT INTO entity_merges (user_id, from_entity_id, to_entity_id, reason, merged_by)
      VALUES ($1, $2, $3, $4, $5)
    `, [userId, fromId, toId, reason, mergedBy]);
    // 2. Rewrite observations
    const rewriteResult = await tx.query(`
      UPDATE observations 
      SET entity_id = $1 
      WHERE user_id = $2 AND entity_id = $3
      RETURNING id
    `, [toId, userId, fromId]);
    const observationsRewritten = rewriteResult.rowCount;
    // 3. Mark from_entity as merged
    await tx.query(`
      UPDATE entities 
      SET merged_to_entity_id = $1, merged_at = NOW() 
      WHERE user_id = $2 AND id = $3
    `, [toId, userId, fromId]);
    // 4. Delete stale snapshot for from_entity
    await tx.query(`
      DELETE FROM entity_snapshots 
      WHERE user_id = $1 AND entity_id = $2
    `, [userId, fromId]);
    // 5. Update audit log with count
    await tx.query(`
      UPDATE entity_merges 
      SET observations_rewritten = $1 
      WHERE user_id = $2 AND from_entity_id = $3
    `, [observationsRewritten, userId, fromId]);
    return { observations_rewritten: observationsRewritten };
  });
  // 6. Recompute snapshot for to_entity (outside transaction)
  await recomputeSnapshot(toId, userId);
}
```
## 5. Merged Entity Behavior
### 5.1 Query Exclusion
By default, queries should **exclude merged entities**:
```typescript
async function queryEntities(userId: string, filters: any) {
  return await db.query("entities", {
    user_id: userId,
    merged_to_entity_id: null,  // Exclude merged
    ...filters,
  });
}
```
### 5.2 Observation Redirect
If an observation is created targeting a merged entity, **redirect to the target**:
```typescript
async function createObservation(entityId: string, userId: string, fields: any) {
  // Check if entity is merged
  const entity = await db.queryOne("entities", {
    id: entityId,
    user_id: userId,
  }, ["id", "merged_to_entity_id"]);
  // Redirect if merged
  const targetEntityId = entity?.merged_to_entity_id || entityId;
  await db.insert("observations", {
    entity_id: targetEntityId,
    user_id: userId,
    fields,
    // ...
  });
}
```
### 5.3 Merged Entity Record Retention
Merged entities are **not deleted**. They remain in the `entities` table with:
- `merged_to_entity_id` set to target
- `merged_at` timestamp set
This enables:
- Audit trail of what was merged
- Redirect logic for observations
- Historical reference
## 6. Merge Constraints
### 6.1 No Merge Chains
Each entity can only be merged once. The unique index on `(user_id, from_entity_id)` enforces this:
```
✅ A → B (first merge)
❌ A → C (A already merged to B)
❌ B → C (would create chain A → B → C)
```
### 6.2 Same-User Only
Merges cannot cross user boundaries. Both `from_entity` and `to_entity` must have the same `user_id`.
### 6.3 Flat Merges Only
No transitive merges are supported. If you need to merge A, B, and C:
```
✅ A → C, B → C (both merge to C)
❌ A → B → C (chain not supported)
```
## 7. Duplicate Detection (R5)

Read-only fuzzy post-hoc detector that surfaces candidate duplicate pairs for operator or agent review. Never auto-merges. Hands off to `merge_entities` once a reviewer confirms a pair. Doctrine preserved: identity resolution stays deterministic via the `entity_type + canonical_name` hash; fuzzy matching lives only here, on demand.

### 7.1 Schema-driven configuration

Schemas drive detector behavior via two optional fields on `SchemaDefinition` (see `src/services/schema_registry.ts`):

- `duplicate_detection_fields`: array of snapshot field names to compare in addition to `canonical_name`. Omit to compare `canonical_name` only (weakest signal).
- `duplicate_detection_threshold`: similarity threshold in (0, 1]. Defaults to `0.85` when omitted.

The detector is implemented in `src/services/duplicate_detection.ts` and computes a normalized Levenshtein similarity over `canonical_name` plus any declared snapshot fields. A pair is flagged when the best per-field score clears the threshold; the response includes the matched field names, a composite `score`, and the snapshot fields that were compared.

### 7.2 CLI and MCP surfaces

- CLI: `neotoma entities find-duplicates --entity-type <type> [--threshold <0..1>] [--limit <n>]`
- MCP: `list_potential_duplicates({ entity_type, threshold?, limit?, user_id? })`
- HTTP: `GET /entities/duplicates?entity_type=...&threshold=...&limit=...` (`operationId: listPotentialDuplicates`)

All three return the same payload shape:

```json
{
  "candidates": [
    {
      "entity_a": { "id": "ent_...", "canonical_name": "...", "snapshot_fields": { "...": "..." } },
      "entity_b": { "id": "ent_...", "canonical_name": "...", "snapshot_fields": { "...": "..." } },
      "score": 0.93,
      "matched_fields": ["canonical_name", "email"],
      "entity_type": "contact"
    }
  ],
  "entity_type": "contact",
  "threshold": 0.85
}
```

Operators or agents review the list and call `merge_entities` per pair. No automatic merging.

### 7.3 Constraints

- Same-user only (scoped by `user_id`).
- Merged entities are excluded.
- Pure read path: no observations, snapshots, or entities are mutated.
- The detector caps the scan at 2000 entities per type per call. Callers requiring larger scans should page by type or add filters via future parameters.
## 7.5 Inverse Operation — `split_entity` (R5)

`split_entity(source_entity_id, predicate, new_entity, idempotency_key)` is the surgical inverse of `merge_entities` introduced alongside the R1–R4 conversation-entity-collision fix. It re-points a predicate-selected subset of observations from an over-merged source entity onto a new (or pre-existing) target entity without modifying any observation content.

### 7.5.1 Why Split Exists

The pre-v1.2 `conversation` schema resolved via `heuristic_name` (`name_key:title`) whenever `conversation_id` was absent. Unrelated chat sessions with identical titles collapsed onto the same entity. R1 (canonical_name_fields) + R2 (`name_collision_policy: "reject"`) prevent future collisions, but existing over-merged entities need a cleanup tool that respects the immutability doctrine. `split_entity` is that tool; it is symmetric with `merge_entities` in every audit and idempotency guarantee.

### 7.5.2 Contract

See the OpenAPI `/entities/split` operation and `SplitEntityRequest` / `SplitEntityResponse` schemas. The MCP tool is `split_entity`.

Required inputs:
- `source_entity_id`: the over-merged entity.
- `predicate`: declarative, schema-agnostic — at least one of
  - `observed_at_gte` (ISO-8601 lower bound),
  - `source_id_in` (list of source ids),
  - `observation_field_equals` ({ field, value | value_starts_with }).
- `new_entity`: `{ entity_type, canonical_name, target_entity_id? }`. Omitting `target_entity_id` derives a deterministic id via `generateEntityId`.
- `idempotency_key`: required per MUST #11. Reuse with the same canonicalized predicate is a deterministic replay (`replayed: true`); reuse with a different predicate is an error (`ERR_IDEMPOTENCY_MISMATCH`).

### 7.5.3 Execution Semantics

1. Look up the (user_id, idempotency_key) row in `entity_splits`; on hit, return the cached result (replay).
2. Validate the source entity exists and is not already merged-away.
3. Load all observations for the source entity and apply the predicate in-process.
4. Refuse if the predicate matched zero observations (would be a no-op) or every observation (would be a rename — use `correct` or `merge_entities` instead).
5. Ensure the target entity row exists (insert when a deterministic id was derived).
6. Re-point `observations.entity_id` for the matched subset with a single SQL `UPDATE ... WHERE id IN (...)`. No observation content (`fields`, `observed_at`, `source_id`, `interpretation_id`) is ever touched.
7. Delete the source entity snapshot and recompute snapshots for both source and new entities from their reduced observation sets.
8. Insert a row into `entity_splits` (id, user_id, source_entity_id, new_entity_id, predicate, reason, split_by, observations_rewritten, idempotency_key, created_at).

### 7.5.4 Audit Table

```sql
CREATE TABLE entity_splits (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  source_entity_id TEXT,
  new_entity_id TEXT,
  predicate TEXT,         -- canonicalized JSON, drives idempotency compare
  reason TEXT,
  split_by TEXT,
  observations_rewritten INTEGER,
  idempotency_key TEXT,
  created_at TEXT
);
CREATE UNIQUE INDEX entity_splits_user_idempotency_unique
  ON entity_splits(user_id, idempotency_key);
```

Symmetric with `entity_merges`: one row per split, `(user_id, idempotency_key)` unique, full audit trail.

### 7.5.5 Immutability Reconciliation

`split_entity` updates the `entity_id` foreign key on observations — the same mutation the shipped `merge_entities` flow performs via `rewriteObservationEntityId`. The doctrine that "observation content is immutable" (see [docs/subsystems/observation_architecture.md](./observation_architecture.md)) is preserved: `fields`, `observed_at`, `source_id`, and `interpretation_id` are never modified. Any future ADR that tightens FK mutability applies to merge AND split together.

### 7.5.6 Typed Relationships

Like `merge_entities`, `split_entity` does NOT recompute typed edges (MUST NOT #12 — no untyped edges). Relationships remain bound to the source entity; rebuild them onto the new entity via `create_relationship` when appropriate.

### 7.5.7 Error Codes

| Code | Meaning |
|------|---------|
| `RESOURCE_NOT_FOUND` | Source entity does not exist for this user. |
| `VALIDATION_INVALID_FORMAT` | Source already merged, predicate matched zero observations, or predicate matched every observation. |
| `ERR_IDEMPOTENCY_MISMATCH` | `idempotency_key` was reused with a different canonicalized predicate. |

## 8. Error Codes
| Code | Meaning |
|------|---------|
| `ENTITY_NOT_FOUND` | One or both entities do not exist |
| `ENTITY_ACCESS_DENIED` | Entities belong to different users |
| `ENTITY_ALREADY_MERGED` | `from_entity` was already merged |
| `MERGE_TARGET_ALREADY_MERGED` | `to_entity` was already merged (cannot merge to dead entity) |
## 9. Monitoring
| Metric | Type | Description |
|--------|------|-------------|
| `entity.merges_total` | counter | Entity merges performed |
| `entity.potential_duplicates` | gauge | Entities flagged as potential duplicates |
| `entity.duplicate_ratio` | gauge | Ratio of potential duplicates to total |
## Agent Instructions
### When to Load This Document
Load `docs/subsystems/entity_merge.md` when:
- Implementing entity merge functionality
- Handling duplicate entity detection
- Understanding merged entity query behavior
- Implementing observation creation with merge redirect
### Constraints Agents Must Enforce
1. **Merge MUST be same-user only** (no cross-user merges)
2. **Merge MUST be flat** (no chains: each entity merged only once)
3. **Merged entities MUST be excluded from default queries**
4. **Observations targeting merged entities MUST redirect**
5. **Audit log MUST be created for every merge**
6. **Snapshot MUST be recomputed after merge**
### Forbidden Patterns
- Cross-user entity merges
- Merge chains (A → B → C)
- Deleting merged entity records (retain for audit)
- Skipping observation redirect logic
- Modifying observations without recomputing snapshot
