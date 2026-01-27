-- Create auto_enhancement_queue table for deferred auto-enhancement processing
-- Migration: 20260127000006_add_auto_enhancement_queue.sql

-- Temporarily disable event trigger to avoid double schema prefix issue
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'trigger_auto_enable_rls_on_table') THEN
    ALTER EVENT TRIGGER trigger_auto_enable_rls_on_table DISABLE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS auto_enhancement_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  fragment_key TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  priority INTEGER DEFAULT 100, -- Lower = higher priority
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  last_retry_at TIMESTAMPTZ,
  
  -- Metadata for tracking
  frequency_count INTEGER, -- Frequency when queued
  confidence_score NUMERIC(3,2), -- Confidence score if calculated
  
  -- Note: Unique constraint handled via index below (COALESCE not allowed in UNIQUE constraint)
  
  CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create indexes for efficient queue processing
CREATE INDEX IF NOT EXISTS idx_enhancement_queue_status_priority 
ON auto_enhancement_queue(status, priority, created_at) 
WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_enhancement_queue_entity_type 
ON auto_enhancement_queue(entity_type, status);

CREATE INDEX IF NOT EXISTS idx_enhancement_queue_user 
ON auto_enhancement_queue(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_enhancement_queue_processed 
ON auto_enhancement_queue(processed_at DESC) WHERE processed_at IS NOT NULL;

-- Create unique index for queue entries (using COALESCE for NULL user_id)
CREATE UNIQUE INDEX IF NOT EXISTS unique_queue_entry 
ON auto_enhancement_queue(
  entity_type, 
  fragment_key, 
  COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- Add comments
COMMENT ON TABLE auto_enhancement_queue IS 'Queue for deferred auto-enhancement processing to avoid blocking storage operations';
COMMENT ON COLUMN auto_enhancement_queue.status IS 'Status: pending (not processed), processing (in progress), completed (done), failed (error), skipped (blacklisted or ineligible)';
COMMENT ON COLUMN auto_enhancement_queue.priority IS 'Priority for processing. Lower values = higher priority';
COMMENT ON COLUMN auto_enhancement_queue.retry_count IS 'Number of times processing was retried after failure';

-- Re-enable event trigger (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'trigger_auto_enable_rls_on_table') THEN
    ALTER EVENT TRIGGER trigger_auto_enable_rls_on_table ENABLE;
  END IF;
END $$;

-- Ensure RLS is enabled (in case event trigger was disabled)
ALTER TABLE auto_enhancement_queue ENABLE ROW LEVEL SECURITY;
