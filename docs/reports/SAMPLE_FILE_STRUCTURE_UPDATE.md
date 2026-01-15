# Sample File Structure Update

**Date**: 2026-01-14  
**Status**: ✅ **IMPLEMENTED**

## Problem

Sample parquet files were being created with names like `tasks_sample.parquet`, which caused:
1. Entity type to be inferred as `tasks_sample` (not `task`)
2. No matching schema exists for `tasks_sample`
3. All fields treated as valid (no schema → no unknown fields)
4. Auto-enhancement cannot work (no raw_fragments to analyze)

## Solution

Updated sample file creation script to:
1. **Store samples in dedicated directory**: `$DATA_DIR/samples/`
2. **Use entity type as filename**: `$DATA_DIR/samples/task.parquet` (singular, matches schema)
3. **Preserve entity type inference**: Matches the logic in `parquet_reader.ts`

## Changes

### Script: `scripts/create_sample_parquet_files_simple.sh`

**Before**:
- Samples stored as: `$DATA_DIR/tasks/tasks_sample.parquet`
- Entity type inferred: `tasks_sample` ❌

**After**:
- Samples stored as: `$DATA_DIR/samples/task.parquet`
- Entity type inferred: `task` ✅ (matches existing schema)

### Entity Type Inference

Added `infer_entity_type()` function that matches the logic in `src/services/parquet_reader.ts`:
- Handles pluralization: `tasks` → `task`
- Handles special cases: `companies` → `company`, `taxes` → `tax`
- Removes suffixes: `tasks_missing_gid` → `task`

## Benefits

1. ✅ **Schema matching**: Sample files use entity types that match existing schemas
2. ✅ **Auto-enhancement works**: Unknown fields will be stored in `raw_fragments`
3. ✅ **Consistent naming**: Entity types match between full files and samples
4. ✅ **Better organization**: All samples in one directory

## Example

**Original file**: `$DATA_DIR/tasks/tasks.parquet`
- Entity type: `task` ✅
- Schema exists: Yes ✅

**Sample file (old)**: `$DATA_DIR/tasks/tasks_sample.parquet`
- Entity type: `tasks_sample` ❌
- Schema exists: No ❌

**Sample file (new)**: `$DATA_DIR/samples/task.parquet`
- Entity type: `task` ✅
- Schema exists: Yes ✅
- Unknown fields → `raw_fragments` → Auto-enhancement works! ✅

## Next Steps

1. Re-run sample creation script to generate files in new location
2. Test importing samples to verify:
   - Entity type matches schema
   - Unknown fields go to `raw_fragments`
   - Auto-enhancement can discover new fields
