-- Migration: FU-110 - Sources Table Migration
-- Created: 2025-12-31
-- Description: Content-addressed raw storage with RLS for sources-first ingestion

-- Sources table for raw content storage
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

