-- Fix RLS Policy on Records Table (FU-701 Part 2)
-- Migration: 20260119000002_fix_records_rls_user_scoped.sql
-- Created: 2026-01-19
-- Description: Updates records table RLS policy from permissive (all users) to user-scoped
--              Fixes critical security gap where all authenticated users could read all records
--              Part of MVP Phase 1: Critical Architectural Fixes
--              Depends on: 20260119000001_add_user_id_to_records.sql

-- ============================================================================
-- Problem: Current "Users read records" policy uses USING (true)
--          This allows ALL authenticated users to read ALL records
--          Violates privacy-first architecture and user data isolation
-- ============================================================================

-- ============================================================================
-- Solution: Update policy to user-scoped access
--          Users can only read their own records via user_id = auth.uid()
--          Maintains service role full access for backend operations
-- ============================================================================

-- Ensure RLS is enabled (should already be enabled)
ALTER TABLE records ENABLE ROW LEVEL SECURITY;

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Users read records" ON records;
DROP POLICY IF EXISTS "Users read own records" ON records;

-- Create user-scoped read policy
-- Users can only read records where user_id matches their auth.uid()
CREATE POLICY "Users read own records" ON records
  FOR SELECT 
  USING (user_id = auth.uid());

-- Service role maintains full access (already exists, recreate for consistency)
DROP POLICY IF EXISTS "Service role full access to records" ON records;
DROP POLICY IF EXISTS "Service role full access - records" ON records;
CREATE POLICY "Service role full access to records" ON records
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- Verification
-- ============================================================================
-- After applying this migration:
-- 1. User A can only SELECT records where records.user_id = user_A_id
-- 2. User B can only SELECT records where records.user_id = user_B_id  
-- 3. Service role can perform all operations (SELECT/INSERT/UPDATE/DELETE)
-- 4. Cross-user isolation is enforced at database level
-- ============================================================================

-- ============================================================================
-- Testing
-- ============================================================================
-- To verify this migration:
-- 1. Create 2 test users (A and B)
-- 2. Insert records with user_A_id and user_B_id
-- 3. Query as user A: SELECT * FROM records
--    Expected: Only records with user_id = user_A_id
-- 4. Query as user B: SELECT * FROM records
--    Expected: Only records with user_id = user_B_id
-- ============================================================================
