-- FU-112: Storage Infrastructure
-- Creates upload_queue and storage_usage tables for upload management and quota tracking

-- Upload queue table for tracking file uploads and retry states
CREATE TABLE IF NOT EXISTS upload_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes >= 0),
  mime_type TEXT,
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
  error_message TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for upload_queue
CREATE INDEX IF NOT EXISTS idx_upload_queue_user_status ON upload_queue(user_id, status);
CREATE INDEX IF NOT EXISTS idx_upload_queue_status_queued ON upload_queue(status, queued_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_upload_queue_user_id ON upload_queue(user_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_upload_queue_updated_at ON upload_queue;
CREATE TRIGGER update_upload_queue_updated_at
  BEFORE UPDATE ON upload_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS for upload_queue
ALTER TABLE upload_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - upload_queue" ON upload_queue;
CREATE POLICY "Service role full access - upload_queue" ON upload_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own uploads - upload_queue" ON upload_queue;
CREATE POLICY "Users can view own uploads - upload_queue" ON upload_queue
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own uploads - upload_queue" ON upload_queue;
CREATE POLICY "Users can insert own uploads - upload_queue" ON upload_queue
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Storage usage table for per-user storage accounting
CREATE TABLE IF NOT EXISTS storage_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  total_bytes BIGINT NOT NULL DEFAULT 0 CHECK (total_bytes >= 0),
  file_count INTEGER NOT NULL DEFAULT 0 CHECK (file_count >= 0),
  quota_bytes BIGINT CHECK (quota_bytes IS NULL OR quota_bytes >= 0),
  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for storage_usage
CREATE INDEX IF NOT EXISTS idx_storage_usage_user_id ON storage_usage(user_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_storage_usage_updated_at ON storage_usage;
CREATE TRIGGER update_storage_usage_updated_at
  BEFORE UPDATE ON storage_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS for storage_usage
ALTER TABLE storage_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - storage_usage" ON storage_usage;
CREATE POLICY "Service role full access - storage_usage" ON storage_usage
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own usage - storage_usage" ON storage_usage;
CREATE POLICY "Users can view own usage - storage_usage" ON storage_usage
  FOR SELECT USING (auth.uid() = user_id);

-- Comment on tables
COMMENT ON TABLE upload_queue IS 'FU-112: Queue for tracking file uploads and retry states';
COMMENT ON TABLE storage_usage IS 'FU-112: Per-user storage usage tracking for quota enforcement';

-- Comment on columns
COMMENT ON COLUMN upload_queue.status IS 'Upload status: pending, in_progress, completed, failed, cancelled';
COMMENT ON COLUMN upload_queue.attempt_count IS 'Number of upload attempts made';
COMMENT ON COLUMN upload_queue.max_attempts IS 'Maximum retry attempts before permanent failure';
COMMENT ON COLUMN storage_usage.quota_bytes IS 'User storage quota in bytes, NULL for unlimited';
