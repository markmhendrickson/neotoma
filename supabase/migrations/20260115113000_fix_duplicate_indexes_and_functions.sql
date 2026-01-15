-- Migration: Fix Duplicate Indexes and Function Search Path
-- Generated: 2026-01-15
-- Description: Removes duplicate indexes and adds search_path to functions

-- ============================================================================
-- 1. Remove duplicate indexes
-- ============================================================================
-- Some indexes were created with different names but same definition.
-- Keep the ones with standard naming (idx_table_column) and remove duplicates.

-- Check for duplicates first (run manually to identify):
-- SELECT 
--   schemaname, tablename, indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
-- ORDER BY tablename, indexdef;

-- Remove duplicate indexes (new ones with _id suffix are duplicates of existing ones)
-- The existing indexes already cover these columns, so the new ones are redundant
DROP INDEX IF EXISTS idx_source_entity_edges_source_id; -- Duplicate of idx_source_entity_edges_source
DROP INDEX IF EXISTS idx_source_event_edges_source_id; -- Duplicate of idx_source_event_edges_source
DROP INDEX IF EXISTS idx_timeline_events_source_id; -- Duplicate of idx_timeline_events_source

-- ============================================================================
-- 2. Add search_path to functions
-- ============================================================================

-- Fix auth_uid function (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'auth_uid') THEN
    ALTER FUNCTION public.auth_uid() SET search_path = public, pg_catalog;
  END IF;
END $$;

-- Find and fix other functions without search_path:
-- SELECT n.nspname, p.proname
-- FROM pg_proc p
-- JOIN pg_namespace n ON p.pronamespace = n.oid
-- WHERE n.nspname = 'public'
--   AND p.prokind = 'f'
--   AND pg_get_functiondef(p.oid) NOT LIKE '%SET search_path%';

-- Then add: ALTER FUNCTION schema.function_name SET search_path = public, pg_catalog;
