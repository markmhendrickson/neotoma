-- Create extensions schema for better security organization
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO public;

-- Install vector extension in extensions schema (not public)
CREATE EXTENSION IF NOT EXISTS vector SCHEMA extensions;
-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create records table
-- NOTE: Records table is kept for backward compatibility with graph/timeline infrastructure
-- (timeline_events, record_entity_edges, record_event_edges, record_relationships, raw_fragments)
-- New ingestion uses sources/payloads architecture, but graph edges still reference records
CREATE TABLE IF NOT EXISTS records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}',
  file_urls JSONB DEFAULT '[]',
  external_source TEXT,
  external_id TEXT,
  external_hash TEXT,
  embedding vector(1536),
  summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create GIN index on type for fast filtering
CREATE INDEX IF NOT EXISTS idx_records_type ON records(type);

-- Create GIN index on properties for fast JSONB queries
CREATE INDEX IF NOT EXISTS idx_records_properties ON records USING GIN(properties);

-- Create vector index for semantic similarity search
CREATE INDEX IF NOT EXISTS idx_records_embedding ON records USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_external_id ON records ((properties->>'external_id'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_records_external_source_id_unique
  ON records (external_source, external_id)
  WHERE external_source IS NOT NULL AND external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_records_external_hash ON records (external_hash)
  WHERE external_hash IS NOT NULL;

-- Create function to update updated_at timestamp
-- Set search_path to prevent search_path injection attacks
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_records_updated_at ON records;
CREATE TRIGGER update_records_updated_at
  BEFORE UPDATE ON records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security: Allow service role full access
ALTER TABLE records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can do everything" ON records;
CREATE POLICY "Service role can do everything" ON records
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Public read access
DROP POLICY IF EXISTS "public read" ON records;
CREATE POLICY "public read" ON records
  FOR SELECT USING ( true );

-- Authenticated users can insert/update/delete
DROP POLICY IF EXISTS "public write" ON records;
CREATE POLICY "public write" ON records
  FOR ALL
  USING      ( auth.role() = 'authenticated' )
  WITH CHECK ( auth.role() = 'authenticated' );

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
  FOR SELECT USING ( true );

-- Plaid Items table to track linked Plaid items and sync cursors
CREATE TABLE IF NOT EXISTS plaid_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id TEXT UNIQUE NOT NULL,
  institution_id TEXT,
  institution_name TEXT,
  access_token TEXT NOT NULL,
  environment TEXT NOT NULL,
  products JSONB NOT NULL DEFAULT '[]',
  country_codes JSONB NOT NULL DEFAULT '[]',
  cursor TEXT,
  webhook_status TEXT,
  last_successful_sync TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plaid_items_item_id ON plaid_items(item_id);
CREATE INDEX IF NOT EXISTS idx_plaid_items_environment ON plaid_items(environment);

DROP TRIGGER IF EXISTS update_plaid_items_updated_at ON plaid_items;
CREATE TRIGGER update_plaid_items_updated_at
  BEFORE UPDATE ON plaid_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE plaid_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - plaid_items" ON plaid_items;
CREATE POLICY "Service role full access - plaid_items" ON plaid_items
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Sync run history for Plaid pulls
CREATE TABLE IF NOT EXISTS plaid_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaid_item_id UUID NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending',
  added_transactions INTEGER NOT NULL DEFAULT 0,
  modified_transactions INTEGER NOT NULL DEFAULT 0,
  removed_transactions INTEGER NOT NULL DEFAULT 0,
  error JSONB,
  next_cursor TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plaid_sync_runs_item_id ON plaid_sync_runs(plaid_item_id);
CREATE INDEX IF NOT EXISTS idx_plaid_sync_runs_started_at ON plaid_sync_runs(started_at DESC);

DROP TRIGGER IF EXISTS update_plaid_sync_runs_updated_at ON plaid_sync_runs;
CREATE TRIGGER update_plaid_sync_runs_updated_at
  BEFORE UPDATE ON plaid_sync_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE plaid_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - plaid_sync_runs" ON plaid_sync_runs;
CREATE POLICY "Service role full access - plaid_sync_runs" ON plaid_sync_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- External connectors table
CREATE TABLE IF NOT EXISTS external_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  account_identifier TEXT,
  account_label TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  capabilities JSONB NOT NULL DEFAULT '[]',
  oauth_scopes JSONB NOT NULL DEFAULT '[]',
  secrets_envelope TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  sync_cursor JSONB,
  last_successful_sync TIMESTAMP WITH TIME ZONE,
  last_error JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_connectors_provider ON external_connectors(provider);
CREATE INDEX IF NOT EXISTS idx_external_connectors_status ON external_connectors(status);
CREATE INDEX IF NOT EXISTS idx_external_connectors_account_identifier ON external_connectors(account_identifier)
  WHERE account_identifier IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_external_connectors_provider_account
  ON external_connectors(provider, account_identifier)
  WHERE account_identifier IS NOT NULL;

DROP TRIGGER IF EXISTS update_external_connectors_updated_at ON external_connectors;
CREATE TRIGGER update_external_connectors_updated_at
  BEFORE UPDATE ON external_connectors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE external_connectors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - external_connectors" ON external_connectors;
CREATE POLICY "Service role full access - external_connectors" ON external_connectors
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- External sync runs (generic connectors)
CREATE TABLE IF NOT EXISTS external_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id UUID NOT NULL REFERENCES external_connectors(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL DEFAULT 'incremental',
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  stats JSONB NOT NULL DEFAULT '{}',
  cursor JSONB,
  error JSONB,
  trace_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_sync_runs_connector ON external_sync_runs(connector_id);
CREATE INDEX IF NOT EXISTS idx_external_sync_runs_started_at ON external_sync_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_sync_runs_status ON external_sync_runs(status);

DROP TRIGGER IF EXISTS update_external_sync_runs_updated_at ON external_sync_runs;
CREATE TRIGGER update_external_sync_runs_updated_at
  BEFORE UPDATE ON external_sync_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE external_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - external_sync_runs" ON external_sync_runs;
CREATE POLICY "Service role full access - external_sync_runs" ON external_sync_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- State events table for event-sourcing foundation (FU-050)
CREATE TABLE IF NOT EXISTS state_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  record_id TEXT,                        -- For filtering events by record
  previous_event_hash TEXT,              -- For hash chaining (nullable)
  event_hash TEXT,                       -- Computed hash of event (nullable)
  signer_public_key TEXT,                -- For future crypto (nullable)
  signature TEXT,                        -- For future crypto (nullable)
  reducer_version TEXT DEFAULT '1.0',    -- For versioning
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_state_events_record_id ON state_events(record_id);
CREATE INDEX IF NOT EXISTS idx_state_events_timestamp ON state_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_state_events_type ON state_events(event_type);
CREATE INDEX IF NOT EXISTS idx_state_events_previous_hash ON state_events(previous_event_hash) WHERE previous_event_hash IS NOT NULL;

ALTER TABLE state_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - state_events" ON state_events;
CREATE POLICY "Service role full access - state_events" ON state_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Public read access for state_events (for historical queries)
DROP POLICY IF EXISTS "public read - state_events" ON state_events;
CREATE POLICY "public read - state_events" ON state_events
  FOR SELECT USING ( true );

-- Sources table (sources-first ingestion architecture)
CREATE TABLE IF NOT EXISTS sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  content_hash TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  original_filename TEXT,
  provenance JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure content deduplication per user
  UNIQUE(user_id, content_hash)
);

-- Indexes for sources
CREATE INDEX IF NOT EXISTS idx_sources_user ON sources(user_id);
CREATE INDEX IF NOT EXISTS idx_sources_hash ON sources(content_hash);
CREATE INDEX IF NOT EXISTS idx_sources_created_at ON sources(created_at DESC);

-- Enable RLS
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;

-- Service role has full access
DROP POLICY IF EXISTS "Service role full access - sources" ON sources;
CREATE POLICY "Service role full access - sources" 
  ON sources
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- Users can only read their own sources
DROP POLICY IF EXISTS "Users read own sources" ON sources;
CREATE POLICY "Users read own sources"
  ON sources
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE sources IS 'Content-addressed raw storage for sources-first ingestion. SHA-256 hash ensures deduplication per user.';
COMMENT ON COLUMN sources.content_hash IS 'SHA-256 hash of file content for deduplication';
COMMENT ON COLUMN sources.storage_url IS 'Supabase Storage URL path: sources/{user_id}/{content_hash}';
COMMENT ON COLUMN sources.provenance IS 'Metadata: upload_method, client_info, original_source, etc.';

-- Interpretation runs table
CREATE TABLE IF NOT EXISTS interpretation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_id UUID NOT NULL REFERENCES sources(id),
  interpretation_config JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  observations_created INTEGER DEFAULT 0,
  unknown_fields_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for interpretation_runs
CREATE INDEX IF NOT EXISTS idx_interpretation_runs_user ON interpretation_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_interpretation_runs_source ON interpretation_runs(source_id);
CREATE INDEX IF NOT EXISTS idx_interpretation_runs_status ON interpretation_runs(status);
CREATE INDEX IF NOT EXISTS idx_interpretation_runs_created_at ON interpretation_runs(created_at DESC);

-- Enable RLS
ALTER TABLE interpretation_runs ENABLE ROW LEVEL SECURITY;

-- Service role has full access
DROP POLICY IF EXISTS "Service role full access - interpretation_runs" ON interpretation_runs;
CREATE POLICY "Service role full access - interpretation_runs"
  ON interpretation_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can only read their own interpretation runs
DROP POLICY IF EXISTS "Users read own interpretation runs" ON interpretation_runs;
CREATE POLICY "Users read own interpretation runs"
  ON interpretation_runs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE interpretation_runs IS 'Versioned interpretation attempts with config logging for auditability';
COMMENT ON COLUMN interpretation_runs.interpretation_config IS 'JSONB: provider, model_id, temperature, prompt_hash, code_version, feature_flags';
COMMENT ON COLUMN interpretation_runs.status IS 'Current status: pending, running, completed, failed';
COMMENT ON COLUMN interpretation_runs.observations_created IS 'Count of observations created from this run';
COMMENT ON COLUMN interpretation_runs.unknown_fields_count IS 'Count of unknown fields routed to raw_fragments';

-- Payload submissions table (unified ingestion primitive)
CREATE TABLE IF NOT EXISTS payload_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payload_submission_id TEXT UNIQUE NOT NULL,
  payload_content_id TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  body JSONB NOT NULL,
  provenance JSONB NOT NULL,
  client_request_id TEXT,
  embedding vector(1536),
  summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payload_content_id ON payload_submissions(payload_content_id);
CREATE INDEX IF NOT EXISTS idx_payload_capability ON payload_submissions(capability_id);
CREATE INDEX IF NOT EXISTS idx_payload_created_at ON payload_submissions(created_at DESC);

ALTER TABLE payload_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - payload_submissions" ON payload_submissions;
CREATE POLICY "Service role full access - payload_submissions" ON payload_submissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public read - payload_submissions" ON payload_submissions;
CREATE POLICY "public read - payload_submissions" ON payload_submissions FOR SELECT USING (true);

-- Observation architecture tables (FU-055, FU-057)
-- Observations table
CREATE TABLE IF NOT EXISTS observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  source_payload_id UUID REFERENCES payload_submissions(id),  -- Legacy: nullable for v0.2.0+
  source_id UUID REFERENCES sources(id),  -- New: link to raw source content
  interpretation_run_id UUID REFERENCES interpretation_runs(id),  -- Link to interpretation run
  observed_at TIMESTAMPTZ NOT NULL,
  specificity_score NUMERIC(3,2) CHECK (specificity_score BETWEEN 0 AND 1),
  source_priority INTEGER DEFAULT 0,
  fields JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL
);

COMMENT ON COLUMN observations.source_payload_id IS 'Legacy payload submission reference (nullable for v0.2.0+)';
COMMENT ON COLUMN observations.source_id IS 'Link to raw source content (provenance)';
COMMENT ON COLUMN observations.interpretation_run_id IS 'Link to interpretation run that created this observation (provenance)';

-- Entity snapshots table
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

-- Raw fragments table
CREATE TABLE IF NOT EXISTS raw_fragments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES records(id),
  source_id UUID REFERENCES sources(id),  -- Link to raw source content
  interpretation_run_id UUID REFERENCES interpretation_runs(id),  -- Link to interpretation run
  user_id UUID,  -- User who owns this fragment
  fragment_type TEXT NOT NULL,
  fragment_key TEXT NOT NULL,
  fragment_value JSONB NOT NULL,
  fragment_envelope JSONB NOT NULL,
  frequency_count INTEGER DEFAULT 1,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN raw_fragments.source_id IS 'Link to raw source content (provenance)';
COMMENT ON COLUMN raw_fragments.interpretation_run_id IS 'Link to interpretation run that created this fragment (provenance)';
COMMENT ON COLUMN raw_fragments.user_id IS 'User who owns this fragment (for RLS)';

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
CREATE INDEX IF NOT EXISTS idx_observations_payload ON observations(source_payload_id);
CREATE INDEX IF NOT EXISTS idx_observations_source ON observations(source_id);
CREATE INDEX IF NOT EXISTS idx_observations_interpretation_run ON observations(interpretation_run_id);
CREATE INDEX IF NOT EXISTS idx_observations_user ON observations(user_id);

-- Indexes for entity_snapshots
CREATE INDEX IF NOT EXISTS idx_snapshots_type ON entity_snapshots(entity_type);
CREATE INDEX IF NOT EXISTS idx_snapshots_user ON entity_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_snapshot ON entity_snapshots USING GIN(snapshot);

-- Indexes for raw_fragments
CREATE INDEX IF NOT EXISTS idx_fragments_record ON raw_fragments(record_id);
CREATE INDEX IF NOT EXISTS idx_fragments_source ON raw_fragments(source_id);
CREATE INDEX IF NOT EXISTS idx_fragments_interpretation_run ON raw_fragments(interpretation_run_id);
CREATE INDEX IF NOT EXISTS idx_fragments_user ON raw_fragments(user_id);
CREATE INDEX IF NOT EXISTS idx_fragments_frequency ON raw_fragments(fragment_key, frequency_count DESC);

-- Index for schema_registry
CREATE INDEX IF NOT EXISTS idx_schema_active ON schema_registry(entity_type, active) WHERE active = true;

-- RLS policies
ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_fragments ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_registry ENABLE ROW LEVEL SECURITY;

-- Service role full access
DROP POLICY IF EXISTS "Service role full access - observations" ON observations;
CREATE POLICY "Service role full access - observations"
  ON observations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access - entity_snapshots" ON entity_snapshots;
CREATE POLICY "Service role full access - entity_snapshots"
  ON entity_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access - raw_fragments" ON raw_fragments;
CREATE POLICY "Service role full access - raw_fragments"
  ON raw_fragments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access - schema_registry" ON schema_registry;
CREATE POLICY "Service role full access - schema_registry" ON schema_registry
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can only read their own observations
DROP POLICY IF EXISTS "Users read own observations" ON observations;
CREATE POLICY "Users read own observations"
  ON observations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Authenticated users can only read their own entity snapshots
DROP POLICY IF EXISTS "Users read own entity snapshots" ON entity_snapshots;
CREATE POLICY "Users read own entity snapshots"
  ON entity_snapshots
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Authenticated users can only read their own raw fragments
DROP POLICY IF EXISTS "Users read own raw fragments" ON raw_fragments;
CREATE POLICY "Users read own raw fragments"
  ON raw_fragments
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Public read access for schema_registry
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

-- Entities table (FU-101)
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  aliases JSONB DEFAULT '[]',
  user_id UUID,
  merged_to_entity_id TEXT,
  merged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_entities_merged_to FOREIGN KEY (merged_to_entity_id) REFERENCES entities(id)
);

COMMENT ON COLUMN entities.user_id IS 'User who owns this entity (for RLS)';
COMMENT ON COLUMN entities.merged_to_entity_id IS 'If not NULL, this entity was merged into another entity';
COMMENT ON COLUMN entities.merged_at IS 'Timestamp when entity was merged';

-- Indexes for entities
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_canonical_name ON entities(canonical_name);
CREATE INDEX IF NOT EXISTS idx_entities_type_name ON entities(entity_type, canonical_name);
CREATE INDEX IF NOT EXISTS idx_entities_user ON entities(user_id);
CREATE INDEX IF NOT EXISTS idx_entities_merged_to ON entities(merged_to_entity_id) 
  WHERE merged_to_entity_id IS NOT NULL;

-- RLS policies for entities
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - entities" ON entities;
CREATE POLICY "Service role full access - entities"
  ON entities
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can only read their own non-merged entities
DROP POLICY IF EXISTS "Users read own entities" ON entities;
CREATE POLICY "Users read own entities"
  ON entities
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Entity merges table (audit log for merge operations)
CREATE TABLE IF NOT EXISTS entity_merges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  from_entity_id TEXT NOT NULL,
  to_entity_id TEXT NOT NULL,
  observations_moved INTEGER NOT NULL DEFAULT 0,
  merged_at TIMESTAMPTZ DEFAULT NOW(),
  merged_by TEXT,
  merge_reason TEXT,
  
  -- Ensure same merge doesn't happen twice
  UNIQUE(user_id, from_entity_id, to_entity_id),
  
  CONSTRAINT fk_entity_merges_from FOREIGN KEY (from_entity_id) REFERENCES entities(id),
  CONSTRAINT fk_entity_merges_to FOREIGN KEY (to_entity_id) REFERENCES entities(id)
);

-- Indexes for entity_merges
CREATE INDEX IF NOT EXISTS idx_entity_merges_user ON entity_merges(user_id);
CREATE INDEX IF NOT EXISTS idx_entity_merges_from ON entity_merges(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_merges_to ON entity_merges(to_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_merges_merged_at ON entity_merges(merged_at DESC);

-- Enable RLS
ALTER TABLE entity_merges ENABLE ROW LEVEL SECURITY;

-- Service role has full access
DROP POLICY IF EXISTS "Service role full access - entity_merges" ON entity_merges;
CREATE POLICY "Service role full access - entity_merges"
  ON entity_merges
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can only read their own merge history
DROP POLICY IF EXISTS "Users read own entity merges" ON entity_merges;
CREATE POLICY "Users read own entity merges"
  ON entity_merges
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE entity_merges IS 'Audit log for entity merge operations';
COMMENT ON COLUMN entity_merges.from_entity_id IS 'Source entity (marked as merged)';
COMMENT ON COLUMN entity_merges.to_entity_id IS 'Target entity (receives observations)';
COMMENT ON COLUMN entity_merges.observations_moved IS 'Count of observations rewritten';
COMMENT ON COLUMN entity_merges.merged_by IS 'User or agent that performed merge';
COMMENT ON COLUMN entity_merges.merge_reason IS 'Optional reason for merge';

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

-- RLS policies for timeline_events
ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - timeline_events" ON timeline_events;
CREATE POLICY "Service role full access - timeline_events" ON timeline_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public read - timeline_events" ON timeline_events;
CREATE POLICY "public read - timeline_events" ON timeline_events FOR SELECT USING (true);

-- Graph edge tables (FU-103)
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

-- RLS policies for record_entity_edges
ALTER TABLE record_entity_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - record_entity_edges" ON record_entity_edges;
CREATE POLICY "Service role full access - record_entity_edges" ON record_entity_edges
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public read - record_entity_edges" ON record_entity_edges;
CREATE POLICY "public read - record_entity_edges" ON record_entity_edges FOR SELECT USING (true);

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

-- RLS policies for record_event_edges
ALTER TABLE record_event_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - record_event_edges" ON record_event_edges;
CREATE POLICY "Service role full access - record_event_edges" ON record_event_edges
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public read - record_event_edges" ON record_event_edges;
CREATE POLICY "public read - record_event_edges" ON record_event_edges FOR SELECT USING (true);

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

-- RLS policies for entity_event_edges
ALTER TABLE entity_event_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - entity_event_edges" ON entity_event_edges;
CREATE POLICY "Service role full access - entity_event_edges" ON entity_event_edges
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public read - entity_event_edges" ON entity_event_edges;
CREATE POLICY "public read - entity_event_edges" ON entity_event_edges FOR SELECT USING (true);
