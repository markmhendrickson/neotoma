-- Migration: Make source_payload_id nullable for v0.2.0
-- Created: 2025-12-31
-- Description: source_payload_id should be nullable since v0.2.0 uses source_id instead

-- Make source_payload_id nullable
ALTER TABLE observations 
  ALTER COLUMN source_payload_id DROP NOT NULL;

COMMENT ON COLUMN observations.source_payload_id IS 'Legacy payload submission reference (nullable for v0.2.0+)';

