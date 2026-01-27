-- Add user_id column to records table (FU-701 Part 1)
-- Migration: 20260119000001_add_user_id_to_records.sql
-- Created: 2026-01-19
-- Description: Adds user_id column to records table as prerequisite for user-scoped RLS
--              Part of MVP Phase 1: Critical Architectural Fixes

-- ============================================================================
-- Problem: records table lacks user_id column
--          Cannot enforce user-scoped RLS without user_id
--          All records are currently accessible to all users
-- ============================================================================

-- ============================================================================
-- Solution: Add user_id column referencing auth.users
--          Set NOT NULL after backfilling existing data (if any)
-- ============================================================================

-- Add user_id column (nullable initially for backfill)
ALTER TABLE records 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Create index for RLS policy performance
CREATE INDEX IF NOT EXISTS idx_records_user_id ON records(user_id);

-- ============================================================================
-- Note: Existing records will have NULL user_id
-- ============================================================================
-- If there are existing records in production:
-- 1. They need to be assigned to a user (manual backfill)
-- 2. After backfill, make column NOT NULL:
--    ALTER TABLE records ALTER COLUMN user_id SET NOT NULL;
--
-- For MVP launch with clean database, user_id will be set on all new inserts
-- ============================================================================
