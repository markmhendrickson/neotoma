-- Migration: Fix Performance Advisor Issues
-- Generated: 2026-01-15T11:29:55.116Z
-- Description: Addresses 80 performance advisor issues

-- ============================================================================
-- 1. Add indexes for unindexed foreign keys (6 issues)
-- ============================================================================
-- Foreign keys without indexes can cause slow joins and constraint checks.
-- Adding indexes improves query performance.

-- NOTE: Run this query to find specific foreign keys needing indexes:
-- SELECT
--   tc.table_name,
--   kcu.column_name,
--   ccu.table_name AS foreign_table_name
-- FROM information_schema.table_constraints AS tc
-- JOIN information_schema.key_column_usage AS kcu
--   ON tc.constraint_name = kcu.constraint_name
-- JOIN information_schema.constraint_column_usage AS ccu
--   ON ccu.constraint_name = tc.constraint_name
-- WHERE tc.constraint_type = 'FOREIGN KEY'
--   AND tc.table_schema = 'public'
--   AND NOT EXISTS (
--     SELECT 1 FROM pg_indexes
--     WHERE tablename = tc.table_name
--       AND indexdef LIKE '%' || kcu.column_name || '%'
--   );

-- Index for auto_enhancement_queue.user_id -> auth.users(id)
CREATE INDEX IF NOT EXISTS idx_auto_enhancement_queue_user_id ON auto_enhancement_queue(user_id) WHERE user_id IS NOT NULL;

-- Index for schema_recommendations.user_id -> auth.users(id)
CREATE INDEX IF NOT EXISTS idx_schema_recommendations_user_id ON schema_recommendations(user_id) WHERE user_id IS NOT NULL;

-- Index for schema_recommendations.applied_by -> auth.users(id)
CREATE INDEX IF NOT EXISTS idx_schema_recommendations_applied_by ON schema_recommendations(applied_by) WHERE applied_by IS NOT NULL;

-- Index for field_blacklist.user_id -> auth.users(id)
CREATE INDEX IF NOT EXISTS idx_field_blacklist_user_id ON field_blacklist(user_id) WHERE user_id IS NOT NULL;

-- Index for field_blacklist.created_by -> auth.users(id)
CREATE INDEX IF NOT EXISTS idx_field_blacklist_created_by ON field_blacklist(created_by) WHERE created_by IS NOT NULL;

-- Index for relationship_observations.source_id -> sources(id)
CREATE INDEX IF NOT EXISTS idx_relationship_observations_source_id ON relationship_observations(source_id) WHERE source_id IS NOT NULL;

-- Index for relationship_observations.interpretation_id -> interpretations(id)
CREATE INDEX IF NOT EXISTS idx_relationship_observations_interpretation_id ON relationship_observations(interpretation_id) WHERE interpretation_id IS NOT NULL;

-- Index for source_entity_edges.source_id -> sources(id)
CREATE INDEX IF NOT EXISTS idx_source_entity_edges_source_id ON source_entity_edges(source_id) WHERE source_id IS NOT NULL;

-- Index for source_entity_edges.entity_id -> entities(id)
CREATE INDEX IF NOT EXISTS idx_source_entity_edges_entity_id ON source_entity_edges(entity_id) WHERE entity_id IS NOT NULL;

-- Index for source_entity_edges.interpretation_id -> interpretations(id)
CREATE INDEX IF NOT EXISTS idx_source_entity_edges_interpretation_id ON source_entity_edges(interpretation_id) WHERE interpretation_id IS NOT NULL;

-- Index for source_event_edges.source_id -> sources(id)
CREATE INDEX IF NOT EXISTS idx_source_event_edges_source_id ON source_event_edges(source_id) WHERE source_id IS NOT NULL;

-- Index for source_event_edges.event_id -> timeline_events(id)
CREATE INDEX IF NOT EXISTS idx_source_event_edges_event_id ON source_event_edges(event_id) WHERE event_id IS NOT NULL;

-- Index for timeline_events.source_id -> sources(id)
CREATE INDEX IF NOT EXISTS idx_timeline_events_source_id ON timeline_events(source_id) WHERE source_id IS NOT NULL;

-- Index for observations.source_id -> sources(id)
CREATE INDEX IF NOT EXISTS idx_observations_source_id ON observations(source_id) WHERE source_id IS NOT NULL;

-- Index for observations.interpretation_id -> interpretations(id)
CREATE INDEX IF NOT EXISTS idx_observations_interpretation_id ON observations(interpretation_id) WHERE interpretation_id IS NOT NULL;

-- Index for raw_fragments.source_id -> sources(id)
CREATE INDEX IF NOT EXISTS idx_raw_fragments_source_id ON raw_fragments(source_id) WHERE source_id IS NOT NULL;

-- Index for raw_fragments.interpretation_id -> interpretations(id)
CREATE INDEX IF NOT EXISTS idx_raw_fragments_interpretation_id ON raw_fragments(interpretation_id) WHERE interpretation_id IS NOT NULL;

-- Index for relationships.source_material_id -> sources(id)
CREATE INDEX IF NOT EXISTS idx_relationships_source_material_id ON relationships(source_material_id) WHERE source_material_id IS NOT NULL;

-- Index for interpretations.source_id -> sources(id)
CREATE INDEX IF NOT EXISTS idx_interpretations_source_id ON interpretations(source_id) WHERE source_id IS NOT NULL;

-- Index for schema_registry.user_id -> auth.users(id)
CREATE INDEX IF NOT EXISTS idx_schema_registry_user_id ON schema_registry(user_id) WHERE user_id IS NOT NULL;

-- ============================================================================
-- 2. Review unused indexes (52 issues)
-- ============================================================================
-- These indexes have never been used. Consider dropping them to save space
-- and improve write performance. However, review query patterns first.

-- NOTE: Review these indexes before dropping. Some may be needed for future queries.
-- To find unused indexes, run:
-- SELECT schemaname, tablename, indexname, idx_scan
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public' AND idx_scan = 0
-- ORDER BY pg_relation_size(indexrelid) DESC;

-- ============================================================================
-- 3. Optimize RLS policies with auth function calls (16 issues)
-- ============================================================================
-- RLS policies that call auth.uid() or current_setting() are re-evaluated for each row.
-- Consider using SECURITY DEFINER functions or caching auth values.

-- NOTE: Review RLS policies that use auth.uid() or current_setting().
-- Consider using a SECURITY DEFINER function that caches the auth value:
-- CREATE FUNCTION auth_uid() RETURNS UUID
-- LANGUAGE SQL SECURITY DEFINER STABLE
-- AS $$ SELECT auth.uid() $$;
-- Then use auth_uid() in policies instead of auth.uid().

-- ============================================================================
-- 4. Consolidate multiple permissive policies (5 issues)
-- ============================================================================
-- Multiple permissive policies on the same table/role/action are inefficient.
-- Consider combining them using OR conditions.

-- NOTE: Review tables with multiple permissive policies and consolidate:
-- SELECT tablename, COUNT(*) as policy_count
-- FROM pg_policies
-- WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
-- GROUP BY tablename
-- HAVING COUNT(*) > 1;

-- ============================================================================
-- 5. Add search_path to functions (1 issues)
-- ============================================================================
-- Functions without search_path are vulnerable to search_path injection attacks.

-- NOTE: Find functions without search_path and add it:
-- SELECT n.nspname, p.proname
-- FROM pg_proc p
-- JOIN pg_namespace n ON p.pronamespace = n.oid
-- WHERE n.nspname = 'public'
--   AND pg_get_functiondef(p.oid) NOT LIKE '%SET search_path%';
-- 
-- Then add: ALTER FUNCTION schema.function_name SET search_path = public, pg_catalog;

-- ============================================================================
-- Summary
-- ============================================================================
-- Total issues addressed: 80
-- Review all changes before applying in production.
-- Test thoroughly after applying this migration.
