# Entity Creation When No Schema Detected

**Date**: 2026-01-14  
**Status**: ✅ **YES - Entities ARE Created**

## Answer

**Yes, entities are created even when no known schema is detected for stored structured data.**

## Flow Analysis

### 1. Schema Validation (Lines 2731-2801)

When storing structured data (parquet/CSV), the system:

1. **Loads schema** (database or code fallback)
2. **If schema exists**: Separates fields into `validFields` and `unknownFields`
3. **If no schema exists**: All fields go to `validFields` (line 2800)

```typescript
} else {
  // No schema found - treat all as valid for now
  validFields = fieldsToValidate;
}
```

### 2. Entity Resolution (Lines 2963-2968)

**Entity resolution happens AFTER schema validation**, regardless of whether a schema exists:

```typescript
// Resolve entity (user-scoped)
const entityId = await resolveEntity({
  entityType,
  fields: validFields,  // Uses validFields (all fields when no schema)
  userId,
});
```

### 3. Entity Creation (entity_resolution.ts)

The `resolveEntity` function:

1. **Generates entity ID** from entity type + canonical name (extracted from fields)
2. **Checks if entity exists** in `entities` table
3. **If not exists**: **Creates new entity** in `entities` table
4. **Returns entity ID**

```typescript
// Check if entity exists
const { data: existing } = await supabase
  .from("entities")
  .select("*")
  .eq("id", entityId)
  .maybeSingle();

if (existing) {
  return entityId;
}

// Create new entity
const { error } = await supabase
  .from("entities")
  .insert({
    id: entityId,
    entity_type: entityType,
    canonical_name: canonicalName,
    aliases: [],
    user_id: userId || null,
    created_at: now,
    updated_at: now,
  });
```

### 4. Observation Creation (Lines 2970-2986)

After entity resolution, an observation is created:

```typescript
const { error: obsError } = await supabase.from("observations").insert({
  id: observationId,
  entity_id: entityId,  // Links to the entity (created above)
  entity_type: entityType,
  schema_version: schema?.schema_version || "1.0",
  fields: validFields,  // All fields when no schema
  // ...
});
```

## Summary

**When no schema is detected:**

1. ✅ **Entity IS created** in `entities` table
2. ✅ **Observation IS created** in `observations` table
3. ✅ **All fields stored** in `observations.fields` (JSONB)
4. ❌ **No raw_fragments** created (all fields treated as valid)
5. ❌ **No auto-enhancement** possible (no raw_fragments to analyze)

## Example

**File**: `samples/tasks_sample.parquet` (no schema for `tasks_sample`)

**Result**:
- ✅ Entity created: `ent_xxx` with `entity_type: "tasks_sample"`
- ✅ Observation created: `obs_xxx` with `entity_id: "ent_xxx"`
- ✅ All fields stored in `observations.fields`
- ❌ No `raw_fragments` entries
- ❌ Auto-enhancement cannot discover new fields

**File**: `samples/task.parquet` (schema exists for `task`)

**Result**:
- ✅ Entity created: `ent_xxx` with `entity_type: "task"`
- ✅ Observation created: `obs_xxx` with `entity_id: "ent_xxx"`
- ✅ Known fields stored in `observations.fields`
- ✅ Unknown fields stored in `raw_fragments`
- ✅ Auto-enhancement can discover new fields

## Key Insight

**Entity creation is independent of schema existence.** Entities are always created because:
- Entity resolution uses `validFields` (which contains all fields when no schema)
- Entity ID is generated deterministically from entity type + canonical name
- Entity is created if it doesn't exist (idempotent)

The schema only affects:
- Which fields go to `observations.fields` vs `raw_fragments`
- Whether auto-enhancement can discover new fields
