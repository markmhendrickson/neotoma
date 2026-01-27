---
name: Schema Evolution Scaling
overview: "Implement scaling improvements for schema evolution across three critical areas: reducer performance, schema governance, and fragment lifecycle management. Prioritized by risk/effort ratio with P0 items addressing immediate concerns."
todos:
  - id: p0-schema-cache
    content: "P0: Add TTL cache to SchemaRegistryService.loadActiveSchema() with 5-minute expiry and invalidation hooks"
    status: pending
  - id: p0-fragment-lifecycle
    content: "P0: Add migration for fragment lifecycle states (lifecycle_state, promoted_at, archived_at, expires_at columns)"
    status: pending
  - id: p0-post-promotion
    content: "P0: Update migrateRawFragmentsToObservations() to mark fragments as promoted with 30-day expiry"
    status: pending
  - id: p0-cleanup-job
    content: "P0: Add cleanupExpiredFragments() to auto_enhancement_processor.ts with configurable retention"
    status: pending
  - id: p1-schema-quotas
    content: "P1: Add user_schema_quotas table and enforcement in schema_registry.ts register/update methods"
    status: pending
  - id: p1-archival-policy
    content: "P1: Create fragment_lifecycle.ts service with archiveStaleFragments() for 90-day inactivity"
    status: pending
  - id: p2-incremental-snapshots
    content: "P2: Implement incremental snapshot computation in observation_reducer.ts (design doc first)"
    status: pending
  - id: p2-fragment-aggregates
    content: "P2: Add raw_fragment_aggregates table with trigger and update schema_recommendation.ts"
    status: pending
---

# Schema Evolution Scaling Improvements

## Context

The schema evolution architecture is well-designed but needs operational mechanisms before scaling to thousands of users. This plan addresses three critical areas identified in the assessment:

1. **Reducer Performance** - Snapshot computation costs grow with observation counts
2. **Schema Governance** - User-specific schemas can fragment without limits
3. **Fragment Lifecycle** - `raw_fragments` table grows unbounded

## Architecture Overview

```mermaid
flowchart TB
    subgraph current [Current State]
        Obs[Observations] --> Reducer[Reducer]
        Reducer --> |"Full recompute"| Snapshot[Entity Snapshot]
        Schema[(Schema Registry)] --> |"DB query each time"| Reducer
        Fragments[(Raw Fragments)] --> |"Never cleaned"| Storage[Unbounded Storage]
    end
    
    subgraph improved [Improved State]
        Obs2[Observations] --> Reducer2[Reducer]
        Reducer2 --> |"Incremental update"| Snapshot2[Entity Snapshot]
        Cache[Schema Cache] --> |"TTL cached"| Reducer2
        Fragments2[(Raw Fragments)] --> Lifecycle[Lifecycle Manager]
        Lifecycle --> |"Promote/Archive"| CleanStorage[Bounded Storage]
    end
```

---

## P0: Immediate Improvements (Low Effort, High Impact)

### 1. Schema Registry Caching

**Problem:** Every `computeSnapshot` call queries the database for schema.

**File:** [`src/services/schema_registry.ts`](src/services/schema_registry.ts)

**Implementation:**

- Add in-memory TTL cache (5 minute default)
- Cache key: `{entityType}:{userId || 'global'}`
- Invalidate on `register()`, `activate()`, `deactivate()`, `updateSchemaIncremental()`

**Key code location:**

```typescript
// src/services/schema_registry.ts:loadActiveSchema (around line 200)
// Add cache check before database query
```

### 2. Fragment Lifecycle States

**Problem:** No mechanism to track or clean up fragments after promotion.

**Files:**

- New migration: `supabase/migrations/YYYYMMDD_add_fragment_lifecycle.sql`
- Update: [`src/services/schema_registry.ts`](src/services/schema_registry.ts) - `migrateRawFragmentsToObservations()`

**Schema changes:**

- Add `lifecycle_state` column: `'active' | 'promoted' | 'archived' | 'pending_deletion'`
- Add `promoted_at`, `archived_at`, `expires_at` timestamps
- Add index on `lifecycle_state` for cleanup queries

### 3. Post-Promotion Fragment Cleanup

**Problem:** Promoted fragments stay in table indefinitely.

**File:** [`src/services/schema_registry.ts`](src/services/schema_registry.ts)

**Implementation:**

- After `migrateRawFragmentsToObservations()` succeeds, mark fragments as `promoted`
- Set `expires_at` to 30 days (configurable) for audit trail retention
- Add cleanup function `cleanupExpiredFragments()` to auto-enhancement processor

---

## P1: Near-Term Improvements (Medium Effort)

### 4. User Schema Limits

**Problem:** No governance on user schema creation.

**Files:**

- New migration: `supabase/migrations/YYYYMMDD_add_user_schema_quotas.sql`
- Update: [`src/services/schema_registry.ts`](src/services/schema_registry.ts) - `register()` and `updateSchemaIncremental()`

**Schema changes:**

- New table `user_schema_quotas`: `user_id`, `schema_count`, `max_schemas` (default 10), `total_fields`, `max_fields` (default 200)
- Add check constraint or trigger to enforce limits

**Behavior:**

- Warn when approaching quota (80%)
- Reject new user schemas when at quota
- Provide upgrade path (increase limits) for power users

### 5. Fragment Archival Policy

**Problem:** Stale fragments with low frequency accumulate.

**File:** New service: `src/services/fragment_lifecycle.ts`

**Implementation:**

- Archive fragments with no activity for 90 days and frequency < 3
- Move to `archived` state (don't delete for audit)
- Run as scheduled job alongside auto-enhancement processor

---

## P2: Scaling Improvements (Higher Effort)

### 6. Incremental Snapshot Computation

**Problem:** Full recomputation from all observations on every update.

**Files:**

- Update: [`src/reducers/observation_reducer.ts`](src/reducers/observation_reducer.ts)
- Update: [`src/services/observation_ingestion.ts`](src/services/observation_ingestion.ts)

**Design:**

- Store `last_computed_observation_id` in entity_snapshots
- On new observation: merge into existing snapshot instead of full recompute
- Full recompute only on schema change or explicit refresh

**Tradeoffs:**

- Faster updates but more complex merge logic
- Need fallback to full recompute for conflict resolution

### 7. Fragment Aggregation Table

**Problem:** Schema recommendations query all fragments, expensive at scale.

**Files:**

- New migration: `supabase/migrations/YYYYMMDD_add_fragment_aggregates.sql`
- Update: [`src/services/schema_recommendation.ts`](src/services/schema_recommendation.ts)

**Schema:**

- New table `raw_fragment_aggregates`: `entity_type`, `fragment_key`, `user_id`, `sample_count`, `frequency_total`, `dominant_type`, `type_consistency`, `unique_sources`, `last_seen_at`, `sample_values` (JSONB, 10 samples)
- Trigger on `raw_fragments` insert/update to maintain aggregates
- Update `calculateFieldConfidence()` to use aggregates

### 8. Schema Extension Model

**Problem:** User schemas can completely diverge from global.

**Files:**

- New migration: `supabase/migrations/YYYYMMDD_add_schema_extensions.sql`
- Major update: [`src/services/schema_registry.ts`](src/services/schema_registry.ts)

**Design:**

- New table `user_schema_extensions`: `user_id`, `entity_type`, `base_schema_version`, `additional_fields`, `field_overrides`
- Users extend global schema, cannot remove global fields
- Global migrations automatically cascade to all users

**This is a significant refactor and should be planned separately.**

---

## P3: Future Improvements

### 9. Batch Recomputation Workers

**Problem:** Schema migrations trigger inline snapshot recomputation.

**Design:**

- Background job queue for snapshot recomputation
- Prioritized processing (recent entities first)
- Progress tracking and resumability

### 10. Pattern Promotion Pipeline

**Problem:** Common user patterns not promoted to global.

**Design:**

- Analyze user schemas for common fields (10+ users)
- Create proposals for global schema updates
- Admin approval workflow

---

## Implementation Order

```mermaid
gantt
    title Schema Evolution Scaling Implementation
    dateFormat  YYYY-MM-DD
    section P0
    Schema Caching           :p0a, 2026-01-23, 1d
    Fragment Lifecycle       :p0b, after p0a, 2d
    Post-Promotion Cleanup   :p0c, after p0b, 1d
    section P1
    User Schema Limits       :p1a, after p0c, 2d
    Fragment Archival        :p1b, after p1a, 2d
    section P2
    Incremental Snapshots    :p2a, after p1b, 5d
    Fragment Aggregation     :p2b, after p1b, 3d
```

## Testing Strategy

- **Unit tests:** Schema cache invalidation, lifecycle state transitions
- **Integration tests:** Quota enforcement, cleanup job execution
- **Performance tests:** Snapshot computation with 100+ observations
- **Migration tests:** Fragment state transitions, aggregate accuracy

## Rollback Strategy

All changes are additive:

- New columns have defaults
- New tables don't affect existing queries
- Cache is opt-in (graceful degradation if disabled)
- Lifecycle states default to `'active'` (no behavior change until cleanup runs)