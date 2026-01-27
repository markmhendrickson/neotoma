-- Migration: Enable RLS by Default for All Tables
-- Created: 2026-01-20
-- Description: Creates an event trigger that automatically enables RLS on all new tables
--              This ensures RLS is always enabled, even if developers forget to add it

-- ============================================================================
-- Problem: RLS must be manually enabled for each table created via SQL
--          Developers can forget to enable RLS, creating security gaps
--          PostgreSQL/Supabase doesn't provide a database-wide default
-- ============================================================================

-- ============================================================================
-- Solution: Create an event trigger that automatically enables RLS on table creation
--          This ensures ALL new tables have RLS enabled by default
-- ============================================================================

-- ============================================================================
-- 1. Create function to auto-enable RLS on new tables
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_enable_rls_on_table()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  obj record;
BEGIN
  -- Only process CREATE TABLE events in public schema
  FOR obj IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag = 'CREATE TABLE'
      AND schema_name = 'public'
  LOOP
    -- Enable RLS on the newly created table
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 
                   obj.schema_name, obj.object_identity);
    
    -- Log the action (optional, can be removed if not needed)
    RAISE NOTICE 'Auto-enabled RLS on table: %.%', obj.schema_name, obj.object_identity;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION auto_enable_rls_on_table IS 'Event trigger function that automatically enables RLS on all new tables in public schema. Ensures security by default.';

-- ============================================================================
-- 2. Create event trigger that fires on CREATE TABLE
-- ============================================================================

DROP EVENT TRIGGER IF EXISTS trigger_auto_enable_rls_on_table;

CREATE EVENT TRIGGER trigger_auto_enable_rls_on_table
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE')
  EXECUTE FUNCTION auto_enable_rls_on_table();

COMMENT ON EVENT TRIGGER trigger_auto_enable_rls_on_table IS 'Automatically enables RLS on all new tables created in public schema. Prevents security gaps from forgotten RLS enabling.';

-- ============================================================================
-- 3. Enable RLS on any existing tables that don't have it
-- ============================================================================

DO $$
DECLARE
  table_record record;
BEGIN
  FOR table_record IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT LIKE '_%'
      AND tablename NOT IN ('schema_migrations') -- Exclude migration tracking table
      AND NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = tablename
          AND c.relrowsecurity = true
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_record.tablename);
      RAISE NOTICE 'Enabled RLS on existing table: %', table_record.tablename;
    EXCEPTION
      WHEN OTHERS THEN
        -- Skip tables that can't have RLS enabled (e.g., views, system tables)
        RAISE NOTICE 'Could not enable RLS on table %: %', table_record.tablename, SQLERRM;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- Summary
-- ============================================================================
-- Created event trigger that automatically enables RLS on all new tables
-- Enabled RLS on any existing tables that were missing it
-- This ensures RLS is always enabled by default going forward
-- Note: Policies still need to be created manually (RLS enabled != policies exist)
