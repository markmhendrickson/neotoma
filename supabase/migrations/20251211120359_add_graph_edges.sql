-- Migration: Add graph edge tables (FU-103)
-- Created: 2025-12-11
-- Description: Creates graph edge tables for linking records, entities, and events in the memory graph

-- Record-Entity edges table
CREATE TABLE IF NOT EXISTS record_entity_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  edge_type TEXT NOT NULL DEFAULT 'EXTRACTED_FROM',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for record_entity_edges
CREATE INDEX IF NOT EXISTS idx_record_entity_edges_record ON record_entity_edges(record_id);
CREATE INDEX IF NOT EXISTS idx_record_entity_edges_entity ON record_entity_edges(entity_id);
CREATE INDEX IF NOT EXISTS idx_record_entity_edges_type ON record_entity_edges(edge_type);

-- Record-Event edges table
CREATE TABLE IF NOT EXISTS record_event_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  edge_type TEXT NOT NULL DEFAULT 'GENERATED_FROM',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for record_event_edges
CREATE INDEX IF NOT EXISTS idx_record_event_edges_record ON record_event_edges(record_id);
CREATE INDEX IF NOT EXISTS idx_record_event_edges_event ON record_event_edges(event_id);
CREATE INDEX IF NOT EXISTS idx_record_event_edges_type ON record_event_edges(edge_type);

-- Entity-Event edges table
CREATE TABLE IF NOT EXISTS entity_event_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  edge_type TEXT NOT NULL DEFAULT 'INVOLVES',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for entity_event_edges
CREATE INDEX IF NOT EXISTS idx_entity_event_edges_entity ON entity_event_edges(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_event_edges_event ON entity_event_edges(event_id);
CREATE INDEX IF NOT EXISTS idx_entity_event_edges_type ON entity_event_edges(edge_type);

-- RLS policies for record_entity_edges
ALTER TABLE record_entity_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - record_entity_edges" ON record_entity_edges;
CREATE POLICY "Service role full access - record_entity_edges" ON record_entity_edges
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public read - record_entity_edges" ON record_entity_edges;
CREATE POLICY "public read - record_entity_edges" ON record_entity_edges FOR SELECT USING (true);

-- RLS policies for record_event_edges
ALTER TABLE record_event_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - record_event_edges" ON record_event_edges;
CREATE POLICY "Service role full access - record_event_edges" ON record_event_edges
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public read - record_event_edges" ON record_event_edges;
CREATE POLICY "public read - record_event_edges" ON record_event_edges FOR SELECT USING (true);

-- RLS policies for entity_event_edges
ALTER TABLE entity_event_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - entity_event_edges" ON entity_event_edges;
CREATE POLICY "Service role full access - entity_event_edges" ON entity_event_edges
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public read - entity_event_edges" ON entity_event_edges;
CREATE POLICY "public read - entity_event_edges" ON entity_event_edges FOR SELECT USING (true);

-- Add comments to tables
COMMENT ON TABLE record_entity_edges IS 'Links records to entities extracted from them';
COMMENT ON TABLE record_event_edges IS 'Links records to timeline events generated from them';
COMMENT ON TABLE entity_event_edges IS 'Links entities to timeline events they are involved in';

