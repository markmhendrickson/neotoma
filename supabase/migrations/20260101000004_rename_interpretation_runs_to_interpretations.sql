-- Migration: Rename interpretation_runs to interpretations
-- Purpose: Align table name with canonical vocabulary (docs/vocabulary/canonical_terms.md)
-- Reference: v0.2.15 vocabulary alignment
-- Note: The vocabulary term is "Interpretation", database table is "interpretations"

-- Skip if neither table exists (for fresh local Supabase instances)
DO $$
BEGIN
  -- Check if either table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND (table_name = 'interpretation_runs' OR table_name = 'interpretations')
  ) THEN
    RAISE NOTICE 'Skipping migration: interpretation_runs/interpretations table does not exist yet';
    RETURN;
  END IF;

  -- Rename the table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'interpretation_runs') THEN
    ALTER TABLE interpretation_runs RENAME TO interpretations;
  END IF;

  -- Only proceed if interpretations table now exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'interpretations') THEN
    RETURN;
  END IF;

  -- Update indexes (they should auto-rename with the table, but let's be explicit)
  -- Drop old index names if they exist
  DROP INDEX IF EXISTS idx_interpretation_runs_user;
  DROP INDEX IF EXISTS idx_interpretation_runs_source;
  DROP INDEX IF EXISTS idx_interpretation_runs_status;
  DROP INDEX IF EXISTS idx_interpretation_runs_created_at;

  -- Create indexes with new names (only if table has these columns)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'interpretations' AND column_name = 'user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_interpretations_user ON interpretations(user_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'interpretations' AND column_name = 'source_id') THEN
    CREATE INDEX IF NOT EXISTS idx_interpretations_source ON interpretations(source_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'interpretations' AND column_name = 'status') THEN
    CREATE INDEX IF NOT EXISTS idx_interpretations_status ON interpretations(status);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'interpretations' AND column_name = 'created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_interpretations_created_at ON interpretations(created_at DESC);
  END IF;

  -- Update RLS policy names (only if we renamed the table)
  -- If interpretations table was created by seed migration, policies already exist
  -- Only update if we actually renamed from interpretation_runs
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'interpretations' AND policyname = 'Service role full access - interpretation_runs') THEN
    DROP POLICY IF EXISTS "Service role full access - interpretation_runs" ON interpretations;
    DROP POLICY IF EXISTS "Service role full access - interpretations" ON interpretations;
    CREATE POLICY "Service role full access - interpretations"
      ON interpretations
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'interpretations' AND policyname = 'Users read own interpretation runs') THEN
    DROP POLICY IF EXISTS "Users read own interpretation runs" ON interpretations;
    DROP POLICY IF EXISTS "Users read own interpretations" ON interpretations;
    CREATE POLICY "Users read own interpretations"
      ON interpretations
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  -- Update table comment
  COMMENT ON TABLE interpretations IS 'Versioned interpretation attempts with config logging for auditability (canonical vocabulary term: Interpretation)';
  
  -- Update column comments (only if columns exist)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'interpretations' AND column_name = 'interpretation_config') THEN
    COMMENT ON COLUMN interpretations.interpretation_config IS 'JSONB: provider, model_id, temperature, prompt_hash, code_version, feature_flags';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'interpretations' AND column_name = 'status') THEN
    COMMENT ON COLUMN interpretations.status IS 'Current status: pending, running, completed, failed';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'interpretations' AND column_name = 'observations_created') THEN
    COMMENT ON COLUMN interpretations.observations_created IS 'Count of observations created from this interpretation';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'interpretations' AND column_name = 'unknown_field_count') THEN
    COMMENT ON COLUMN interpretations.unknown_field_count IS 'Count of unknown fields routed to raw_fragments';
  END IF;

END $$;
