-- Migration: Add records table
-- Created: 2025-12-31
-- Description: Creates records table - the main table for storing documents and data

-- Install required extensions
-- Ensure extensions schema exists and vector is available
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO public;
CREATE EXTENSION IF NOT EXISTS vector SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create records table
CREATE TABLE IF NOT EXISTS records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}',
  file_urls JSONB DEFAULT '[]',
  external_source TEXT,
  external_id TEXT,
  external_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add embedding column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'records' AND column_name = 'embedding'
  ) THEN
    -- Set search path to include extensions schema for vector type
    SET LOCAL search_path = public, extensions;
    ALTER TABLE records ADD COLUMN embedding vector(1536);
  END IF;
END $$;

-- Add summary column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'records' AND column_name = 'summary'
  ) THEN
    ALTER TABLE records ADD COLUMN summary TEXT;
  END IF;
END $$;

-- Add external_source and external_id columns if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'records' AND column_name = 'external_source'
  ) THEN
    ALTER TABLE records ADD COLUMN external_source TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'records' AND column_name = 'external_id'
  ) THEN
    ALTER TABLE records ADD COLUMN external_id TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'records' AND column_name = 'external_hash'
  ) THEN
    ALTER TABLE records ADD COLUMN external_hash TEXT;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_records_type ON records(type);
CREATE INDEX IF NOT EXISTS idx_records_properties ON records USING GIN(properties);
-- Create vector index if embedding column exists and vector extension is available
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'records' AND column_name = 'embedding'
  ) AND EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'vector'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_records_embedding ON records USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_external_id ON records ((properties->>'external_id'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_records_external_source_id_unique
  ON records (external_source, external_id)
  WHERE external_source IS NOT NULL AND external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_records_external_hash ON records (external_hash)
  WHERE external_hash IS NOT NULL;

-- Create function to update updated_at timestamp
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

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_records_updated_at ON records;
CREATE TRIGGER update_records_updated_at
  BEFORE UPDATE ON records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS policies
ALTER TABLE records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can do everything" ON records;
CREATE POLICY "Service role can do everything" ON records
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "public read" ON records;
CREATE POLICY "public read" ON records
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "public write" ON records;
CREATE POLICY "public write" ON records
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

