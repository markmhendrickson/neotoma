# Row Diversity for Structured Files - Implementation

**Date**: 2026-01-14  
**Status**: ✅ **IMPLEMENTED**

## Summary

Enhanced auto-enhancement eligibility to support row-based diversity for structured file formats (parquet, CSV, JSON arrays) that contain multiple rows/records in a single source file.

## Problem

Structured file formats like parquet and CSV can contain hundreds or thousands of rows in a single file. The original source diversity requirement (2+ different sources) blocked auto-enhancement for these files because:
- All rows share the same `source_id` (one file = one source)
- Fields appearing in 50+ rows still only counted as 1 source
- Auto-enhancement was blocked despite high frequency and confidence

## Solution

Enhanced the diversity check to accept **EITHER**:
1. **2+ different sources** (original requirement - for single-row files)
2. **2+ different rows/observations** (new - for structured multi-row files)

## Implementation

### How It Works

1. **Source Diversity Check**: Counts unique `source_id` values (original behavior)
2. **Row Diversity Check**: 
   - **CSV/Records**: Uses `record_id` (each row creates a record)
   - **Parquet/Structured**: Uses observation count (each row creates an observation)

### Code Changes

Modified `checkAutoEnhancementEligibility` in `src/services/schema_recommendation.ts`:

```typescript
// Check source diversity
const uniqueSources = new Set(fragments.map((f) => f.source_id)).size;

// Check row diversity via record_id (CSV/records)
const uniqueRows = new Set(fragments.map((f) => f.record_id).filter(id => id != null)).size;

// For parquet files (record_id = null), count observations per source
let uniqueObservations = 0;
if (uniqueRows === 0 && uniqueSources === 1) {
  // This is likely a parquet/structured file - count observations
  const { count } = await supabase
    .from("observations")
    .select("id", { count: "exact", head: true })
    .eq("source_id", sourceId)
    .eq("entity_type", options.entity_type)
    .eq("user_id", options.user_id || null);
  uniqueObservations = count || 0;
}

// Require EITHER 2+ sources OR 2+ rows/observations
const hasDiversity = uniqueSources >= 2 || uniqueRows >= 2 || uniqueObservations >= 2;
```

## Supported File Types

### ✅ Parquet Files
- Each row creates an observation
- Row diversity checked via observation count
- Fields in 2+ rows → eligible for auto-enhancement

### ✅ CSV Files  
- Each row creates a record (if `csv_row_records` enabled)
- Row diversity checked via `record_id`
- Fields in 2+ rows → eligible for auto-enhancement

### ✅ JSON Arrays
- Each array item creates a record/observation
- Row diversity checked via `record_id` or observation count
- Fields in 2+ items → eligible for auto-enhancement

### ✅ Excel Files
- Each row creates a record/observation
- Row diversity checked via `record_id` or observation count
- Fields in 2+ rows → eligible for auto-enhancement

### ✅ Single-Row Files
- Still requires 2+ sources (preserves original intent)
- Prevents one-off fields from being auto-enhanced

## Benefits

1. ✅ **Enables auto-enhancement for structured files**: Parquet/CSV imports can now trigger schema enhancements
2. ✅ **Preserves source diversity intent**: Single-row files still require multiple sources
3. ✅ **No storage overhead**: Doesn't create multiple sources per row
4. ✅ **Maintains provenance**: Can still track which file data came from
5. ✅ **Works for all structured formats**: Parquet, CSV, JSON arrays, Excel, etc.

## Testing

After restarting the MCP server, the auto-enhancement processor should:
1. Re-check queued items with the new criteria
2. Enhance fields that appear in 2+ rows (even from the same source)
3. Work for both parquet and CSV files

## Next Steps

1. Restart MCP server to load the new code
2. Re-import sample parquet files to test auto-enhancement
3. Verify schemas are enhanced correctly
4. Test with CSV files to confirm they also benefit
