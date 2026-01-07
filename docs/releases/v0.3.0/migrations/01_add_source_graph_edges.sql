-- Migration: Add source-based graph edges for v0.3.0
-- Created: 2025-01-01
-- Description: Replace record-based graph edges with source-based graph edges

-- Source-Entity edges table (replaces record_entity_edges)
CREATE TABLE IF NOT EXISTS source_entity_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  edge_type TEXT NOT NULL DEFAULT 'EXTRACTED_FROM',
  interpretation_run_id UUID REFERENCES interpretation_runs(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for source_entity_edges
CREATE INDEX IF NOT EXISTS idx_source_entity_edges_source ON source_entity_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_source_entity_edges_entity ON source_entity_edges(entity_id);
CREATE INDEX IF NOT EXISTS idx_source_entity_edges_type ON source_entity_edges(edge_type);
CREATE INDEX IF NOT EXISTS idx_source_entity_edges_interpretation ON source_entity_edges(interpretation_run_id);

-- RLS policies for source_entity_edges
ALTER TABLE source_entity_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - source_entity_edges" ON source_entity_edges;
CREATE POLICY "Service role full access - source_entity_edges" ON source_entity_edges
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Users can read edges for their own sources
DROP POLICY IF EXISTS "Users read own source entity edges" ON source_entity_edges;
CREATE POLICY "Users read own source entity edges"
  ON source_entity_edges
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sources
      WHERE sources.id = source_entity_edges.source_id
      AND sources.user_id = auth.uid()
    )
  );

COMMENT ON TABLE source_entity_edges IS 'Links sources to entities extracted from them (replaces record_entity_edges)';
COMMENT ON COLUMN source_entity_edges.interpretation_run_id IS 'Which interpretation run created this edge (for provenance)';

-- Source-Event edges table (replaces record_event_edges)
CREATE TABLE IF NOT EXISTS source_event_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  edge_type TEXT NOT NULL DEFAULT 'GENERATED_FROM',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for source_event_edges
CREATE INDEX IF NOT EXISTS idx_source_event_edges_source ON source_event_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_source_event_edges_event ON source_event_edges(event_id);
CREATE INDEX IF NOT EXISTS idx_source_event_edges_type ON source_event_edges(edge_type);

-- RLS policies for source_event_edges
ALTER TABLE source_event_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - source_event_edges" ON source_event_edges;
CREATE POLICY "Service role full access - source_event_edges" ON source_event_edges
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Users can read edges for their own sources
DROP POLICY IF EXISTS "Users read own source event edges" ON source_event_edges;
CREATE POLICY "Users read own source event edges"
  ON source_event_edges
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sources
      WHERE sources.id = source_event_edges.source_id
      AND sources.user_id = auth.uid()
    )
  );

COMMENT ON TABLE source_event_edges IS 'Links sources to timeline events generated from them (replaces record_event_edges)';

-- Add source_id to timeline_events (making source_record_id optional for migration)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'timeline_events' AND column_name = 'source_id'
  ) THEN
    ALTER TABLE timeline_events ADD COLUMN source_id UUID REFERENCES sources(id);
  END IF;
END $$;

-- Make source_record_id nullable (for migration period)
ALTER TABLE timeline_events ALTER COLUMN source_record_id DROP NOT NULL;

-- Add index for source_id
CREATE INDEX IF NOT EXISTS idx_timeline_events_source ON timeline_events(source_id);

COMMENT ON COLUMN timeline_events.source_id IS 'Link to source that generated this event (new architecture)';
COMMENT ON COLUMN timeline_events.source_record_id IS 'DEPRECATED: Legacy link to record (use source_id instead)';

-- Add check constraint to ensure at least one reference exists
ALTER TABLE timeline_events DROP CONSTRAINT IF EXISTS timeline_events_source_check;
ALTER TABLE timeline_events ADD CONSTRAINT timeline_events_source_check
  CHECK (source_record_id IS NOT NULL OR source_id IS NOT NULL);





