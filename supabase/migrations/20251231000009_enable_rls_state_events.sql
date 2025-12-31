-- Migration: Enable RLS on state_events table
-- Created: 2025-12-31
-- Description: Fix security issue - state_events table missing RLS

-- Enable RLS if not already enabled
ALTER TABLE state_events ENABLE ROW LEVEL SECURITY;

-- Service role has full access
DROP POLICY IF EXISTS "Service role full access - state_events" ON state_events;
CREATE POLICY "Service role full access - state_events"
  ON state_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Public read access for state_events (for historical queries)
DROP POLICY IF EXISTS "public read - state_events" ON state_events;
CREATE POLICY "public read - state_events" ON state_events
  FOR SELECT USING (true);

COMMENT ON TABLE state_events IS 'Append-only event log for event-sourcing architecture. Events are immutable and serve as the single source of truth for state changes.';

