-- Migration: Add Plaid integration tables
-- Created: 2025-12-31
-- Description: Creates plaid_items and plaid_sync_runs tables for Plaid financial data integration

-- Plaid Items table
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

-- Plaid Sync Runs table
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

