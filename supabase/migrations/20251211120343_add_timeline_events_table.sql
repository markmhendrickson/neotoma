-- Migration: Add timeline_events table (FU-102)
-- Created: 2025-12-11
-- Description: Creates timeline_events table for storing timeline events generated from date fields in records

-- Timeline events table (FU-102)
CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  event_timestamp TIMESTAMPTZ NOT NULL,
  source_record_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  source_field TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for timeline_events
CREATE INDEX IF NOT EXISTS idx_timeline_events_record ON timeline_events(source_record_id);
CREATE INDEX IF NOT EXISTS idx_timeline_events_timestamp ON timeline_events(event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_events_type ON timeline_events(event_type);
CREATE INDEX IF NOT EXISTS idx_timeline_events_type_timestamp ON timeline_events(event_type, event_timestamp DESC);

-- RLS policies
ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;

-- Service role full access
DROP POLICY IF EXISTS "Service role full access - timeline_events" ON timeline_events;
CREATE POLICY "Service role full access - timeline_events" ON timeline_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Public read access (for v0.1.0 single-user)
DROP POLICY IF EXISTS "public read - timeline_events" ON timeline_events;
CREATE POLICY "public read - timeline_events" ON timeline_events FOR SELECT USING (true);

-- Add comment to table
COMMENT ON TABLE timeline_events IS 'Stores timeline events generated from date fields in records. Event IDs are deterministic hash-based (evt_{sha256(record_id:field:date)}).';







