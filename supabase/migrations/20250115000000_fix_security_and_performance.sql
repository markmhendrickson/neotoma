-- Migration: Fix security and performance issues identified by advisor
-- Created: 2025-01-15
-- Description: Addresses critical security issues and performance optimizations

-- ============================================================================
-- SECURITY FIXES
-- ============================================================================

-- Fix 1: Restrict public read access on sensitive tables
-- Replace overly permissive public read policies with authenticated-only access

-- Records table - restrict public read
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'records') THEN
    DROP POLICY IF EXISTS "public read" ON records;
    DROP POLICY IF EXISTS "authenticated read - records" ON records;
    CREATE POLICY "authenticated read - records" ON records
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Record relationships - restrict public read
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'record_relationships') THEN
    DROP POLICY IF EXISTS "public read - record_relationships" ON record_relationships;
    DROP POLICY IF EXISTS "authenticated read - record_relationships" ON record_relationships;
    CREATE POLICY "authenticated read - record_relationships" ON record_relationships
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- State events - enable RLS and restrict public read
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'state_events') THEN
    -- Enable RLS if not already enabled
    ALTER TABLE state_events ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "public read - state_events" ON state_events;
    DROP POLICY IF EXISTS "authenticated read - state_events" ON state_events;
    CREATE POLICY "authenticated read - state_events" ON state_events
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Payload submissions - restrict public read (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payload_submissions') THEN
    DROP POLICY IF EXISTS "public read - payload_submissions" ON payload_submissions;
    DROP POLICY IF EXISTS "authenticated read - payload_submissions" ON payload_submissions;
    CREATE POLICY "authenticated read - payload_submissions" ON payload_submissions
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Observations - restrict public read
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'observations') THEN
    DROP POLICY IF EXISTS "public read - observations" ON observations;
    DROP POLICY IF EXISTS "authenticated read - observations" ON observations;
    CREATE POLICY "authenticated read - observations" ON observations
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Entity snapshots - restrict public read
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'entity_snapshots') THEN
    DROP POLICY IF EXISTS "public read - entity_snapshots" ON entity_snapshots;
    DROP POLICY IF EXISTS "authenticated read - entity_snapshots" ON entity_snapshots;
    CREATE POLICY "authenticated read - entity_snapshots" ON entity_snapshots
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Raw fragments - restrict public read
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'raw_fragments') THEN
    DROP POLICY IF EXISTS "public read - raw_fragments" ON raw_fragments;
    DROP POLICY IF EXISTS "authenticated read - raw_fragments" ON raw_fragments;
    CREATE POLICY "authenticated read - raw_fragments" ON raw_fragments
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Schema registry - restrict public read
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'schema_registry') THEN
    DROP POLICY IF EXISTS "public read - schema_registry" ON schema_registry;
    DROP POLICY IF EXISTS "authenticated read - schema_registry" ON schema_registry;
    CREATE POLICY "authenticated read - schema_registry" ON schema_registry
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Relationships - restrict public read
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'relationships') THEN
    DROP POLICY IF EXISTS "public read - relationships" ON relationships;
    DROP POLICY IF EXISTS "authenticated read - relationships" ON relationships;
    CREATE POLICY "authenticated read - relationships" ON relationships
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Entities - restrict public read
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'entities') THEN
    DROP POLICY IF EXISTS "public read - entities" ON entities;
    DROP POLICY IF EXISTS "authenticated read - entities" ON entities;
    CREATE POLICY "authenticated read - entities" ON entities
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Timeline events - restrict public read
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'timeline_events') THEN
    DROP POLICY IF EXISTS "public read - timeline_events" ON timeline_events;
    DROP POLICY IF EXISTS "authenticated read - timeline_events" ON timeline_events;
    CREATE POLICY "authenticated read - timeline_events" ON timeline_events
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Record-entity edges - restrict public read
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'record_entity_edges') THEN
    DROP POLICY IF EXISTS "public read - record_entity_edges" ON record_entity_edges;
    DROP POLICY IF EXISTS "authenticated read - record_entity_edges" ON record_entity_edges;
    CREATE POLICY "authenticated read - record_entity_edges" ON record_entity_edges
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Record-event edges - restrict public read
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'record_event_edges') THEN
    DROP POLICY IF EXISTS "public read - record_event_edges" ON record_event_edges;
    DROP POLICY IF EXISTS "authenticated read - record_event_edges" ON record_event_edges;
    CREATE POLICY "authenticated read - record_event_edges" ON record_event_edges
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Entity-event edges - restrict public read
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'entity_event_edges') THEN
    DROP POLICY IF EXISTS "public read - entity_event_edges" ON entity_event_edges;
    DROP POLICY IF EXISTS "authenticated read - entity_event_edges" ON entity_event_edges;
    CREATE POLICY "authenticated read - entity_event_edges" ON entity_event_edges
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Note: plaid_items, plaid_sync_runs, external_connectors, external_sync_runs
-- already have service_role only access, which is correct

-- ============================================================================
-- PERFORMANCE FIXES
-- ============================================================================

-- Fix 2: Add missing foreign key indexes
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'relationships') THEN
    CREATE INDEX IF NOT EXISTS idx_relationships_source_record 
      ON relationships(source_record_id) 
      WHERE source_record_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_relationships_user 
      ON relationships(user_id);
  END IF;
END $$;

-- Fix 3: Add composite index for common query pattern (type + created_at)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'records') THEN
    CREATE INDEX IF NOT EXISTS idx_records_type_created_at 
      ON records(type, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_records_updated_at 
      ON records(updated_at DESC);
  END IF;
END $$;

-- Fix 5: Add missing status index on plaid_sync_runs
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'plaid_sync_runs') THEN
    CREATE INDEX IF NOT EXISTS idx_plaid_sync_runs_status 
      ON plaid_sync_runs(status) 
      WHERE status != 'completed';
  END IF;
END $$;

-- Fix 6: Add composite indexes for relationships queries
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'relationships') THEN
    CREATE INDEX IF NOT EXISTS idx_relationships_type_source 
      ON relationships(relationship_type, source_entity_id);

    CREATE INDEX IF NOT EXISTS idx_relationships_type_target 
      ON relationships(relationship_type, target_entity_id);
  END IF;
END $$;

-- Fix 7: Add composite index for observations (entity_type + entity_id + observed_at)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'observations') THEN
    CREATE INDEX IF NOT EXISTS idx_observations_entity_type 
      ON observations(entity_type, entity_id, observed_at DESC);
  END IF;
END $$;

-- Fix 8: Add composite index for records (type + external_source + external_id)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'records') THEN
    CREATE INDEX IF NOT EXISTS idx_records_type_external 
      ON records(type, external_source, external_id) 
      WHERE external_source IS NOT NULL AND external_id IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON INDEX idx_records_type_created_at IS 
  'Composite index for common query pattern: filter by type, order by created_at DESC';

COMMENT ON INDEX idx_relationships_source_record IS 
  'Index on foreign key to records table for efficient joins';

COMMENT ON INDEX idx_relationships_user IS 
  'Index on user_id for user-scoped queries';

