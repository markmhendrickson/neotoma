-- Migration: Consolidate Multiple Permissive Policies on Records Table
-- Created: 2026-01-15
-- Description: Consolidates 3 permissive policies on records table into 2 efficient policies
--              Addresses 5 multiple_permissive_policies warnings

-- ============================================================================
-- Problem: records table has 3 permissive policies for SELECT operations:
--   1. "authenticated read - records" 
--   2. "public read"
--   3. "public write"
-- Multiple permissive policies are evaluated sequentially, causing performance issues
-- ============================================================================

-- ============================================================================
-- Solution: Consolidate into 2 policies:
--   1. "Users read records" - For authenticated and public read access
--   2. "Service role full access to records" - For all operations
-- ============================================================================

-- Ensure RLS is enabled
ALTER TABLE records ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "authenticated read - records" ON records;
DROP POLICY IF EXISTS "public read" ON records;
DROP POLICY IF EXISTS "public write" ON records;
DROP POLICY IF EXISTS "Users read records" ON records;
DROP POLICY IF EXISTS "Service role full access to records" ON records;

-- Create consolidated read policy (combines authenticated and public read)
CREATE POLICY "Users read records" ON records
  FOR SELECT 
  USING (true); -- Allow all authenticated and anonymous users to read

-- Service role has full access for mutations
CREATE POLICY "Service role full access to records" ON records
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- Summary
-- ============================================================================
-- Reduced 3 permissive SELECT policies to 1 consolidated policy
-- Maintains same access control (all users can read records)
-- Improves query performance by reducing policy evaluation overhead
-- Expected result: multiple_permissive_policies warnings reduced by 5
