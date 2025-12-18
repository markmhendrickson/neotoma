-- Create extensions schema for better security organization
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO public;

-- Install vector extension in extensions schema (not public)
CREATE EXTENSION IF NOT EXISTS vector SCHEMA extensions;
-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create records table
CREATE TABLE IF NOT EXISTS records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}',
  file_urls JSONB DEFAULT '[]',
  external_source TEXT,
  external_id TEXT,
  external_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add embedding column if it doesn't exist (for existing tables)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'records' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE records ADD COLUMN embedding vector(1536);
  END IF;
END $$;

-- Add summary column if it doesn't exist (for existing tables)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'records' AND column_name = 'summary'
  ) THEN
    ALTER TABLE records ADD COLUMN summary TEXT;
  END IF;
END $$;

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
  source_payload_id UUID NOT NULL REFERENCES payload_submissions(id),
  observed_at TIMESTAMPTZ NOT NULL,
  specificity_score NUMERIC(3,2) CHECK (specificity_score BETWEEN 0 AND 1),
  source_priority INTEGER DEFAULT 0,
  fields JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL
);

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
CREATE INDEX IF NOT EXISTS idx_observations_payload ON observations(source_payload_id);
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

-- RLS policies
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

-- Public read access
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

-- Entities table (FU-101)
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  aliases JSONB DEFAULT '[]',
  metadata JSONB NOT NULL DEFAULT '{}',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL,
  merged_to_entity_id TEXT REFERENCES entities(id),
  merged_at TIMESTAMPTZ
);

-- Indexes for entities
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_canonical_name ON entities(canonical_name);
CREATE INDEX IF NOT EXISTS idx_entities_type_name ON entities(entity_type, canonical_name);
CREATE INDEX IF NOT EXISTS idx_entities_user ON entities(user_id);
CREATE INDEX IF NOT EXISTS idx_entities_user_type ON entities(user_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_user_type_name
  ON entities(user_id, entity_type, canonical_name);
CREATE INDEX IF NOT EXISTS idx_entities_merged
  ON entities(user_id, merged_to_entity_id)
  WHERE merged_to_entity_id IS NOT NULL;

-- RLS policies for entities
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own entities" ON entities;
CREATE POLICY "Users read own entities" ON entities
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access - entities" ON entities;
CREATE POLICY "Service role full access - entities" ON entities
  FOR ALL TO service_role USING (true) WITH CHECK (true);

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




