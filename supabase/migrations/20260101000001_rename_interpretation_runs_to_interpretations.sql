-- Migration: Rename interpretation_runs to interpretations
-- Purpose: Align table name with canonical vocabulary (docs/vocabulary/canonical_terms.md)
-- Reference: v0.2.15 vocabulary alignment
-- Note: The vocabulary term is "Interpretation", database table is "interpretations"

-- Rename the table
ALTER TABLE IF EXISTS interpretation_runs RENAME TO interpretations;
-- Update indexes (they should auto-rename with the table, but let's be explicit)
-- Drop old index names if they exist
DROP INDEX IF EXISTS idx_interpretation_runs_user;
DROP INDEX IF EXISTS idx_interpretation_runs_source;
DROP INDEX IF EXISTS idx_interpretation_runs_status;
DROP INDEX IF EXISTS idx_interpretation_runs_created_at;
-- Create indexes with new names
CREATE INDEX IF NOT EXISTS idx_interpretations_user ON interpretations(user_id);
CREATE INDEX IF NOT EXISTS idx_interpretations_source ON interpretations(source_id);
CREATE INDEX IF NOT EXISTS idx_interpretations_status ON interpretations(status);
CREATE INDEX IF NOT EXISTS idx_interpretations_created_at ON interpretations(created_at DESC);
-- Update RLS policy names
DROP POLICY IF EXISTS "Service role full access - interpretation_runs" ON interpretations;
CREATE POLICY "Service role full access - interpretations"
  ON interpretations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
DROP POLICY IF EXISTS "Users read own interpretation runs" ON interpretations;
CREATE POLICY "Users read own interpretations"
  ON interpretations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
-- Update table comment
COMMENT ON TABLE interpretations IS 'Versioned interpretation attempts with config logging for auditability (canonical vocabulary term: Interpretation)';
COMMENT ON COLUMN interpretations.interpretation_config IS 'JSONB: provider, model_id, temperature, prompt_hash, code_version, feature_flags';
COMMENT ON COLUMN interpretations.status IS 'Current status: pending, running, completed, failed';
COMMENT ON COLUMN interpretations.observations_created IS 'Count of observations created from this interpretation';
COMMENT ON COLUMN interpretations.unknown_fields_count IS 'Count of unknown fields routed to raw_fragments';
