-- Migration: Fix RLS enablement and auth_uid search_path
-- Created: 2026-02-03
-- Description: Enable RLS for tables with existing policies and harden auth_uid search_path

-- ============================================================================
-- 1. Enable RLS on tables that already have policies
-- ============================================================================
ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_merges ENABLE ROW LEVEL SECURITY;
ALTER TABLE payload_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE record_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_event_edges ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. Harden auth_uid search_path
-- ============================================================================
CREATE OR REPLACE FUNCTION auth_uid() RETURNS UUID
LANGUAGE SQL SECURITY DEFINER STABLE
SET search_path = public, pg_catalog
AS $$ SELECT auth.uid() $$;

COMMENT ON FUNCTION auth_uid IS 'Cached wrapper for auth.uid() to improve RLS policy performance. STABLE means result is constant within a single query.';
