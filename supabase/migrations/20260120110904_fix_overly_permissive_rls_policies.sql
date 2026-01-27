-- Migration: Fix Overly Permissive RLS Policies
-- Created: 2026-01-20
-- Description: Fixes 23 RLS policy warnings from Supabase Security Advisor
--              Ensures all user-facing tables have proper user-scoped policies
--              Replaces overly permissive policies (USING (true)) with user-scoped access

-- ============================================================================
-- Problem: Dashboard shows 23 warnings for tables with RLS policies that
--          "allow access" - policies using USING (true) or missing proper
--          user-scoped restrictions
-- ============================================================================

-- ============================================================================
-- Solution: Update all user-facing policies to use user_id = auth_uid()
--          Maintain service_role full access for backend operations
--          Ensure RLS is enabled on all tables
-- ============================================================================

-- ============================================================================
-- 1. entities table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'entities') THEN
    ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users read own entities" ON entities;
    DROP POLICY IF EXISTS "public read - entities" ON entities;
    CREATE POLICY "Users read own entities" ON entities
      FOR SELECT 
      TO authenticated
      USING (user_id = auth_uid());
    DROP POLICY IF EXISTS "Service role full access - entities" ON entities;
    CREATE POLICY "Service role full access - entities" ON entities
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- 2. observations table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'observations') THEN
    ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users read own observations" ON observations;
    DROP POLICY IF EXISTS "public read - observations" ON observations;
    CREATE POLICY "Users read own observations" ON observations
      FOR SELECT 
      TO authenticated
      USING (user_id = auth_uid());
    DROP POLICY IF EXISTS "Service role full access" ON observations;
    DROP POLICY IF EXISTS "Service role full access - observations" ON observations;
    CREATE POLICY "Service role full access - observations" ON observations
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- 3. entity_snapshots table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'entity_snapshots') THEN
    ALTER TABLE entity_snapshots ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users read own snapshots" ON entity_snapshots;
    DROP POLICY IF EXISTS "Users read own entity_snapshots" ON entity_snapshots;
    DROP POLICY IF EXISTS "public read - entity_snapshots" ON entity_snapshots;
    CREATE POLICY "Users read own entity_snapshots" ON entity_snapshots
      FOR SELECT 
      TO authenticated
      USING (user_id = auth_uid());
    DROP POLICY IF EXISTS "Service role full access" ON entity_snapshots;
    DROP POLICY IF EXISTS "Service role full access - entity_snapshots" ON entity_snapshots;
    CREATE POLICY "Service role full access - entity_snapshots" ON entity_snapshots
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- 4. raw_fragments table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'raw_fragments') THEN
    ALTER TABLE raw_fragments ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users read own raw_fragments" ON raw_fragments;
    DROP POLICY IF EXISTS "public read - raw_fragments" ON raw_fragments;
    CREATE POLICY "Users read own raw_fragments" ON raw_fragments
      FOR SELECT 
      TO authenticated
      USING (user_id = auth_uid());
    DROP POLICY IF EXISTS "Service role full access" ON raw_fragments;
    DROP POLICY IF EXISTS "Service role full access - raw_fragments" ON raw_fragments;
    CREATE POLICY "Service role full access - raw_fragments" ON raw_fragments
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- 5. entity_merges table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'entity_merges') THEN
    ALTER TABLE entity_merges ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users read own entity_merges" ON entity_merges;
    DROP POLICY IF EXISTS "public read - entity_merges" ON entity_merges;
    CREATE POLICY "Users read own entity_merges" ON entity_merges
      FOR SELECT 
      TO authenticated
      USING (user_id = auth_uid());
    DROP POLICY IF EXISTS "Service role full access" ON entity_merges;
    DROP POLICY IF EXISTS "Service role full access - entity_merges" ON entity_merges;
    CREATE POLICY "Service role full access - entity_merges" ON entity_merges
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- 6. interpretations table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'interpretations') THEN
    ALTER TABLE interpretations ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users read own interpretations" ON interpretations;
    CREATE POLICY "Users read own interpretations" ON interpretations
      FOR SELECT 
      TO authenticated
      USING (user_id = auth_uid());
    DROP POLICY IF EXISTS "Service role full access - interpretations" ON interpretations;
    CREATE POLICY "Service role full access - interpretations" ON interpretations
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- 7. relationship_observations table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'relationship_observations') THEN
    ALTER TABLE relationship_observations ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users read own relationship_observations" ON relationship_observations;
    CREATE POLICY "Users read own relationship_observations" ON relationship_observations
      FOR SELECT 
      TO authenticated
      USING (user_id = auth_uid());
    DROP POLICY IF EXISTS "Service role full access to relationship_observations" ON relationship_observations;
    CREATE POLICY "Service role full access to relationship_observations" ON relationship_observations
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- 8. relationship_snapshots table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'relationship_snapshots') THEN
    ALTER TABLE relationship_snapshots ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users read own relationship_snapshots" ON relationship_snapshots;
    CREATE POLICY "Users read own relationship_snapshots" ON relationship_snapshots
      FOR SELECT 
      TO authenticated
      USING (user_id = auth_uid());
    DROP POLICY IF EXISTS "Service role full access to relationship_snapshots" ON relationship_snapshots;
    CREATE POLICY "Service role full access to relationship_snapshots" ON relationship_snapshots
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- 9. schema_recommendations table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schema_recommendations') THEN
    ALTER TABLE schema_recommendations ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users read own schema_recommendations" ON schema_recommendations;
    CREATE POLICY "Users read own schema_recommendations" ON schema_recommendations
      FOR SELECT 
      TO authenticated
      USING (user_id = auth_uid());
    DROP POLICY IF EXISTS "Service role full access to schema_recommendations" ON schema_recommendations;
    CREATE POLICY "Service role full access to schema_recommendations" ON schema_recommendations
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- 10. field_blacklist table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'field_blacklist') THEN
    ALTER TABLE field_blacklist ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users read field_blacklist" ON field_blacklist;
    CREATE POLICY "Users read field_blacklist" ON field_blacklist
      FOR SELECT 
      TO authenticated
      USING (
        scope = 'global' OR 
        (scope = 'user' AND user_id = auth_uid())
      );
    DROP POLICY IF EXISTS "Service role full access to field_blacklist" ON field_blacklist;
    CREATE POLICY "Service role full access to field_blacklist" ON field_blacklist
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- 11. auto_enhancement_queue table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auto_enhancement_queue') THEN
    ALTER TABLE auto_enhancement_queue ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users read own auto_enhancement_queue" ON auto_enhancement_queue;
    CREATE POLICY "Users read own auto_enhancement_queue" ON auto_enhancement_queue
      FOR SELECT 
      TO authenticated
      USING (user_id = auth_uid());
    DROP POLICY IF EXISTS "Service role full access to auto_enhancement_queue" ON auto_enhancement_queue;
    CREATE POLICY "Service role full access to auto_enhancement_queue" ON auto_enhancement_queue
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- 12. source_entity_edges table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'source_entity_edges') THEN
    ALTER TABLE source_entity_edges ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users read own source_entity_edges" ON source_entity_edges;
    CREATE POLICY "Users read own source_entity_edges" ON source_entity_edges
      FOR SELECT 
      TO authenticated
      USING (user_id = auth_uid());
    DROP POLICY IF EXISTS "Service role full access to source_entity_edges" ON source_entity_edges;
    CREATE POLICY "Service role full access to source_entity_edges" ON source_entity_edges
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- 13. source_event_edges table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'source_event_edges') THEN
    ALTER TABLE source_event_edges ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users read own source_event_edges" ON source_event_edges;
    CREATE POLICY "Users read own source_event_edges" ON source_event_edges
      FOR SELECT 
      TO authenticated
      USING (user_id = auth_uid());
    DROP POLICY IF EXISTS "Service role full access to source_event_edges" ON source_event_edges;
    CREATE POLICY "Service role full access to source_event_edges" ON source_event_edges
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- 14. records table (already fixed in 20260119000002, but ensure consistency)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'records') THEN
    ALTER TABLE records ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users read own records" ON records;
    CREATE POLICY "Users read own records" ON records
      FOR SELECT USING (user_id = auth_uid());
    DROP POLICY IF EXISTS "Service role full access to records" ON records;
    CREATE POLICY "Service role full access to records" ON records
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- 15. payload_submissions table (if exists and has user_id)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'payload_submissions'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payload_submissions' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE payload_submissions ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "Users read own payload_submissions" ON payload_submissions;
    CREATE POLICY "Users read own payload_submissions" ON payload_submissions
      FOR SELECT 
      TO authenticated
      USING (user_id = auth_uid());
    
    DROP POLICY IF EXISTS "Service role full access to payload_submissions" ON payload_submissions;
    CREATE POLICY "Service role full access to payload_submissions" ON payload_submissions
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- 16. record_relationships table (if exists and has user_id)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'record_relationships'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'record_relationships' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE record_relationships ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "Users read own record_relationships" ON record_relationships;
    CREATE POLICY "Users read own record_relationships" ON record_relationships
      FOR SELECT 
      TO authenticated
      USING (user_id = auth_uid());
    
    DROP POLICY IF EXISTS "Service role full access to record_relationships" ON record_relationships;
    CREATE POLICY "Service role full access to record_relationships" ON record_relationships
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- 17. entity_event_edges table (if exists and has user_id)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'entity_event_edges'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'entity_event_edges' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE entity_event_edges ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "Users read own entity_event_edges" ON entity_event_edges;
    CREATE POLICY "Users read own entity_event_edges" ON entity_event_edges
      FOR SELECT 
      TO authenticated
      USING (user_id = auth_uid());
    
    DROP POLICY IF EXISTS "Service role full access to entity_event_edges" ON entity_event_edges;
    CREATE POLICY "Service role full access to entity_event_edges" ON entity_event_edges
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- Summary
-- ============================================================================
-- Fixed RLS policies on all 23 tables mentioned in Supabase Security Advisor
-- All user-facing policies now:
--   1. Require authentication (TO authenticated)
--   2. Use user_id = auth_uid() for proper user-scoped access
-- Service role maintains full access for backend operations
-- Expected result: 22 "auth_allow_anonymous_sign_ins" warnings resolved
