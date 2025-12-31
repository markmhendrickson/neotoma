-- Migration: Update entity_snapshots RLS policies
-- Created: 2025-12-31
-- Description: Update RLS policies for entity_snapshots to use user_id

-- Enable RLS if not already enabled
ALTER TABLE entity_snapshots ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Service role full access - entity_snapshots" ON entity_snapshots;
DROP POLICY IF EXISTS "public read - entity_snapshots" ON entity_snapshots;

-- Service role has full access
CREATE POLICY "Service role full access - entity_snapshots"
  ON entity_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can only read their own entity snapshots
CREATE POLICY "Users read own entity snapshots"
  ON entity_snapshots
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

