# Failing Tests Summary

**Date**: 2026-01-15  
**Total Failing**: 23/58 tests (40%)

## Quick Summary

### ✅ Passing Test Suites (23 tests)
- `mcp_store_parquet.test.ts` - 8/8 ✅
- `mcp_store_unstructured.test.ts` - 9/9 ✅  
- `mcp_entity_creation.test.ts` - 6/6 ✅

### ⚠️ Failing Test Suites (23 tests)

#### 1. mcp_actions_matrix.test.ts (18 failures)

**Root Cause**: Method name mismatch - tests call `server.retrieve_entity_snapshot()` but actual method is `server.retrieveEntitySnapshot()` (camelCase).

**Failing Actions**:
- `retrieve_entity_snapshot` → should be `retrieveEntitySnapshot`
- `retrieve_entities` → should be `retrieveEntities`
- `list_entity_types` → should be `listEntityTypes`
- `retrieve_entity_by_identifier` → should be `retrieveEntityByIdentifier`
- `merge_entities` → should be `mergeEntities`
- `list_observations` → should be `listObservations`
- `retrieve_field_provenance` → should be `retrieveFieldProvenance`
- `create_relationship` → should be `createRelationship`
- `list_relationships` → should be `listRelationships`
- `analyze_schema_candidates` → should be `analyzeSchemaCandidates`
- `get_schema_recommendations` → should be `getSchemaRecommendations`
- `update_schema_incremental` → should be `updateSchemaIncremental`
- `register_schema` → should be `registerSchema`
- `correct` → should be `correct` (this one is correct)

**Fix**: Change test calls from snake_case to camelCase method names, or access via `(server as any)[camelCaseName]()`.

#### 2. mcp_auto_enhancement.test.ts (5 failures)

**Root Causes**:
1. Method access issues (3 tests) - same as above
2. Raw fragments not being created (2 tests) - test data may not have unknown fields, or query is wrong

**Failing Tests**:
1. `should create queue entries when storing unknown fields` - No raw_fragments found
2. `should process queue and create schema recommendations` - No queue items processed
3. `should analyze raw_fragments and return recommendations` - Method access
4. `should return stored schema recommendations` - Method access
5. `should filter recommendations by status` - Method access

## SQL Queries to Inspect Examples

### Find Entities Without Schemas

```sql
SELECT DISTINCT 
  e.entity_type, 
  COUNT(DISTINCT e.id) as entity_count
FROM entities e
LEFT JOIN schema_registry sr ON sr.entity_type = e.entity_type AND sr.active = true
WHERE sr.id IS NULL
GROUP BY e.entity_type
ORDER BY entity_count DESC
LIMIT 10;
```

### Example: tasks_sample (no schema)

```sql
-- View tasks_sample entities
SELECT 
  e.id,
  e.entity_type,
  e.canonical_name,
  e.created_at,
  (SELECT COUNT(*) FROM observations WHERE entity_id = e.id) as observation_count
FROM entities e
WHERE e.entity_type = 'tasks_sample'
ORDER BY e.created_at DESC
LIMIT 5;
```

### View Observations with All Fields (No Schema Case)

```sql
-- See all fields stored in observations.fields for tasks_sample
SELECT 
  o.id as observation_id,
  o.entity_id,
  o.entity_type,
  o.fields,  -- All fields here (no raw_fragments)
  o.observed_at
FROM observations o
WHERE o.entity_type = 'tasks_sample'
ORDER BY o.observed_at DESC
LIMIT 3;
```

### Verify No Raw Fragments

```sql
-- Confirm: tasks_sample should have 0 raw_fragments
SELECT COUNT(*) as raw_fragment_count
FROM raw_fragments
WHERE fragment_type = 'tasks_sample' OR entity_type = 'tasks_sample';
-- Expected: 0 (all fields treated as valid when no schema)
```
