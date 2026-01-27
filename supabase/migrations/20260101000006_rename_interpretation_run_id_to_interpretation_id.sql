-- Migration: Rename interpretation_run_id to interpretation_id
-- Purpose: Align column name with canonical vocabulary (docs/vocabulary/canonical_terms.md)
-- Reference: v0.2.15 vocabulary alignment
-- Note: The vocabulary term is "Interpretation", column should be "interpretation_id"

-- ============================================================================
-- 1. Rename column in observations table
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'observations' AND column_name = 'interpretation_run_id'
  ) THEN
    ALTER TABLE observations RENAME COLUMN interpretation_run_id TO interpretation_id;
  END IF;
END $$;

-- Drop old index if exists
DROP INDEX IF EXISTS idx_observations_interpretation_run;

-- Create index with new name
CREATE INDEX IF NOT EXISTS idx_observations_interpretation ON observations(interpretation_id);

-- Update column comment
COMMENT ON COLUMN observations.interpretation_id IS 'Link to interpretation that created this observation (provenance). References interpretations(id).';

-- ============================================================================
-- 2. Rename column in raw_fragments table
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'raw_fragments' AND column_name = 'interpretation_run_id'
  ) THEN
    ALTER TABLE raw_fragments RENAME COLUMN interpretation_run_id TO interpretation_id;
  END IF;
END $$;

-- Drop old index if exists  
DROP INDEX IF EXISTS idx_raw_fragments_interpretation_run;

-- Create index with new name
CREATE INDEX IF NOT EXISTS idx_raw_fragments_interpretation ON raw_fragments(interpretation_id);

-- Update column comment
COMMENT ON COLUMN raw_fragments.interpretation_id IS 'Link to interpretation that found this fragment (provenance). References interpretations(id).';
