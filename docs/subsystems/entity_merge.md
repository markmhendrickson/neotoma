# Neotoma Entity Merge Mechanism
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
  return await supabase
    .from('entities')
    .select('*')
    .eq('user_id', userId)
    .is('merged_to_entity_id', null)  // Exclude merged
    .match(filters);
}
```
### 5.2 Observation Redirect
If an observation is created targeting a merged entity, **redirect to the target**:
```typescript
async function createObservation(entityId: string, userId: string, fields: any) {
  // Check if entity is merged
  const entity = await supabase
    .from('entities')
    .select('id, merged_to_entity_id')
    .eq('id', entityId)
    .eq('user_id', userId)
    .single();
  // Redirect if merged
  const targetEntityId = entity.data?.merged_to_entity_id || entityId;
  await supabase.from('observations').insert({
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
## 7. Duplicate Detection (Post-Launch)
### 7.1 Heuristic Detection
Background worker identifies potential duplicates:
```typescript
async function detectPotentialDuplicates(): Promise<void> {
  const users = await getDistinctUsers();
  
  for (const { user_id } of users) {
    const merchants = await supabase
      .from('entities')
      .select('id, canonical_name')
      .eq('entity_type', 'merchant')
      .eq('user_id', user_id)
      .is('merged_to_entity_id', null);
    const candidates = findSimilarNames(merchants.data ?? [], 0.85);
    
    logMetric('entity.potential_duplicates', candidates.length, { 
      entity_type: 'merchant',
      user_id 
    });
  }
}
```
### 7.2 MCP Tool (Post-Launch)
```typescript
list_untyped_entities({
  limit?: number  // Default: 50
})
→ {
  entities: Array<{
    entity_id: string,
    source_id: string,
    raw_data: object,
    created_at: string
  }>
}
```
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
