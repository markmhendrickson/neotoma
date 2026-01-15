-- Migration: Remove Duplicate Indexes
-- Created: 2026-01-15
-- Description: Removes duplicate indexes to improve write performance and reduce storage
--              Addresses 3 duplicate_index warnings

-- ============================================================================
-- Problem: Three tables have identical indexes with different names
-- ============================================================================

-- auto_enhancement_queue table:
--   - idx_auto_enhancement_queue_user_id (duplicate, newer)
--   - idx_enhancement_queue_user (original, keep this one)

-- field_blacklist table:
--   - idx_field_blacklist_user_id (duplicate, newer)
--   - idx_field_blacklist_user (original, keep this one)

-- schema_registry table:
--   - idx_schema_registry_user_id (duplicate, newer)
--   - idx_schema_registry_user (original, keep this one)

-- ============================================================================
-- Solution: Drop the newer duplicate indexes (with _id suffix)
-- ============================================================================

-- Drop duplicate index on auto_enhancement_queue
DROP INDEX IF EXISTS idx_auto_enhancement_queue_user_id;

-- Drop duplicate index on field_blacklist
DROP INDEX IF EXISTS idx_field_blacklist_user_id;

-- Drop duplicate index on schema_registry
DROP INDEX IF EXISTS idx_schema_registry_user_id;

-- ============================================================================
-- Summary
-- ============================================================================
-- Removed 3 duplicate indexes
-- Kept original indexes with standard naming convention (without _id suffix)
-- Expected result: duplicate_index warnings reduced from 3 to 0
-- Performance impact: Improved write performance, reduced storage overhead
