-- Seed Migration: Create Base Tables
-- Created: 2024-01-01
-- Description: Creates all base tables required by subsequent migrations
--              This migration runs first (earliest timestamp) to ensure base schema exists
--              for local Supabase instances and fresh database setups

-- ============================================================================
-- 0. Enable Required Extensions
-- ============================================================================

-- Enable vector extension for embeddings (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- 1. Sources Table (No dependencies)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  storage_status TEXT NOT NULL DEFAULT 'uploaded',
  mime_type TEXT NOT NULL,
  file_name TEXT,
  byte_size INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_agent_id TEXT,
  source_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL,
  CONSTRAINT unique_content_per_user UNIQUE(content_hash, user_id)
);

CREATE INDEX IF NOT EXISTS idx_sources_hash ON sources(content_hash);
CREATE INDEX IF NOT EXISTS idx_sources_user ON sources(user_id);
CREATE INDEX IF NOT EXISTS idx_sources_created ON sources(created_at DESC);

ALTER TABLE sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own sources" ON sources;
CREATE POLICY "Users read own sources" ON sources
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access - sources" ON sources;
CREATE POLICY "Service role full access - sources" ON sources
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE sources IS 'Stores raw content with content-addressed deduplication. Central to sources-first ingestion architecture.';

-- ============================================================================
-- 2. Interpretations Table (Depends on sources)
-- ============================================================================

CREATE TABLE IF NOT EXISTS interpretations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  interpretation_config JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  extracted_entities JSONB DEFAULT '[]',
  confidence NUMERIC(3,2),
  unknown_field_count INTEGER NOT NULL DEFAULT 0,
  extraction_completeness TEXT DEFAULT 'unknown' 
    CHECK (extraction_completeness IN ('complete', 'partial', 'failed', 'unknown')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  user_id UUID NOT NULL,
  timeout_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  observations_created INTEGER DEFAULT 0,
  interpretation_id UUID -- Self-reference for versioning (nullable)
);

-- Ensure archived_at exists when interpretations table pre-exists
ALTER TABLE interpretations
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE interpretations
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_interpretations_source ON interpretations(source_id);
CREATE INDEX IF NOT EXISTS idx_interpretations_status ON interpretations(status);
CREATE INDEX IF NOT EXISTS idx_interpretations_user ON interpretations(user_id);
CREATE INDEX IF NOT EXISTS idx_interpretations_active ON interpretations(source_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_interpretations_stale ON interpretations(heartbeat_at) WHERE status = 'running';

ALTER TABLE interpretations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own interpretations" ON interpretations;
CREATE POLICY "Users read own interpretations" ON interpretations
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access - interpretations" ON interpretations;
CREATE POLICY "Service role full access - interpretations" ON interpretations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE interpretations IS 'Versioned interpretation attempts with config logging for auditability (canonical vocabulary term: Interpretation)';
COMMENT ON COLUMN interpretations.interpretation_config IS 'JSONB: provider, model_id, temperature, prompt_hash, code_version, feature_flags';

-- ============================================================================
-- 3. Entities Table (No dependencies)
-- ============================================================================

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  aliases JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL,
  merged_to_entity_id TEXT REFERENCES entities(id),
  merged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_canonical_name ON entities(canonical_name);
CREATE INDEX IF NOT EXISTS idx_entities_type_name ON entities(entity_type, canonical_name);
CREATE INDEX IF NOT EXISTS idx_entities_user ON entities(user_id);

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own entities" ON entities;
CREATE POLICY "Users read own entities" ON entities
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access - entities" ON entities;
CREATE POLICY "Service role full access - entities" ON entities
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE entities IS 'Stores canonical entities (people, companies, locations) with deterministic hash-based IDs';

-- ============================================================================
-- 4. Records Table (No dependencies, but may reference entities)
-- ============================================================================

CREATE TABLE IF NOT EXISTS records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}',
  file_urls JSONB DEFAULT '[]',
  external_source TEXT,
  external_id TEXT,
  external_hash TEXT,
  summary TEXT,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_records_type ON records(type);
CREATE INDEX IF NOT EXISTS idx_records_properties ON records USING GIN(properties);
CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_external_hash ON records(external_hash) WHERE external_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_records_user_id ON records(user_id) WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_records_external_source_id_unique
  ON records (external_source, external_id)
  WHERE external_source IS NOT NULL AND external_id IS NOT NULL;

ALTER TABLE records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own records" ON records;
CREATE POLICY "Users read own records" ON records
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access - records" ON records;
CREATE POLICY "Service role full access - records" ON records
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE records IS 'Central table storing all ingested user documents and their extracted truth';

-- ============================================================================
-- 5. Observations Table (Depends on sources, interpretations, entities)
-- ============================================================================

CREATE TABLE IF NOT EXISTS observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id TEXT NOT NULL REFERENCES entities(id),
  entity_type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  source_record_id UUID REFERENCES records(id),
  source_id UUID REFERENCES sources(id),
  interpretation_id UUID REFERENCES interpretations(id),
  observed_at TIMESTAMPTZ NOT NULL,
  specificity_score NUMERIC(3,2) CHECK (specificity_score BETWEEN 0 AND 1),
  source_priority INTEGER DEFAULT 0,
  fields JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_observations_entity ON observations(entity_id);
CREATE INDEX IF NOT EXISTS idx_observations_entity_type ON observations(entity_type);
CREATE INDEX IF NOT EXISTS idx_observations_source ON observations(source_id);
CREATE INDEX IF NOT EXISTS idx_observations_interpretation ON observations(interpretation_id);
CREATE INDEX IF NOT EXISTS idx_observations_user ON observations(user_id);
CREATE INDEX IF NOT EXISTS idx_observations_observed_at ON observations(observed_at DESC);

ALTER TABLE observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own observations" ON observations;
CREATE POLICY "Users read own observations" ON observations
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access - observations" ON observations;
CREATE POLICY "Service role full access - observations" ON observations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE observations IS 'Store granular, source-specific facts extracted from documents. Links to sources and interpretations for full provenance.';

-- ============================================================================
-- 6. Relationships Table (Depends on entities)
-- ============================================================================

CREATE TABLE IF NOT EXISTS relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_id TEXT NOT NULL REFERENCES entities(id),
  target_entity_id TEXT NOT NULL REFERENCES entities(id),
  relationship_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  source_id UUID REFERENCES sources(id),
  source_material_id UUID REFERENCES sources(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_relationships_source_entity ON relationships(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target_entity ON relationships(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationships_user ON relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_relationships_source_material ON relationships(source_material_id) WHERE source_material_id IS NOT NULL;

ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own relationships" ON relationships;
CREATE POLICY "Users read own relationships" ON relationships
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access - relationships" ON relationships;
CREATE POLICY "Service role full access - relationships" ON relationships
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE relationships IS 'Graph edges between entities. Links entities with typed relationships and metadata.';

-- ============================================================================
-- 7. Raw Fragments Table (Depends on sources, interpretations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS raw_fragments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES sources(id),
  interpretation_id UUID REFERENCES interpretations(id),
  entity_type TEXT NOT NULL,
  fragment_key TEXT NOT NULL,
  fragment_value JSONB NOT NULL,
  fragment_envelope JSONB NOT NULL,
  frequency_count INTEGER DEFAULT 1,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  record_id UUID REFERENCES records(id),
  user_id UUID NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_raw_fragments_source ON raw_fragments(source_id);
CREATE INDEX IF NOT EXISTS idx_raw_fragments_interpretation ON raw_fragments(interpretation_id);
CREATE INDEX IF NOT EXISTS idx_raw_fragments_entity_type ON raw_fragments(entity_type);
CREATE INDEX IF NOT EXISTS idx_raw_fragments_key ON raw_fragments(fragment_key);
CREATE INDEX IF NOT EXISTS idx_raw_fragments_frequency ON raw_fragments(fragment_key, frequency_count DESC);
CREATE INDEX IF NOT EXISTS idx_raw_fragments_user ON raw_fragments(user_id);

ALTER TABLE raw_fragments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own raw_fragments" ON raw_fragments;
CREATE POLICY "Users read own raw_fragments" ON raw_fragments
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access - raw_fragments" ON raw_fragments;
CREATE POLICY "Service role full access - raw_fragments" ON raw_fragments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE raw_fragments IS 'Store unknown fields that do not match current schemas. Enables schema discovery and automated promotion.';

-- ============================================================================
-- 8. Timeline Events Table (Depends on sources, records)
-- ============================================================================

CREATE TABLE IF NOT EXISTS timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  entity_id TEXT REFERENCES entities(id),
  record_id UUID REFERENCES records(id),
  source_id UUID REFERENCES sources(id),
  source_record_id UUID REFERENCES records(id),
  event_data JSONB DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timeline_events' AND column_name = 'entity_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_timeline_events_entity ON timeline_events(entity_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timeline_events' AND column_name = 'record_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_timeline_events_record ON timeline_events(record_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timeline_events' AND column_name = 'source_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_timeline_events_source ON timeline_events(source_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_timeline_events_type ON timeline_events(event_type);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timeline_events' AND column_name = 'occurred_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_timeline_events_occurred_at
      ON timeline_events(occurred_at DESC);
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timeline_events' AND column_name = 'user_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_timeline_events_user ON timeline_events(user_id);
  END IF;
END $$;

ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timeline_events' AND column_name = 'user_id'
  ) THEN
    DROP POLICY IF EXISTS "Users read own timeline_events" ON timeline_events;
    CREATE POLICY "Users read own timeline_events" ON timeline_events
      FOR SELECT USING (user_id = auth.uid());
  END IF;
END $$;

DROP POLICY IF EXISTS "Service role full access - timeline_events" ON timeline_events;
CREATE POLICY "Service role full access - timeline_events" ON timeline_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE timeline_events IS 'Chronological event log for entities and records. Enables timeline views and event-based queries.';

-- ============================================================================
-- 9. Schema Registry Table (No dependencies)
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  schema_definition JSONB NOT NULL,
  reducer_config JSONB NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id),
  scope TEXT DEFAULT 'global' CHECK (scope IN ('global', 'user'))
);

CREATE UNIQUE INDEX IF NOT EXISTS schema_registry_unique 
ON schema_registry(entity_type, schema_version, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_schema_registry_active ON schema_registry(entity_type, active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_schema_registry_user ON schema_registry(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schema_registry_scope_active ON schema_registry(scope, entity_type, active) WHERE active = true;

ALTER TABLE schema_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read schema_registry" ON schema_registry;
CREATE POLICY "Users read schema_registry" ON schema_registry
  FOR SELECT USING (scope = 'global' OR user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access - schema_registry" ON schema_registry;
CREATE POLICY "Service role full access - schema_registry" ON schema_registry
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE schema_registry IS 'Stores entity schema definitions and reducer configurations. Enables schema versioning and merge policy configuration.';
