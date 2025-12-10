-- Migration: Add observation architecture tables (FU-055, FU-057)
-- Created: 2025-12-09
-- Description: Creates observations, entity_snapshots, raw_fragments, and schema_registry tables

-- Observations table (FU-055)
CREATE TABLE IF NOT EXISTS observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  source_record_id UUID NOT NULL REFERENCES records(id),
  observed_at TIMESTAMPTZ NOT NULL,
  specificity_score NUMERIC(3,2) CHECK (specificity_score BETWEEN 0 AND 1),
  source_priority INTEGER DEFAULT 0,
  fields JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL
);

-- Entity snapshots table (FU-055)
CREATE TABLE IF NOT EXISTS entity_snapshots (
  entity_id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL,
  observation_count INTEGER NOT NULL,
  last_observation_at TIMESTAMPTZ NOT NULL,
  provenance JSONB NOT NULL,
  user_id UUID NOT NULL
);

-- Raw fragments table (FU-055)
CREATE TABLE IF NOT EXISTS raw_fragments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES records(id),
  fragment_type TEXT NOT NULL,
  fragment_key TEXT NOT NULL,
  fragment_value JSONB NOT NULL,
  fragment_envelope JSONB NOT NULL,
  frequency_count INTEGER DEFAULT 1,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- Schema registry table (FU-057)
CREATE TABLE IF NOT EXISTS schema_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  schema_definition JSONB NOT NULL,
  reducer_config JSONB NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_type, schema_version)
);

-- Indexes for observations
CREATE INDEX IF NOT EXISTS idx_observations_entity ON observations(entity_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_observations_record ON observations(source_record_id);
CREATE INDEX IF NOT EXISTS idx_observations_user ON observations(user_id);

-- Indexes for entity_snapshots
CREATE INDEX IF NOT EXISTS idx_snapshots_type ON entity_snapshots(entity_type);
CREATE INDEX IF NOT EXISTS idx_snapshots_user ON entity_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_snapshot ON entity_snapshots USING GIN(snapshot);

-- Indexes for raw_fragments
CREATE INDEX IF NOT EXISTS idx_fragments_record ON raw_fragments(record_id);
CREATE INDEX IF NOT EXISTS idx_fragments_frequency ON raw_fragments(fragment_key, frequency_count DESC);

-- Index for schema_registry
CREATE INDEX IF NOT EXISTS idx_schema_active ON schema_registry(entity_type, active) WHERE active = true;

-- RLS policies (v0.1.0 is single-user, but we'll set up RLS for future multi-user support)
ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_fragments ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_registry ENABLE ROW LEVEL SECURITY;

-- Service role full access
DROP POLICY IF EXISTS "Service role full access - observations" ON observations;
CREATE POLICY "Service role full access - observations" ON observations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access - entity_snapshots" ON entity_snapshots;
CREATE POLICY "Service role full access - entity_snapshots" ON entity_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access - raw_fragments" ON raw_fragments;
CREATE POLICY "Service role full access - raw_fragments" ON raw_fragments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access - schema_registry" ON schema_registry;
CREATE POLICY "Service role full access - schema_registry" ON schema_registry
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Public read access (for v0.1.0 single-user)
DROP POLICY IF EXISTS "public read - observations" ON observations;
CREATE POLICY "public read - observations" ON observations FOR SELECT USING (true);

DROP POLICY IF EXISTS "public read - entity_snapshots" ON entity_snapshots;
CREATE POLICY "public read - entity_snapshots" ON entity_snapshots FOR SELECT USING (true);

DROP POLICY IF EXISTS "public read - raw_fragments" ON raw_fragments;
CREATE POLICY "public read - raw_fragments" ON raw_fragments FOR SELECT USING (true);

DROP POLICY IF EXISTS "public read - schema_registry" ON schema_registry;
CREATE POLICY "public read - schema_registry" ON schema_registry FOR SELECT USING (true);

-- Relationships table (FU-059)
CREATE TABLE IF NOT EXISTS relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  source_record_id UUID REFERENCES records(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL
);

-- Indexes for relationships
CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(relationship_type);

-- RLS policies
ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - relationships" ON relationships;
CREATE POLICY "Service role full access - relationships" ON relationships
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public read - relationships" ON relationships;
CREATE POLICY "public read - relationships" ON relationships FOR SELECT USING (true);

