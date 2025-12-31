-- Migration: Add record_relationships table
-- Created: 2025-12-31
-- Description: Creates record_relationships table for record-to-record relationships
-- This table was defined in schema.sql but missing from migrations

-- Relationships between records
CREATE TABLE IF NOT EXISTS record_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_record_relationships_source ON record_relationships(source_id);
CREATE INDEX IF NOT EXISTS idx_record_relationships_target ON record_relationships(target_id);

ALTER TABLE record_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - record_relationships" ON record_relationships;
CREATE POLICY "Service role full access - record_relationships" ON record_relationships
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "public read - record_relationships" ON record_relationships;
CREATE POLICY "public read - record_relationships" ON record_relationships
  FOR SELECT USING (true);

