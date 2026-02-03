-- Migration: Fix RLS event trigger to prevent double schema prefix
-- Created: 2025-01-21
-- Description: Fixes the auto_enable_rls_on_table function to use object_name instead of object_identity
--              This prevents "public.public.table_name" errors when creating new tables

-- Fix the event trigger function to use object_name instead of object_identity
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
    -- Use object_name (not object_identity) to avoid double schema prefix
    -- object_identity is fully qualified (public.table_name), object_name is just the table name
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 
                   obj.schema_name, obj.object_name);
    
    -- Log the action (optional, can be removed if not needed)
    RAISE NOTICE 'Auto-enabled RLS on table: %.%', obj.schema_name, obj.object_name;
  END LOOP;
END;
$$;
COMMENT ON FUNCTION auto_enable_rls_on_table IS 'Event trigger function that automatically enables RLS on all new tables in public schema. Fixed to use object_name instead of object_identity to prevent double schema prefix errors.';
