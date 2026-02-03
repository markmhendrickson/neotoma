-- Migration: Add relationship observations and snapshots
-- Purpose: Implement relationship snapshots following entity snapshot pattern
-- Reference: docs/.cursor/plans/relationship_snapshots_implementation_af6be12b.plan.md

-- ============================================================================
-- 1. Create relationship_observations table
-- ============================================================================

CREATE TABLE IF NOT EXISTS relationship_observations (
  id UUID PRIMARY KEY,
  relationship_key TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
  interpretation_id UUID REFERENCES interpretations(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL,
  specificity_score NUMERIC(3,2),
  source_priority INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  canonical_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL,
  CONSTRAINT unique_relationship_observation UNIQUE(source_id, interpretation_id, relationship_key, canonical_hash, user_id)
);

-- Indexes for relationship_observations
CREATE INDEX IF NOT EXISTS idx_relationship_observations_key ON relationship_observations(relationship_key);
CREATE INDEX IF NOT EXISTS idx_relationship_observations_type ON relationship_observations(relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationship_observations_source_entity ON relationship_observations(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationship_observations_target_entity ON relationship_observations(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationship_observations_source ON relationship_observations(source_id);
CREATE INDEX IF NOT EXISTS idx_relationship_observations_interpretation ON relationship_observations(interpretation_id);
CREATE INDEX IF NOT EXISTS idx_relationship_observations_user ON relationship_observations(user_id);
CREATE INDEX IF NOT EXISTS idx_relationship_observations_observed_at ON relationship_observations(observed_at);

-- RLS for relationship_observations
ALTER TABLE relationship_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own relationship_observations" ON relationship_observations;
CREATE POLICY "Users read own relationship_observations" ON relationship_observations
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access to relationship_observations" ON relationship_observations;
CREATE POLICY "Service role full access to relationship_observations" ON relationship_observations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 2. Create relationship_snapshots table
-- ============================================================================

CREATE TABLE IF NOT EXISTS relationship_snapshots (
  relationship_key TEXT PRIMARY KEY,
  relationship_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT '1.0',
  snapshot JSONB NOT NULL DEFAULT '{}',
  computed_at TIMESTAMPTZ NOT NULL,
  observation_count INTEGER NOT NULL DEFAULT 0,
  last_observation_at TIMESTAMPTZ NOT NULL,
  provenance JSONB NOT NULL DEFAULT '{}',
  user_id UUID NOT NULL
);

-- Indexes for relationship_snapshots
CREATE INDEX IF NOT EXISTS idx_relationship_snapshots_type ON relationship_snapshots(relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationship_snapshots_source_entity ON relationship_snapshots(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationship_snapshots_target_entity ON relationship_snapshots(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationship_snapshots_user ON relationship_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_relationship_snapshots_snapshot ON relationship_snapshots USING GIN(snapshot);

-- RLS for relationship_snapshots
ALTER TABLE relationship_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own relationship_snapshots" ON relationship_snapshots;
CREATE POLICY "Users read own relationship_snapshots" ON relationship_snapshots
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access to relationship_snapshots" ON relationship_snapshots;
CREATE POLICY "Service role full access to relationship_snapshots" ON relationship_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 3. Add helpful comments
-- ============================================================================

COMMENT ON TABLE relationship_observations IS 'Stores observations about relationships from multiple sources, enabling deterministic merging';
COMMENT ON TABLE relationship_snapshots IS 'Stores computed snapshots of relationships, representing current truth merged from observations';
COMMENT ON COLUMN relationship_observations.relationship_key IS 'Composite key: {relationship_type}:{source_entity_id}:{target_entity_id}';
COMMENT ON COLUMN relationship_observations.canonical_hash IS 'Hash of canonicalized metadata for idempotence checking';
COMMENT ON COLUMN relationship_snapshots.provenance IS 'Maps metadata field → observation_id for full traceability';
