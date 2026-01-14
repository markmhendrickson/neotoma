-- Enable Row Level Security (RLS) on tables that were created without RLS
-- Migration: 20260127000007_enable_rls_on_unrestricted_tables.sql
-- 
-- This migration addresses Security Advisor warnings for:
-- - schema_recommendations
-- - field_blacklist
-- - auto_enhancement_queue

-- ============================================================================
-- 1. Enable RLS on schema_recommendations
-- ============================================================================

ALTER TABLE schema_recommendations ENABLE ROW LEVEL SECURITY;

-- Users can read their own recommendations
DROP POLICY IF EXISTS "Users read own schema_recommendations" ON schema_recommendations;
CREATE POLICY "Users read own schema_recommendations" ON schema_recommendations
  FOR SELECT USING (user_id = auth.uid());

-- Service role has full access for mutations
DROP POLICY IF EXISTS "Service role full access to schema_recommendations" ON schema_recommendations;
CREATE POLICY "Service role full access to schema_recommendations" ON schema_recommendations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 2. Enable RLS on field_blacklist
-- ============================================================================

ALTER TABLE field_blacklist ENABLE ROW LEVEL SECURITY;

-- Users can read global blacklist entries and their own user-specific entries
DROP POLICY IF EXISTS "Users read field_blacklist" ON field_blacklist;
CREATE POLICY "Users read field_blacklist" ON field_blacklist
  FOR SELECT USING (
    scope = 'global' OR 
    (scope = 'user' AND user_id = auth.uid())
  );

-- Service role has full access for mutations
DROP POLICY IF EXISTS "Service role full access to field_blacklist" ON field_blacklist;
CREATE POLICY "Service role full access to field_blacklist" ON field_blacklist
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 3. Enable RLS on auto_enhancement_queue
-- ============================================================================

ALTER TABLE auto_enhancement_queue ENABLE ROW LEVEL SECURITY;

-- Users can read their own queue entries
DROP POLICY IF EXISTS "Users read own auto_enhancement_queue" ON auto_enhancement_queue;
CREATE POLICY "Users read own auto_enhancement_queue" ON auto_enhancement_queue
  FOR SELECT USING (user_id = auth.uid());

-- Service role has full access for mutations
DROP POLICY IF EXISTS "Service role full access to auto_enhancement_queue" ON auto_enhancement_queue;
CREATE POLICY "Service role full access to auto_enhancement_queue" ON auto_enhancement_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);
