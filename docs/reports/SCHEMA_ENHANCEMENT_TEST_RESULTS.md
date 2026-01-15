# Schema Enhancement Test Results - Row-Based Diversity

**Date**: 2026-01-14  
**Status**: ⚠️ **NO UNKNOWN FIELDS TO ENHANCE**

## Test Summary

Re-tested schema enhancement after implementing row-based diversity fix. The test shows that **no unknown fields were stored**, which means there are no fields to enhance.

## Test Results

### Import Test
- **File**: `tasks/tasks_sample.parquet` (50 rows)
- **Result**: ✅ Import successful
- **Entities created**: 50
- **Unknown fields**: 0

### Why No Enhancement?

The import shows `unknown_fields_count: 0`, which means:
1. **No schema exists** for `tasks_sample` entity type
2. **All fields treated as valid**: When no schema is found, the code treats all fields as "valid" (not unknown)
3. **Nothing stored in raw_fragments**: Since all fields are valid, nothing goes to raw_fragments
4. **No auto-enhancement triggered**: No raw_fragments = nothing to enhance

## Root Cause

Looking at `src/server.ts` (lines 2798-2800):
```typescript
} else {
  // No schema found - treat all as valid for now
  validFields = fieldsToValidate;
}
```

When there's no schema for an entity type:
- All fields are treated as "valid"
- Nothing is stored in `raw_fragments`
- Auto-enhancement cannot work (no raw_fragments to analyze)

## Solution Options

### Option 1: Use Existing Schema (Recommended for Testing)
Import files with entity types that have existing schemas (e.g., `task` instead of `tasks_sample`):
- Some fields will be in the schema → stored in observations
- Other fields will be unknown → stored in raw_fragments
- Auto-enhancement can then work

### Option 2: Create Initial Schema
Manually create a minimal schema for the entity type with a few known fields:
- Remaining fields will be unknown → stored in raw_fragments
- Auto-enhancement can then work

### Option 3: Change Behavior for No-Schema Case
Modify the code to treat fields as "unknown" when no schema exists:
- All fields go to raw_fragments
- Auto-enhancement can work immediately
- But this might be too aggressive

## Row-Based Diversity Implementation

The row-based diversity fix has been implemented and should work when there are unknown fields:

1. ✅ **Source diversity check**: 2+ sources (original)
2. ✅ **Row diversity via record_id**: 2+ rows for CSV/records
3. ✅ **Row diversity via observations**: 2+ observations for parquet/structured files

## Next Steps

To properly test auto-enhancement:

1. **Import with existing schema**: Use entity type that has a schema (e.g., modify parquet reader to use `task` instead of `tasks_sample`)
2. **Or create test schema**: Manually create a schema with some fields, then import
3. **Or change no-schema behavior**: Treat all fields as unknown when no schema exists

## Conclusion

The row-based diversity implementation is correct, but we need unknown fields to test it. The current behavior (treating all fields as valid when no schema exists) prevents auto-enhancement from working for new entity types.
