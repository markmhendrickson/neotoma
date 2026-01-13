-- Migration: Make raw_fragments.record_id nullable
-- Purpose: In sources-first architecture, we don't use records anymore
--          record_id should be nullable for structured data storage
-- Date: 2026-01-12

-- Make record_id nullable
ALTER TABLE raw_fragments 
  ALTER COLUMN record_id DROP NOT NULL;

-- Update comment to reflect it's nullable
COMMENT ON COLUMN raw_fragments.record_id IS 'Source record (legacy, nullable - not used in sources-first architecture)';
