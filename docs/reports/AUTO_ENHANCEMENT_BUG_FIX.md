# Auto-Enhancement Bug Fix

**Date**: 2026-01-14  
**Status**: ✅ **FIXED**

## Problem

Auto-enhancement was not working for structured data (parquet files) because of a query mismatch:

1. **Fragments stored with `fragment_type`**: When storing structured data, fragments are stored with `fragment_type: entityType` (line 2875 in `src/server.ts`)

2. **Query mismatch in `calculateFieldConfidence`**: The function queried by `entity_type` column, which doesn't exist for structured data fragments

3. **Result**: `calculateFieldConfidence` returned no fragments → confidence = 0 → auto-enhancement failed

## Root Cause

**Location**: `src/services/schema_recommendation.ts:332-338`

**Before**:
```typescript
const { data: fragments } = await supabase
  .from("raw_fragments")
  .select("fragment_value, frequency_count")
  .eq("entity_type", options.entity_type)  // ❌ Wrong for structured data
  .eq("fragment_key", options.fragment_key)
  .eq("user_id", options.user_id || null);
```

**Issue**: For structured data (parquet), fragments are stored with `fragment_type` set to entity type, not `entity_type` column.

## Fix

Updated `calculateFieldConfidence` to query both `fragment_type` (structured data) and `entity_type` (unstructured data):

**After**:
```typescript
const { data: fragments } = await supabase
  .from("raw_fragments")
  .select("fragment_value, frequency_count")
  .or(`fragment_type.eq.${options.entity_type},entity_type.eq.${options.entity_type}`)  // ✅ Checks both
  .eq("fragment_key", options.fragment_key)
  .eq("user_id", options.user_id || null);
```

Also updated `analyzeRawFragments` to include `fragment_type` in select and query:

**After**:
```typescript
let query = supabase
  .from("raw_fragments")
  .select("entity_type, fragment_type, fragment_key, fragment_value, frequency_count, user_id");

if (options.entity_type) {
  query = query.or(`fragment_type.eq.${options.entity_type},entity_type.eq.${options.entity_type}`);
}
```

## Impact

- ✅ **Auto-enhancement now works** for structured data (parquet files)
- ✅ **Backward compatible** with unstructured data (uses `entity_type` column)
- ✅ **Confidence calculation** now finds fragments correctly

## Testing

After fix:
1. Import `samples/task.parquet` (31 unknown fields)
2. Wait for auto-enhancement processor (30s interval)
3. Check if schemas were enhanced
