-- Consolidated migration to apply all missing tables
-- Run this in Supabase Dashboard → SQL Editor if tables are missing
-- This creates: state_events, entities, payload_submissions, schema_registry

-- Migration 1: state_events table
CREATE TABLE IF NOT EXISTS state_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  record_id TEXT,
  previous_event_hash TEXT,
  event_hash TEXT,
  signer_public_key TEXT,
  signature TEXT,
  reducer_version TEXT DEFAULT '1.0',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_state_events_record_id ON state_events(record_id);
CREATE INDEX IF NOT EXISTS idx_state_events_timestamp ON state_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_state_events_type ON state_events(event_type);
CREATE INDEX IF NOT EXISTS idx_state_events_previous_hash ON state_events(previous_event_hash) WHERE previous_event_hash IS NOT NULL;

COMMENT ON TABLE state_events IS 'Append-only event log for event-sourcing architecture. Events are immutable and serve as the single source of truth for state changes.';

-- Migration 2: entities table
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  aliases JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_canonical_name ON entities(canonical_name);
CREATE INDEX IF NOT EXISTS idx_entities_type_name ON entities(entity_type, canonical_name);

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access - entities" ON entities;
CREATE POLICY "Service role full access - entities" ON entities
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "public read - entities" ON entities;
CREATE POLICY "public read - entities" ON entities FOR SELECT USING (true);

COMMENT ON TABLE entities IS 'Stores resolved entities with canonical names. Entity IDs are deterministic hash-based (ent_{sha256(type:normalized_name)}).';

-- Migration 3: payload_submissions table
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

-- Migration 4: schema_registry table
CREATE TABLE IF NOT EXISTS schema_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  schema_definition JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_schema_registry_type_version ON schema_registry(entity_type, schema_version);
CREATE INDEX IF NOT EXISTS idx_schema_registry_active ON schema_registry(is_active) WHERE is_active = true;

ALTER TABLE schema_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access - schema_registry" ON schema_registry;
CREATE POLICY "Service role full access - schema_registry" ON schema_registry
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "public read - schema_registry" ON schema_registry;
CREATE POLICY "public read - schema_registry" ON schema_registry FOR SELECT USING (true);

