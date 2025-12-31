-- Migration: FU-111 - Interpretation Runs Table
-- Created: 2025-12-31
-- Description: Versioned interpretation tracking with config logging

-- Interpretation runs table
CREATE TABLE IF NOT EXISTS interpretation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_id UUID NOT NULL REFERENCES sources(id),
  interpretation_config JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  observations_created INTEGER DEFAULT 0,
  unknown_fields_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for interpretation_runs
CREATE INDEX IF NOT EXISTS idx_interpretation_runs_user ON interpretation_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_interpretation_runs_source ON interpretation_runs(source_id);
CREATE INDEX IF NOT EXISTS idx_interpretation_runs_status ON interpretation_runs(status);
CREATE INDEX IF NOT EXISTS idx_interpretation_runs_created_at ON interpretation_runs(created_at DESC);

-- Enable RLS
ALTER TABLE interpretation_runs ENABLE ROW LEVEL SECURITY;

-- Service role has full access
DROP POLICY IF EXISTS "Service role full access - interpretation_runs" ON interpretation_runs;
CREATE POLICY "Service role full access - interpretation_runs"
  ON interpretation_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can only read their own interpretation runs
DROP POLICY IF EXISTS "Users read own interpretation runs" ON interpretation_runs;
CREATE POLICY "Users read own interpretation runs"
  ON interpretation_runs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE interpretation_runs IS 'Versioned interpretation attempts with config logging for auditability';
COMMENT ON COLUMN interpretation_runs.interpretation_config IS 'JSONB: provider, model_id, temperature, prompt_hash, code_version, feature_flags';
COMMENT ON COLUMN interpretation_runs.status IS 'Current status: pending, running, completed, failed';
COMMENT ON COLUMN interpretation_runs.observations_created IS 'Count of observations created from this run';
COMMENT ON COLUMN interpretation_runs.unknown_fields_count IS 'Count of unknown fields routed to raw_fragments';

