-- Migration: Add external connector tables
-- Created: 2025-12-31
-- Description: Creates external_connectors and external_sync_runs tables for generic external data integrations

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

-- External sync runs table
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

