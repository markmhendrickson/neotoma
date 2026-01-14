# Schema Enhancement Status for Sample Parquet Imports

**Date**: 2026-01-14  
**Status**: ⚠️ **NOT ENHANCED** - Blocked by source diversity requirement

## Summary

After importing sample parquet files, **schemas were NOT automatically enhanced** due to the source diversity requirement in the auto-enhancement eligibility criteria.

## Why Schemas Weren't Enhanced

### Auto-Enhancement Eligibility Requirements

For a field to be auto-enhanced, it must meet ALL of these criteria:

1. ✅ **Frequency Threshold**: ≥ 3 occurrences (default)
2. ✅ **Confidence**: ≥ 0.85 (85% minimum)
3. ❌ **Source Diversity**: ≥ 2 different sources (REQUIRED)

### The Problem

When importing a single parquet file:
- All data comes from **ONE source** (the parquet file)
- Even if a field appears 50 times, it's still only from 1 source
- The source diversity requirement (2+ sources) **blocks** auto-enhancement

### Code Reference

From `src/services/schema_recommendation.ts` (lines 155-163):

```typescript
// 6. Check source diversity (2+ different sources)
const uniqueSources = new Set(fragments.map((f) => f.source_id)).size;
if (uniqueSources < 2) {
  return {
    eligible: false,
    confidence: confidenceResult.confidence,
    reasoning: "Field appears in only one source (no diversity)",
  };
}
```

## What Happened

1. ✅ **Raw fragments were stored**: Unknown fields were stored in `raw_fragments` table
2. ✅ **Queue entries were created**: `queueAutoEnhancementCheck()` was called for each unknown field
3. ✅ **Auto-enhancement processor ran**: Background processor checked eligibility
4. ❌ **Enhancement blocked**: All fields failed the source diversity check

## Test Results

- **tasks_sample**: 50 entities imported, 0 schema enhancements
- **crypto_transactions_sample**: 50 entities imported, 0 schema enhancements  
- **purchases_sample**: 50 entities imported, 0 schema enhancements
- **domains_sample**: 1 entity imported, 0 schema enhancements

## Solutions

### Option 1: Import Multiple Files (Recommended)
Import multiple parquet files for the same entity type. Once a field appears in 2+ different sources, it will become eligible for auto-enhancement.

### Option 2: Lower Source Diversity Requirement (For Testing)
Temporarily lower the source diversity requirement to 1 for testing purposes:

```typescript
// In checkAutoEnhancementEligibility
if (uniqueSources < 1) { // Changed from 2 to 1
  // ...
}
```

### Option 3: Manual Schema Enhancement
Use the `update_schema_incremental` MCP tool to manually add fields to schemas.

## Next Steps

1. **Import more sample files** for the same entity types to meet source diversity
2. **Wait for auto-enhancement processor** to run (every 30 seconds)
3. **Check schema recommendations** after multiple imports
4. **Verify enhancements** once source diversity is met

## Conclusion

The auto-enhancement system is working correctly, but the **source diversity requirement** is intentionally conservative to prevent one-off fields from being auto-enhanced. This is a **feature, not a bug** - it ensures only fields that appear consistently across multiple sources are promoted to schema fields.
