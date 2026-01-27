-- Migration: Fix RLS event trigger to prevent double schema prefix
-- Created: 2025-01-21
-- Description: Fixes the auto_enable_rls_on_table function to use object_identity directly
--              instead of schema_name + object_identity, preventing "public.public.table_name" errors

-- Fix the event trigger function to use object_identity directly (already fully qualified)
CREATE OR REPLACE FUNCTION auto_enable_rls_on_table()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  obj record;
  table_name TEXT;
BEGIN
  -- Only process CREATE TABLE events in public schema
  FOR obj IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag = 'CREATE TABLE'
      AND schema_name = 'public'
  LOOP
    -- Use object_identity directly (it's already fully qualified as "schema.table")
    -- Don't use schema_name + object_identity as that causes "public.public.table" errors
    -- Strip any double "public." prefix if present
    table_name := obj.object_identity;
    
    -- Remove double "public." prefix if present
    IF table_name LIKE 'public.public.%' THEN
      table_name := REPLACE(table_name, 'public.public.', 'public.');
    END IF;
    
    -- Use %I for identifier quoting to handle any edge cases
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    
    -- Log the action (optional, can be removed if not needed)
    RAISE NOTICE 'Auto-enabled RLS on table: %', table_name;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION auto_enable_rls_on_table IS 'Event trigger function that automatically enables RLS on all new tables in public schema. Fixed to use object_identity directly (without schema_name) to prevent double schema prefix errors.';
