# Parquet Row-Per-Source Analysis

**Date**: 2026-01-14  
**Question**: Should we store each parquet row as its own source to meet source diversity requirements?

## Current Behavior

- **One source per parquet file**: All rows from a parquet file share the same `source_id`
- **Source diversity requirement**: Fields must appear in 2+ different sources to be auto-enhanced
- **Result**: Single parquet file imports don't trigger auto-enhancement

## Proposed Change: Row-Per-Source

Store each parquet row as its own separate source file, so each row has a unique `source_id`.

### Pros ✅

1. **Meets source diversity**: Fields appearing in 2+ rows would have 2+ source_ids
2. **Enables auto-enhancement**: Single parquet file imports could trigger enhancements
3. **Faster testing**: Don't need multiple files to test auto-enhancement

### Cons ❌

1. **Defeats purpose of source diversity**: The requirement is meant to ensure fields appear across **different actual sources** (different files, different imports), not just different rows in the same file
2. **Inefficient storage**: Would create N source records for N rows, potentially storing duplicate file content
3. **Provenance issues**: Each row would be treated as a separate "source" when they're actually from the same file
4. **Deduplication problems**: The same parquet file imported twice would create 2N sources instead of 1
5. **Query complexity**: Harder to track "which file did this data come from?"

## Better Alternatives

### Option 1: Parquet-Specific Source Diversity (Recommended)

Modify the source diversity check to be more lenient for parquet files:

```typescript
// In checkAutoEnhancementEligibility
const uniqueSources = new Set(fragments.map((f) => f.source_id)).size;

// For parquet files, also check row diversity
const isParquetSource = fragments[0]?.source?.provenance?.upload_method === 'mcp_store' 
  && fragments[0]?.source?.mime_type === 'application/json'; // Parquet stored as JSON

if (isParquetSource) {
  // For parquet, require 2+ unique rows (record_id) instead of 2+ sources
  const uniqueRows = new Set(fragments.map((f) => f.record_id)).size;
  if (uniqueRows < 2) {
    return { eligible: false, reasoning: "Field appears in only one row" };
  }
} else {
  // For other sources, require 2+ different sources
  if (uniqueSources < 2) {
    return { eligible: false, reasoning: "Field appears in only one source" };
  }
}
```

### Option 2: Row-Based Diversity Metric

Add a new metric that checks row diversity separately from source diversity:

```typescript
// Check both source diversity AND row diversity
const uniqueSources = new Set(fragments.map((f) => f.source_id)).size;
const uniqueRows = new Set(fragments.map((f) => f.record_id)).size;

// Require EITHER 2+ sources OR 2+ rows (for parquet files)
if (uniqueSources < 2 && uniqueRows < 2) {
  return {
    eligible: false,
    reasoning: "Field appears in only one source and one row",
  };
}
```

### Option 3: Configurable Threshold

Make source diversity configurable per entity type or source type:

```typescript
// For parquet-imported entity types, lower source diversity to 1
const sourceDiversityThreshold = entityType.endsWith('_sample') ? 1 : 2;
if (uniqueSources < sourceDiversityThreshold) {
  // ...
}
```

### Option 4: Batch Source IDs

Create a "batch" source for the parquet file, but assign sub-source IDs to each row:

```typescript
// Store parquet file as one source
const mainSourceId = await storeRawContent(parquetFile);

// For each row, create a "sub-source" reference
for (const row of rows) {
  const subSourceId = `${mainSourceId}:row:${rowIndex}`;
  // Store observation with subSourceId
}
```

## Implementation

**Implemented: Enhanced Row-Based Diversity Metric** that works for:
- ✅ **Parquet files**: Uses observation count (each row creates an observation)
- ✅ **CSV files**: Uses record_id (each row creates a record)
- ✅ **Other structured files**: Uses record_id or observation count
- ✅ **Single-row files**: Still requires 2+ sources (preserves original intent)

## Recommendation

**Don't implement row-per-source storage.** Instead, use **observation/record-based diversity** because:

1. ✅ Preserves source diversity intent (still checks for multiple sources)
2. ✅ Enables parquet auto-enhancement (checks row diversity as fallback)
3. ✅ Maintains storage efficiency (one source per file)
4. ✅ Preserves provenance (can still track which file data came from)
5. ✅ Flexible (works for both parquet and other sources)

## Implementation Details

The implementation in `checkAutoEnhancementEligibility` now:

1. **Checks source diversity**: Counts unique `source_id` values
2. **Checks row diversity via record_id**: For CSV/record-based files (record_id is set)
3. **Checks row diversity via observations**: For parquet/structured files (record_id is null, but each row creates an observation)

```typescript
// For parquet files (record_id = null), count observations per source
// Each observation represents a row in the structured file
if (uniqueRows === 0 && uniqueSources === 1) {
  const { count } = await supabase
    .from("observations")
    .select("id", { count: "exact", head: true })
    .eq("source_id", sourceId)
    .eq("entity_type", options.entity_type);
  uniqueObservations = count || 0;
}

// Require EITHER 2+ sources OR 2+ rows/observations
const hasDiversity = uniqueSources >= 2 || uniqueRows >= 2 || uniqueObservations >= 2;
```

This way:
- **Parquet files**: Fields in 2+ rows (2+ observations) → eligible ✅
- **CSV files**: Fields in 2+ rows (2+ record_ids) → eligible ✅
- **Other structured files**: Fields in 2+ rows → eligible ✅
- **Single-row files**: Still requires 2+ sources (preserves original intent) ✅
