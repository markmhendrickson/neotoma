-- Migration: Make raw_fragments.record_id nullable
-- Purpose: In sources-first architecture, we don't use records anymore
--          record_id should be nullable for structured data storage
-- Date: 2026-01-12

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'raw_fragments' AND column_name = 'record_id'
  ) THEN
    ALTER TABLE raw_fragments 
      ALTER COLUMN record_id DROP NOT NULL;
    COMMENT ON COLUMN raw_fragments.record_id IS
      'Source record (legacy, nullable - not used in sources-first architecture)';
  END IF;
END $$;
