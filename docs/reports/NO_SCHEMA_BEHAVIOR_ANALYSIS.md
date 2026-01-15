# Behavior When No Schema is Recognized

**Date**: 2026-01-14  
**Status**: ⚠️ **INCONSISTENT BEHAVIOR ACROSS CODE PATHS**

## Summary

When no schema is found for an entity type, the system behaves **differently** depending on the data ingestion path:

1. **Structured Data (Parquet/CSV via `store`)**: All fields → stored in `observations` ✅
2. **Unstructured Data (via `interpret`)**: All fields → stored in `raw_fragments` ⚠️
3. **Payload Submission (via `createObservationsFromPayload`)**: All fields → stored in `observations` ✅

## Detailed Behavior by Code Path

### 1. Structured Data (`src/server.ts` - `storeStructuredInternal`)

**Location**: `src/server.ts:2798-2800`

```typescript
} else {
  // No schema found - treat all as valid for now
  validFields = fieldsToValidate;
}
```

**Behavior**:
- ✅ All fields are treated as **valid**
- ✅ All fields are stored in `observations.fields` (JSONB column)
- ❌ **Nothing** goes to `raw_fragments`
- ❌ **No auto-enhancement possible** (no raw_fragments to analyze)

**Result**: Data is fully stored and queryable, but schema discovery/auto-enhancement cannot work.

---

### 2. Unstructured Data (`src/services/interpretation.ts` - `runInterpretation`)

**Location**: `src/services/interpretation.ts:222-240`

```typescript
if (!schema) {
  // No schema found - route all fields to raw_fragments
  const fragmentId = randomUUID();
  await supabase.from("raw_fragments").insert({
    id: fragmentId,
    record_id: null,
    source_id: sourceId,
    interpretation_id: interpretationId,
    user_id: userId,
    fragment_type: entityType,
    fragment_key: "full_entity",
    fragment_value: entityData,  // Entire entity as one fragment
    fragment_envelope: {
      reason: "no_schema",
      entity_type: entityType,
    },
  });
  unknownFieldsCount += Object.keys(entityData).length;
  continue;
}
```

**Behavior**:
- ⚠️ All fields are stored as **one `raw_fragments` entry** with `fragment_key: "full_entity"`
- ⚠️ Entire entity data stored in `fragment_value` (JSON)
- ❌ **Nothing** goes to `observations`
- ⚠️ **Auto-enhancement possible** but only for the entire entity, not individual fields

**Result**: Data is stored but not queryable via normal entity queries. Auto-enhancement can work but treats the whole entity as one field.

---

### 3. Payload Submission (`src/services/observation_ingestion.ts`)

**Location**: `src/services/observation_ingestion.ts:329-332`

```typescript
} else {
  // No schema - treat all as known for now
  Object.assign(knownFields, payload.body);
}
```

**Behavior**:
- ✅ All fields are treated as **known**
- ✅ All fields are stored in `observations.fields`
- ❌ **Nothing** goes to `raw_fragments`
- ❌ **No auto-enhancement possible**

**Result**: Same as structured data path - data is stored but schema discovery cannot work.

---

## Impact on Auto-Enhancement

### Current Problem

For **structured data** (parquet/CSV files):
- No schema → all fields go to `observations`
- No `raw_fragments` → auto-enhancement cannot discover new fields
- Schema must be manually created or imported from another source

### Why This Matters

1. **New Entity Types**: When importing a new entity type (e.g., `tasks_sample`), there's no schema, so:
   - All data is stored ✅
   - But no schema discovery happens ❌
   - Manual schema creation required

2. **Schema Evolution**: If a schema exists but new fields appear:
   - New fields → `raw_fragments` ✅
   - Auto-enhancement can work ✅

3. **Inconsistency**: Unstructured data behaves differently (stores in `raw_fragments`), which is confusing.

---

## Recommendations

### Option 1: Make Structured Data Store Unknown Fields (Recommended)

**Change**: When no schema exists, treat all fields as "unknown" and store in `raw_fragments`:

```typescript
} else {
  // No schema found - treat all as unknown for schema discovery
  unknownFields = fieldsToValidate;
  validFields = {}; // Empty - no known fields
}
```

**Pros**:
- ✅ Enables auto-enhancement for new entity types
- ✅ Consistent with unstructured data path (stores in raw_fragments)
- ✅ Schema can be discovered automatically

**Cons**:
- ⚠️ Data not immediately queryable via normal entity queries (until schema is enhanced)
- ⚠️ Requires auto-enhancement to work for data to be useful

### Option 2: Store in Both Places

**Change**: When no schema exists, store in both `observations` (for queryability) and `raw_fragments` (for discovery):

```typescript
} else {
  // No schema found - store all fields in observations AND raw_fragments
  validFields = fieldsToValidate;  // For queryability
  unknownFields = fieldsToValidate; // For schema discovery
}
```

**Pros**:
- ✅ Data immediately queryable
- ✅ Auto-enhancement can discover fields
- ✅ Best of both worlds

**Cons**:
- ⚠️ Data duplication (stored twice)
- ⚠️ More storage overhead

### Option 3: Keep Current Behavior, Document Clearly

**Change**: Keep current behavior but document it clearly and provide manual schema creation tools.

**Pros**:
- ✅ No code changes
- ✅ Data immediately queryable

**Cons**:
- ❌ No auto-enhancement for new entity types
- ❌ Manual work required

---

## Current Workaround

To enable auto-enhancement for new entity types:

1. **Manually create a minimal schema** with one or two known fields
2. **Re-import the data**
3. **Remaining fields** will be stored in `raw_fragments`
4. **Auto-enhancement** can then discover them

Example:
```sql
-- Create minimal schema for tasks_sample
INSERT INTO schema_registry (entity_type, schema_version, schema_definition, reducer_config, active)
VALUES (
  'tasks_sample',
  '1.0',
  '{"fields": {"id": {"type": "string", "required": true}}}'::jsonb,
  '{"merge_policies": {"id": {"strategy": "last_write"}}}'::jsonb,
  true
);
```

---

## Conclusion

The current behavior is **inconsistent** and **prevents auto-enhancement** for new entity types in structured data paths. Recommendation: **Option 1** (treat all fields as unknown when no schema exists) to enable automatic schema discovery.
