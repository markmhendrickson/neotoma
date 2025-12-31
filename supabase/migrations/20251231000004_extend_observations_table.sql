-- Migration: FU-114 - Observation Extensions
-- Created: 2025-12-31
-- Description: Add source_id and interpretation_run_id linkage to observations

-- Add source_id column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'observations' AND column_name = 'source_id'
  ) THEN
    ALTER TABLE observations ADD COLUMN source_id UUID REFERENCES sources(id);
  END IF;
END $$;

-- Add interpretation_run_id column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'observations' AND column_name = 'interpretation_run_id'
  ) THEN
    ALTER TABLE observations ADD COLUMN interpretation_run_id UUID REFERENCES interpretation_runs(id);
  END IF;
END $$;

-- Create indexes for provenance lookups
CREATE INDEX IF NOT EXISTS idx_observations_source ON observations(source_id);
CREATE INDEX IF NOT EXISTS idx_observations_interpretation_run ON observations(interpretation_run_id);

-- Update existing RLS policies to use user_id

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Service role full access - observations" ON observations;
DROP POLICY IF EXISTS "public read - observations" ON observations;

-- Service role has full access
CREATE POLICY "Service role full access - observations"
  ON observations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can only read their own observations
CREATE POLICY "Users read own observations"
  ON observations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON COLUMN observations.source_id IS 'Link to raw source content (provenance)';
COMMENT ON COLUMN observations.interpretation_run_id IS 'Link to interpretation run that created this observation (provenance)';

