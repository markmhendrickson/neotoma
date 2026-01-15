# Unused Indexes Review

**Generated**: 2026-01-15  
**Purpose**: Track unused indexes for future review and potential removal

## Overview

This document tracks indexes that have never been used according to Supabase Performance Advisor. These indexes should be reviewed periodically as query patterns evolve.

## Current Status

**Total unused indexes**: ~60-65 (as of 2026-01-15)

**Categories**:
1. **New table indexes** - Indexes on recently created tables that haven't been queried yet
2. **Optimization indexes** - Indexes for specific query patterns that may not have occurred yet
3. **Potentially removable** - Indexes that may no longer be needed

## Review Strategy

### When to Review

- **Quarterly**: Review unused index list and assess based on query patterns
- **Before major releases**: Check if unused indexes are still needed
- **After significant feature changes**: Re-evaluate index requirements

### Review Process

1. **Query for unused indexes**:
   ```sql
   SELECT 
     schemaname,
     tablename,
     indexrelname as indexname,
     pg_size_pretty(pg_relation_size(indexrelid)) as size,
     idx_scan,
     idx_tup_read,
     idx_tup_fetch
   FROM pg_stat_user_indexes
   WHERE schemaname = 'public' 
     AND idx_scan = 0
     AND indexrelname NOT LIKE '%_pkey'
   ORDER BY pg_relation_size(indexrelid) DESC;
   ```

2. **Categorize each index**:
   - Is the table actively used?
   - Is the index for a common query pattern?
   - What's the storage cost (size)?
   - Is there a similar index that's being used instead?

3. **Make decision**:
   - **Keep**: Index is needed for expected query patterns
   - **Monitor**: Index may be needed, check again next quarter
   - **Remove**: Index is clearly not needed

## Known Unused Indexes

### Recently Created Tables

These tables were recently created, so their indexes haven't been used yet. **Keep all indexes for now.**

**schema_recommendations**:
- All indexes are new, monitoring needed after users start creating recommendations

**auto_enhancement_queue**:
- All indexes are new, monitoring needed after auto-enhancement is used

**field_blacklist**:
- All indexes are new, monitoring needed after blacklist is populated

**relationship_observations** and **relationship_snapshots**:
- All indexes are new, monitoring needed after relationship data is ingested

### Active Tables with Unused Indexes

**To be determined** - Query database after application has been in use for at least 30 days to identify which indexes on active tables are truly unused.

## Maintenance

### Adding to This Document

When new indexes are identified as unused:
1. Add to appropriate category above
2. Note the date when first identified as unused
3. Set a review date (usually 90 days later)

### Removing from This Document

When an index starts being used or is dropped:
1. Remove from this document
2. Note the action taken (kept or dropped)
3. Update the "Total unused indexes" count

## Related Documents

- [`docs/developer/supabase_advisors.md`](./supabase_advisors.md) - Advisor check documentation
- [`scripts/check_supabase_advisors.ts`](../../scripts/check_supabase_advisors.ts) - Automated advisor checks

## Next Review Date

**Recommended**: 2026-04-15 (90 days from 2026-01-15)
