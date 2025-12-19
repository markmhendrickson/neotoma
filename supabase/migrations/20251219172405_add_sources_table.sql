-- FU-110: Sources Table Migration
-- Content-addressed raw storage with RLS
-- Part of v0.2.0: Minimal Ingestion + Correction Loop

-- Create sources table for content-addressed raw storage
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

-- Create indexes for sources table
CREATE INDEX IF NOT EXISTS idx_sources_hash ON sources(content_hash);
CREATE INDEX IF NOT EXISTS idx_sources_user ON sources(user_id);
CREATE INDEX IF NOT EXISTS idx_sources_created ON sources(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(storage_status);

-- Enable RLS on sources table
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;

-- RLS policies for sources table
DROP POLICY IF EXISTS "Users read own sources" ON sources;
CREATE POLICY "Users read own sources" ON sources
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access - sources" ON sources;
CREATE POLICY "Service role full access - sources" ON sources
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Add comment for documentation
COMMENT ON TABLE sources IS 'Content-addressed raw storage for sources-first ingestion (FU-110, v0.2.0)';
COMMENT ON COLUMN sources.content_hash IS 'SHA-256 hash of content for deduplication';
COMMENT ON COLUMN sources.storage_url IS 'URL in object storage (sources/{user_id}/{content_hash})';
COMMENT ON COLUMN sources.storage_status IS 'Upload status: uploaded, pending, failed';
COMMENT ON COLUMN sources.source_type IS 'Type: file_upload, agent_submission, etc.';
