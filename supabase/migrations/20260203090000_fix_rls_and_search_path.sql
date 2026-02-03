-- Migration: Fix RLS enablement and function search_path
-- Created: 2026-02-03
-- Description: Enable RLS on user-facing tables and set search_path for auth helper functions

-- ============================================================================
-- 1. Enable RLS on tables that have policies but no RLS
-- ============================================================================
ALTER TABLE IF EXISTS public.mcp_oauth_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.mcp_oauth_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.entity_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.entity_merges ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payload_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.record_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.entity_event_edges ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. Set search_path for security definer functions
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'cleanup_expired_mcp_oauth_states'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE 'ALTER FUNCTION public.cleanup_expired_mcp_oauth_states() SET search_path = public, pg_catalog';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'auth_uid'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE 'ALTER FUNCTION public.auth_uid() SET search_path = public, pg_catalog';
  END IF;
END $$;

-- ============================================================================
-- DOWN (commented)
-- ============================================================================
-- ALTER TABLE public.mcp_oauth_connections DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.mcp_oauth_state DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.entity_snapshots DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.entity_merges DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.payload_submissions DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.record_relationships DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.entity_event_edges DISABLE ROW LEVEL SECURITY;
