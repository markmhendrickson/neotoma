-- Migration: Add Search Path to exec_sql Function
-- Created: 2026-01-15
-- Description: Adds SET search_path to exec_sql function to prevent search_path injection attacks
--              Addresses function_search_path_mutable warning

-- ============================================================================
-- Problem: exec_sql function has mutable search_path
-- ============================================================================
-- The exec_sql function is used by migration scripts to execute SQL
-- Without SET search_path, it's vulnerable to search_path injection attacks

-- ============================================================================
-- Solution: Add SET search_path to exec_sql function
-- ============================================================================

-- Add search_path to exec_sql function
-- Note: Need to drop and recreate to change function properties

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.exec_sql(text);

-- Recreate with SET search_path
CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS TABLE(result jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $func$
BEGIN
  RETURN QUERY EXECUTE query;
END;
$func$;

COMMENT ON FUNCTION public.exec_sql(text) IS 'Execute arbitrary SQL (SECURITY DEFINER). Used by migration scripts. SET search_path prevents injection attacks.';

-- ============================================================================
-- Summary
-- ============================================================================
-- Added SET search_path to exec_sql function
-- Expected result: function_search_path_mutable warnings reduced from 1 to 0
