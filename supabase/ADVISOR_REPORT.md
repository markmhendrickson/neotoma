# Supabase Security and Performance Advisor Report

Generated: 2025-01-XX

## Security Issues

### 🔴 CRITICAL: Overly Permissive RLS Policies

**Issue**: All tables have public read access (`USING (true)`) which allows unauthenticated users to read all data.

**Affected Tables**:
- `records` - Contains user data
- `record_relationships` - Contains relationship data
- `state_events` - Contains event history
- `payload_submissions` - Contains submitted payloads
- `observations` - Contains observation data
- `entity_snapshots` - Contains entity snapshots
- `raw_fragments` - Contains fragment data
- `schema_registry` - Contains schema definitions
- `relationships` - Contains relationship data
- `entities` - Contains entity data
- `timeline_events` - Contains timeline data
- `record_entity_edges` - Contains graph edges
- `record_event_edges` - Contains graph edges
- `entity_event_edges` - Contains graph edges
- `plaid_items` - Contains financial access tokens
- `plaid_sync_runs` - Contains sync history
- `external_connectors` - Contains connector secrets

**Recommendation**: 
- Remove public read access for sensitive tables
- Add user_id-based filtering for multi-tenant data
- Use authenticated role checks instead of `USING (true)`

**Example Fix**:
```sql
-- Instead of:
CREATE POLICY "public read - records" ON records FOR SELECT USING (true);

-- Use:
CREATE POLICY "authenticated read - records" ON records 
  FOR SELECT USING (auth.role() = 'authenticated');
```

### 🔴 CRITICAL: Sensitive Data Storage

**Issue**: `plaid_items` table stores `access_token` in plain text.

**Location**: `supabase/schema.sql:128`

**Recommendation**:
- Use Supabase Vault for sensitive tokens
- Or encrypt at application level before storage
- Add column-level encryption if available

### 🟡 MEDIUM: Missing Foreign Key Indexes

**Issue**: Some foreign key columns lack indexes, causing slow joins.

**Affected**:
- `observations.source_payload_id` - Has index ✓
- `record_relationships.source_id` - Has index ✓
- `record_relationships.target_id` - Has index ✓
- `plaid_sync_runs.plaid_item_id` - Has index ✓
- `external_sync_runs.connector_id` - Has index ✓
- `raw_fragments.record_id` - Has index ✓
- `relationships.source_record_id` - **MISSING INDEX**
- `relationships.user_id` - **MISSING INDEX**
- `observations.user_id` - Has index ✓
- `entity_snapshots.user_id` - Has index ✓
- `timeline_events.source_record_id` - Has index ✓
- `record_entity_edges.record_id` - Has index ✓
- `record_event_edges.record_id` - Has index ✓

**Recommendation**: Add missing indexes:
```sql
CREATE INDEX IF NOT EXISTS idx_relationships_source_record ON relationships(source_record_id);
CREATE INDEX IF NOT EXISTS idx_relationships_user ON relationships(user_id);
```

### 🟡 MEDIUM: Missing Composite Indexes for Common Queries

**Issue**: Queries frequently filter by `type` and order by `created_at`, but no composite index exists.

**Evidence**: Code shows frequent patterns like:
```typescript
query.eq("type", normalizedType)
     .order("created_at", { ascending: false })
```

**Recommendation**:
```sql
CREATE INDEX IF NOT EXISTS idx_records_type_created_at 
  ON records(type, created_at DESC);
```

### 🟡 MEDIUM: Missing Index on `updated_at` for Records

**Issue**: `records` table has `updated_at` column but no index, yet queries may filter/sort by it.

**Recommendation**:
```sql
CREATE INDEX IF NOT EXISTS idx_records_updated_at ON records(updated_at DESC);
```

## Performance Issues

### 🟡 MEDIUM: Vector Index Configuration

**Issue**: IVFFlat index uses `lists = 100` which may not be optimal for dataset size.

**Location**: `supabase/schema.sql:47`

**Recommendation**: 
- For datasets < 10K rows: `lists = 10`
- For datasets 10K-100K: `lists = 100` (current)
- For datasets > 100K: `lists = rows / 1000`
- Consider HNSW index for better recall if using pgvector 0.5+

### 🟡 MEDIUM: Missing GIN Index on JSONB Path Queries

**Issue**: `records.properties` has GIN index, but queries filtering by specific JSONB paths may benefit from expression indexes.

**Evidence**: Code filters by `properties->>'external_id'` which has an index, but other property paths may not.

**Recommendation**: Add expression indexes for frequently queried JSONB paths:
```sql
-- If frequently querying specific property keys:
CREATE INDEX IF NOT EXISTS idx_records_properties_gin_path 
  ON records USING GIN(properties jsonb_path_ops);
```

### 🟡 MEDIUM: Missing Index on `type` + `external_source` + `external_id`

**Issue**: Unique constraint exists on `(external_source, external_id)` but queries may filter by `type` first.

**Recommendation**: Add composite index if queries filter by type before external_source:
```sql
CREATE INDEX IF NOT EXISTS idx_records_type_external 
  ON records(type, external_source, external_id) 
  WHERE external_source IS NOT NULL;
```

### 🟢 LOW: Missing Index on `status` Columns

**Issue**: Tables with `status` columns (`external_connectors`, `external_sync_runs`, `plaid_sync_runs`) may benefit from indexes if frequently filtered.

**Status**: `external_connectors.status` has index ✓
**Status**: `external_sync_runs.status` has index ✓
**Status**: `plaid_sync_runs.status` - **MISSING INDEX**

**Recommendation**:
```sql
CREATE INDEX IF NOT EXISTS idx_plaid_sync_runs_status 
  ON plaid_sync_runs(status) WHERE status != 'completed';
```

### 🟢 LOW: Missing Index on Composite Keys for Relationships

**Issue**: `relationships` table queries may filter by `relationship_type` + `source_entity_id` or `target_entity_id`.

**Recommendation**:
```sql
CREATE INDEX IF NOT EXISTS idx_relationships_type_source 
  ON relationships(relationship_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type_target 
  ON relationships(relationship_type, target_entity_id);
```

### 🟢 LOW: Missing Index on `entity_type` + `entity_id` for Observations

**Issue**: Observations are frequently queried by `entity_type` and `entity_id` together.

**Current**: Has `idx_observations_entity ON observations(entity_id, observed_at DESC)`

**Recommendation**: Add composite index:
```sql
CREATE INDEX IF NOT EXISTS idx_observations_entity_type 
  ON observations(entity_type, entity_id, observed_at DESC);
```

## Configuration Issues

### 🟡 MEDIUM: API Max Rows Limit

**Issue**: `max_rows = 1000` in config may be too high for some endpoints.

**Location**: `supabase/config.toml:18`

**Recommendation**: Consider reducing to 500 or implementing pagination more strictly.

### 🟡 MEDIUM: Missing Network Restrictions

**Issue**: Network restrictions are disabled (`enabled = false`).

**Location**: `supabase/config.toml:67`

**Recommendation**: Enable and configure appropriate CIDR blocks for production.

### 🟢 LOW: Password Requirements

**Issue**: `minimum_password_length = 6` is below recommended minimum of 8.

**Location**: `supabase/config.toml:169`

**Recommendation**: Increase to 8 or higher.

### 🟢 LOW: Missing Password Requirements

**Issue**: `password_requirements = ""` is empty.

**Location**: `supabase/config.toml:172`

**Recommendation**: Set to `lower_upper_letters_digits` or `lower_upper_letters_digits_symbols`.

## Summary

### Critical Issues: 2
1. Overly permissive RLS policies (public read on all tables)
2. Sensitive data stored in plain text (Plaid access tokens)

### Medium Issues: 6
1. Missing foreign key indexes (2 tables)
2. Missing composite indexes for common query patterns
3. Missing index on `updated_at`
4. Vector index may need tuning
5. Missing GIN index optimizations
6. Missing composite index on type + external fields

### Low Issues: 5
1. Missing status index on plaid_sync_runs
2. Missing composite indexes on relationships
3. Missing composite index on observations
4. Password length too low
5. Missing password requirements

## Recommended Actions

### Immediate (Security)
1. Restrict public read access on sensitive tables
2. Encrypt or use Vault for Plaid access tokens
3. Add missing foreign key indexes

### Short-term (Performance)
1. Add composite index on `records(type, created_at DESC)`
2. Add index on `records.updated_at`
3. Review and optimize vector index configuration
4. Add missing indexes on relationships table

### Long-term (Optimization)
1. Monitor query performance and add indexes as needed
2. Review RLS policies for multi-tenant isolation
3. Implement proper password requirements
4. Enable network restrictions for production



