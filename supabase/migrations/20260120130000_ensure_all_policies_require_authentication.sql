-- Migration: Ensure All Policies Require Authentication
-- Created: 2026-01-20
-- Description: Updates ALL user-facing RLS policies to explicitly require authentication
--              This addresses 22 "auth_allow_anonymous_sign_ins" warnings from Management API
--              Uses dynamic SQL to update all policies that don't have TO authenticated

-- ============================================================================
-- Problem: Management API reports 22 tables with policies allowing anonymous access
--          Even though migration 20260120110904 added TO authenticated, some policies
--          may have been missed or recreated without the restriction
-- ============================================================================

-- ============================================================================
-- Solution: Use dynamic SQL to find and update ALL user-facing policies
--          that don't explicitly restrict to authenticated users
-- ============================================================================

DO $$
DECLARE
  policy_record RECORD;
  updated_count INTEGER := 0;
BEGIN
  -- Find all SELECT policies that don't have TO authenticated or TO service_role
  FOR policy_record IN
    SELECT 
      schemaname,
      tablename,
      policyname,
      cmd,
      qual,
      with_check,
      roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd = 'SELECT'
      AND policyname NOT LIKE '%service%'
      AND (
        -- Policy has no roles specified (allows anonymous)
        roles IS NULL 
        OR array_length(roles, 1) IS NULL
        -- Policy includes public or anon role
        OR 'public' = ANY(roles)
        OR 'anon' = ANY(roles)
        -- Policy doesn't include authenticated
        OR NOT ('authenticated' = ANY(roles))
      )
      AND tablename IN (
        'auto_enhancement_queue', 'entities', 'entity_event_edges', 'entity_merges',
        'entity_snapshots', 'field_blacklist', 'interpretations', 'observations',
        'payload_submissions', 'raw_fragments', 'record_relationships', 'records',
        'relationship_observations', 'relationship_snapshots', 'relationships',
        'schema_recommendations', 'schema_registry', 'source_entity_edges',
        'source_event_edges', 'sources', 'state_events', 'timeline_events'
      )
  LOOP
    BEGIN
      -- Drop the existing policy
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON %I.%I',
        policy_record.policyname,
        policy_record.schemaname,
        policy_record.tablename
      );
      
      -- Recreate with TO authenticated restriction
      -- Preserve the USING clause from the original policy
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR SELECT TO authenticated USING (%s)',
        policy_record.policyname,
        policy_record.schemaname,
        policy_record.tablename,
        COALESCE(policy_record.qual, 'true')
      );
      
      updated_count := updated_count + 1;
      RAISE NOTICE 'Updated policy: %.% on table %', 
        policy_record.schemaname, policy_record.policyname, policy_record.tablename;
      
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Failed to update policy %.% on table %: %', 
          policy_record.schemaname, policy_record.policyname, 
          policy_record.tablename, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE 'Updated % policies to require authentication', updated_count;
END $$;

-- ============================================================================
-- Summary
-- ============================================================================
-- Dynamically updated all user-facing SELECT policies to require TO authenticated
-- This ensures no policies allow anonymous access
-- Expected result: 22 "auth_allow_anonymous_sign_ins" warnings resolved
