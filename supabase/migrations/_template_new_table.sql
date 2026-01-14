-- Migration: [DESCRIPTION]
-- Created: [YYYY-MM-DD]
-- Description: [Brief description of what this migration does]

-- ============================================================================
-- Table Creation
-- ============================================================================

CREATE TABLE IF NOT EXISTS [table_name] (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Add your columns here
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add table comment
COMMENT ON TABLE [table_name] IS '[Description of table purpose]';

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_[table_name]_user 
ON [table_name](user_id) WHERE user_id IS NOT NULL;

-- Add other indexes as needed

-- ============================================================================
-- Row Level Security (RLS) - REQUIRED FOR ALL TABLES
-- ============================================================================

ALTER TABLE [table_name] ENABLE ROW LEVEL SECURITY;

-- Users can read their own records (if user-scoped)
CREATE POLICY "Users read own [table_name]" ON [table_name]
  FOR SELECT USING (user_id = auth.uid());

-- Service role has full access for mutations
CREATE POLICY "Service role full access to [table_name]" ON [table_name]
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Add additional policies as needed:
-- - For global tables: Allow authenticated users to read global entries
-- - For write access: Add appropriate policies based on your security model
