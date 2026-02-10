-- Migration: Add user_id to interpretations if missing
-- Created: 2026-02-10
-- Description: Ensures interpretations has user_id (required by app and RLS). Backfill from sources.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'interpretations') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'interpretations' AND column_name = 'user_id'
  ) THEN
    -- Add column nullable first
    ALTER TABLE interpretations ADD COLUMN user_id UUID REFERENCES auth.users(id);

    -- Backfill from sources (interpretations.source_id -> sources.id, sources.user_id)
    UPDATE interpretations i
    SET user_id = s.user_id
    FROM sources s
    WHERE i.source_id = s.id AND i.user_id IS NULL;

    -- Set NOT NULL; any remaining NULLs get a sentinel (should not happen if all rows have valid source_id)
    UPDATE interpretations SET user_id = '00000000-0000-0000-0000-000000000000'::uuid WHERE user_id IS NULL;
    ALTER TABLE interpretations ALTER COLUMN user_id SET NOT NULL;

    -- Index for RLS and queries
    CREATE INDEX IF NOT EXISTS idx_interpretations_user ON interpretations(user_id);

    -- Ensure RLS policy exists (may have been skipped when column was missing)
    ALTER TABLE interpretations ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users read own interpretations" ON interpretations;
    CREATE POLICY "Users read own interpretations" ON interpretations
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;
