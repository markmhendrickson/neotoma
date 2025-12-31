-- Migration: FU-116 - Entity Merges Table
-- Created: 2025-12-31
-- Description: Merge audit log with TEXT IDs

-- Entity merges table for audit log
CREATE TABLE IF NOT EXISTS entity_merges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  from_entity_id TEXT NOT NULL,
  to_entity_id TEXT NOT NULL,
  observations_moved INTEGER NOT NULL DEFAULT 0,
  merged_at TIMESTAMPTZ DEFAULT NOW(),
  merged_by TEXT,
  merge_reason TEXT,
  
  -- Ensure same merge doesn't happen twice
  UNIQUE(user_id, from_entity_id, to_entity_id)
);

-- Add foreign key constraints
ALTER TABLE entity_merges
  ADD CONSTRAINT fk_entity_merges_from
  FOREIGN KEY (from_entity_id)
  REFERENCES entities(id);

ALTER TABLE entity_merges
  ADD CONSTRAINT fk_entity_merges_to
  FOREIGN KEY (to_entity_id)
  REFERENCES entities(id);

-- Indexes for entity_merges
CREATE INDEX IF NOT EXISTS idx_entity_merges_user ON entity_merges(user_id);
CREATE INDEX IF NOT EXISTS idx_entity_merges_from ON entity_merges(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_merges_to ON entity_merges(to_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_merges_merged_at ON entity_merges(merged_at DESC);

-- Enable RLS
ALTER TABLE entity_merges ENABLE ROW LEVEL SECURITY;

-- Service role has full access
DROP POLICY IF EXISTS "Service role full access - entity_merges" ON entity_merges;
CREATE POLICY "Service role full access - entity_merges"
  ON entity_merges
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can only read their own merge history
DROP POLICY IF EXISTS "Users read own entity merges" ON entity_merges;
CREATE POLICY "Users read own entity merges"
  ON entity_merges
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE entity_merges IS 'Audit log for entity merge operations';
COMMENT ON COLUMN entity_merges.from_entity_id IS 'Source entity (marked as merged)';
COMMENT ON COLUMN entity_merges.to_entity_id IS 'Target entity (receives observations)';
COMMENT ON COLUMN entity_merges.observations_moved IS 'Count of observations rewritten';
COMMENT ON COLUMN entity_merges.merged_by IS 'User or agent that performed merge';
COMMENT ON COLUMN entity_merges.merge_reason IS 'Optional reason for merge';

