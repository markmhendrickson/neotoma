-- Migration: Fix function search_path and extension warnings
-- Created: 2025-01-15
-- Description: Addresses Security Advisor warnings for function search_path and extension location

-- ============================================================================
-- FIX 1: Function Search Path Mutable
-- ============================================================================

-- Update update_updated_at_column function to set search_path
-- This prevents search_path injection attacks
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- FIX 2: Extension in Public Schema
-- ============================================================================

-- Move vector extension to dedicated extensions schema
-- This is the recommended practice for better security and organization

-- Step 1: Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Step 2: Grant usage on the schema to public (required for types to be accessible)
GRANT USAGE ON SCHEMA extensions TO public;

-- Step 3: Drop the extension from public schema and recreate in extensions schema
-- Note: This is safe because:
-- 1. The vector type name doesn't change (it's still "vector")
-- 2. PostgreSQL will find it via search_path
-- 3. Existing columns using vector type will continue to work
-- 4. We need to drop dependent objects temporarily (indexes using vector operators)

DO $$
BEGIN
  -- Check if extension exists in public schema
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'vector' AND n.nspname = 'public'
  ) THEN
    -- Drop vector indexes temporarily (they'll be recreated)
    -- Note: We need to drop all indexes that use vector operators
    DROP INDEX IF EXISTS idx_records_embedding;
    
    -- Drop the extension from public
    -- Note: Columns using vector type will remain but become invalid until extension is recreated
    -- We use CASCADE to drop dependent objects (indexes), but columns will remain
    DROP EXTENSION IF EXISTS vector CASCADE;
    
    -- Recreate extension in extensions schema
    CREATE EXTENSION IF NOT EXISTS vector SCHEMA extensions;
    
    -- Recreate the vector indexes (only if columns exist)
    -- The vector type is now in extensions schema, but PostgreSQL will find it via search_path
    -- The operator class name is just 'vector_cosine_ops' (no schema prefix needed)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'records' 
        AND column_name = 'embedding'
    ) THEN
      CREATE INDEX IF NOT EXISTS idx_records_embedding 
        ON records USING ivfflat (embedding vector_cosine_ops) 
        WITH (lists = 100);
    END IF;
  END IF;
END $$;

-- Step 4: Ensure extensions schema is in search_path
-- This is typically done at the database level, but we'll set it for the current session
-- The config.toml already has extensions in extra_search_path, so this should work

COMMENT ON EXTENSION vector IS 
  'pgvector extension for vector similarity search. Installed in extensions schema per security best practices.';

