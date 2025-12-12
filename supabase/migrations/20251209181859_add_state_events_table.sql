-- Migration: Add state_events table for event-sourcing foundation (FU-050)
-- Created: 2025-12-09
-- Description: Creates append-only event log table with canonical schema including crypto/hash fields

-- Create state_events table (append-only event log)
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

-- Add comment to table
COMMENT ON TABLE state_events IS 'Append-only event log for event-sourcing architecture. Events are immutable and serve as the single source of truth for state changes.';







