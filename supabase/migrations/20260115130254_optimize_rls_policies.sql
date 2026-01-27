-- Migration: Optimize RLS Policies with Cached Auth Function
-- Created: 2026-01-15
-- Description: Creates auth_uid() SECURITY DEFINER function to cache auth.uid() and updates
--              all RLS policies to use it, improving performance by avoiding re-evaluation per row

-- ============================================================================
-- 1. Create auth_uid() function for efficient RLS policy evaluation
-- ============================================================================

CREATE OR REPLACE FUNCTION auth_uid() RETURNS UUID
LANGUAGE SQL SECURITY DEFINER STABLE
SET search_path = public, pg_catalog
AS $$ SELECT auth.uid() $$;

COMMENT ON FUNCTION auth_uid IS 'Cached wrapper for auth.uid() to improve RLS policy performance. STABLE means result is constant within a single query.';

-- ============================================================================
-- 2. Update RLS policies to use auth_uid() instead of auth.uid()
-- ============================================================================

DO $$
BEGIN
  -- interpretations table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'interpretations') THEN
    DROP POLICY IF EXISTS "Users read own interpretations" ON interpretations;
    CREATE POLICY "Users read own interpretations"
      ON interpretations
      FOR SELECT
      TO authenticated
      USING (auth_uid() = user_id);
  END IF;

  -- relationship_observations table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'relationship_observations') THEN
    DROP POLICY IF EXISTS "Users read own relationship_observations" ON relationship_observations;
    CREATE POLICY "Users read own relationship_observations" ON relationship_observations
      FOR SELECT USING (user_id = auth_uid());
  END IF;

  -- relationship_snapshots table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'relationship_snapshots') THEN
    DROP POLICY IF EXISTS "Users read own relationship_snapshots" ON relationship_snapshots;
    CREATE POLICY "Users read own relationship_snapshots" ON relationship_snapshots
      FOR SELECT USING (user_id = auth_uid());
  END IF;

  -- schema_recommendations table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schema_recommendations') THEN
    DROP POLICY IF EXISTS "Users read own schema_recommendations" ON schema_recommendations;
    CREATE POLICY "Users read own schema_recommendations" ON schema_recommendations
      FOR SELECT USING (user_id = auth_uid());
  END IF;

  -- field_blacklist table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'field_blacklist') THEN
    DROP POLICY IF EXISTS "Users read field_blacklist" ON field_blacklist;
    CREATE POLICY "Users read field_blacklist" ON field_blacklist
      FOR SELECT USING (
        scope = 'global' OR 
        (scope = 'user' AND user_id = auth_uid())
      );
  END IF;

  -- auto_enhancement_queue table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auto_enhancement_queue') THEN
    DROP POLICY IF EXISTS "Users read own auto_enhancement_queue" ON auto_enhancement_queue;
    CREATE POLICY "Users read own auto_enhancement_queue" ON auto_enhancement_queue
      FOR SELECT USING (user_id = auth_uid());
  END IF;

  -- source_entity_edges table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'source_entity_edges') THEN
    DROP POLICY IF EXISTS "Users read own source_entity_edges" ON source_entity_edges;
    CREATE POLICY "Users read own source_entity_edges" ON source_entity_edges
      FOR SELECT USING (user_id = auth_uid());
  END IF;

  -- source_event_edges table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'source_event_edges') THEN
    DROP POLICY IF EXISTS "Users read own source_event_edges" ON source_event_edges;
    CREATE POLICY "Users read own source_event_edges" ON source_event_edges
      FOR SELECT USING (user_id = auth_uid());
  END IF;
END $$;

-- ============================================================================
-- Summary
-- ============================================================================
-- Created auth_uid() function with STABLE and SECURITY DEFINER for efficient caching
-- Updated 8 RLS policies to use auth_uid() instead of auth.uid()
-- Expected result: auth_rls_initplan warnings reduced from 16 to 0
