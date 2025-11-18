CREATE EXTENSION IF NOT EXISTS vector;
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
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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




