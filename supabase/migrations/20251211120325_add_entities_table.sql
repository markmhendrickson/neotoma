-- Migration: Add entities table (FU-101)
-- Created: 2025-12-11
-- Description: Creates entities table for storing resolved entities with canonical names and aliases

-- Entities table (FU-101)
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  aliases JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for entities
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_canonical_name ON entities(canonical_name);
CREATE INDEX IF NOT EXISTS idx_entities_type_name ON entities(entity_type, canonical_name);

-- RLS policies
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

-- Service role full access
DROP POLICY IF EXISTS "Service role full access - entities" ON entities;
CREATE POLICY "Service role full access - entities" ON entities
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Public read access (for v0.1.0 single-user)
DROP POLICY IF EXISTS "public read - entities" ON entities;
CREATE POLICY "public read - entities" ON entities FOR SELECT USING (true);

-- Add comment to table
COMMENT ON TABLE entities IS 'Stores resolved entities with canonical names. Entity IDs are deterministic hash-based (ent_{sha256(type:normalized_name)}).';







