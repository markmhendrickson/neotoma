-- Migration: FU-115 - Raw Fragments Extensions
-- Created: 2025-12-31
-- Description: Add source_id, interpretation_run_id, and user_id to raw_fragments

-- Add source_id column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'raw_fragments' AND column_name = 'source_id'
  ) THEN
    ALTER TABLE raw_fragments ADD COLUMN source_id UUID REFERENCES sources(id);
  END IF;
END $$;

-- Add interpretation_run_id column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'raw_fragments' AND column_name = 'interpretation_run_id'
  ) THEN
    ALTER TABLE raw_fragments ADD COLUMN interpretation_run_id UUID REFERENCES interpretation_runs(id);
  END IF;
END $$;

-- Add user_id column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'raw_fragments' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE raw_fragments ADD COLUMN user_id UUID;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_raw_fragments_source ON raw_fragments(source_id);
CREATE INDEX IF NOT EXISTS idx_raw_fragments_interpretation_run ON raw_fragments(interpretation_run_id);
CREATE INDEX IF NOT EXISTS idx_raw_fragments_user ON raw_fragments(user_id);

-- Enable RLS
ALTER TABLE raw_fragments ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Service role full access - raw_fragments" ON raw_fragments;
DROP POLICY IF EXISTS "public read - raw_fragments" ON raw_fragments;

-- Service role has full access
CREATE POLICY "Service role full access - raw_fragments"
  ON raw_fragments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can only read their own raw fragments
CREATE POLICY "Users read own raw fragments"
  ON raw_fragments
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON COLUMN raw_fragments.source_id IS 'Link to raw source content (provenance)';
COMMENT ON COLUMN raw_fragments.interpretation_run_id IS 'Link to interpretation run that created this fragment (provenance)';
COMMENT ON COLUMN raw_fragments.user_id IS 'User who owns this fragment (for RLS)';

