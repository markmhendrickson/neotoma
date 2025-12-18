-- Migration: Extend entities table with user scope and merge tracking (FU-113)
-- Created: 2025-12-18

BEGIN;

-- Add user_id and merge-tracking columns
ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS merged_to_entity_id TEXT REFERENCES entities(id),
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;

-- Backfill existing entities with single-user UUID (v0.1.0 legacy)
UPDATE entities
  SET user_id = COALESCE(user_id, '00000000-0000-0000-0000-000000000000')
WHERE user_id IS NULL;

-- Enforce NOT NULL on user_id after backfill
ALTER TABLE entities
  ALTER COLUMN user_id SET NOT NULL;

-- Indexes to support user-scoped lookups
CREATE INDEX IF NOT EXISTS idx_entities_user ON entities(user_id);
CREATE INDEX IF NOT EXISTS idx_entities_user_type ON entities(user_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_user_type_name
  ON entities(user_id, entity_type, canonical_name);
CREATE INDEX IF NOT EXISTS idx_entities_merged
  ON entities(user_id, merged_to_entity_id)
  WHERE merged_to_entity_id IS NOT NULL;

-- RLS policies: remove public read, enforce user isolation + service-role access
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read - entities" ON entities;
DROP POLICY IF EXISTS "Users read own entities" ON entities;
DROP POLICY IF EXISTS "Service role full access - entities" ON entities;

CREATE POLICY "Users read own entities" ON entities
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role full access - entities" ON entities
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
