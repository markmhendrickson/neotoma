# Querying Entities Created Without Schema

**Date**: 2026-01-15

## SQL Queries for Supabase

### Find Entity Types Without Schemas

```sql
-- Find entity types that have entities but no schema
SELECT DISTINCT e.entity_type
FROM entities e
LEFT JOIN schema_registry sr ON sr.entity_type = e.entity_type AND sr.active = true
WHERE sr.id IS NULL
ORDER BY e.entity_type;
```

### Find Specific Example: tasks_sample

```sql
-- Find entities of type tasks_sample (no schema exists)
SELECT 
  e.id,
  e.entity_type,
  e.canonical_name,
  e.created_at,
  COUNT(o.id) as observation_count
FROM entities e
LEFT JOIN observations o ON o.entity_id = e.id
WHERE e.entity_type = 'tasks_sample'
GROUP BY e.id, e.entity_type, e.canonical_name, e.created_at
LIMIT 10;
```

### View Observations with All Fields (No Schema Case)

```sql
-- View observations for entities without schema
-- All fields should be in observations.fields (not raw_fragments)
SELECT 
  o.id as observation_id,
  o.entity_id,
  o.entity_type,
  o.fields,
  o.observed_at,
  e.canonical_name
FROM observations o
JOIN entities e ON e.id = o.entity_id
WHERE o.entity_type = 'tasks_sample'
  AND NOT EXISTS (
    SELECT 1 FROM schema_registry sr 
    WHERE sr.entity_type = o.entity_type AND sr.active = true
  )
ORDER BY o.observed_at DESC
LIMIT 5;
```

### Compare: Entity With Schema vs Without Schema

```sql
-- Compare task (has schema) vs tasks_sample (no schema)
SELECT 
  'task (has schema)' as type,
  COUNT(DISTINCT e.id) as entity_count,
  COUNT(o.id) as observation_count,
  COUNT(rf.id) as raw_fragment_count
FROM entities e
LEFT JOIN observations o ON o.entity_id = e.id
LEFT JOIN raw_fragments rf ON rf.fragment_type = e.entity_type OR rf.entity_type = e.entity_type
WHERE e.entity_type = 'task'

UNION ALL

SELECT 
  'tasks_sample (no schema)' as type,
  COUNT(DISTINCT e.id) as entity_count,
  COUNT(o.id) as observation_count,
  COUNT(rf.id) as raw_fragment_count
FROM entities e
LEFT JOIN observations o ON o.entity_id = e.id
LEFT JOIN raw_fragments rf ON rf.fragment_type = e.entity_type OR rf.entity_type = e.entity_type
WHERE e.entity_type = 'tasks_sample';
```

### View All Fields in Observations (No Schema Example)

```sql
-- See what fields are stored in observations for entities without schema
SELECT 
  o.entity_type,
  jsonb_object_keys(o.fields) as field_name,
  COUNT(*) as occurrence_count
FROM observations o
WHERE o.entity_type = 'tasks_sample'
  AND NOT EXISTS (
    SELECT 1 FROM schema_registry sr 
    WHERE sr.entity_type = o.entity_type AND sr.active = true
  )
GROUP BY o.entity_type, jsonb_object_keys(o.fields)
ORDER BY occurrence_count DESC;
```

## Expected Results

For `tasks_sample` (no schema):
- ✅ Entities exist in `entities` table
- ✅ Observations exist in `observations` table with ALL fields in `fields` JSONB column
- ❌ NO entries in `schema_registry` for `tasks_sample`
- ❌ NO entries in `raw_fragments` for `tasks_sample` (all fields treated as valid)

For `task` (has schema):
- ✅ Entities exist in `entities` table
- ✅ Observations exist with known fields in `fields`
- ✅ Unknown fields in `raw_fragments`
- ✅ Schema exists in `schema_registry`
