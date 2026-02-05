-- Migration: Add created_at to raw_fragments
-- Purpose: Align raw_fragments schema with storage adapter expectation and capture insertion timestamp
-- Date: 2026-02-03

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'raw_fragments'
      AND column_name = 'created_at'
  ) THEN
    ALTER TABLE raw_fragments
      ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();

    UPDATE raw_fragments
    SET created_at = COALESCE(first_seen, last_seen, NOW())
    WHERE created_at IS NULL;

    ALTER TABLE raw_fragments
      ALTER COLUMN created_at SET NOT NULL;

    COMMENT ON COLUMN raw_fragments.created_at IS
      'Timestamp when the raw fragment was first stored. Used for provenance and local sqlite compatibility.';
  END IF;
END $$;
