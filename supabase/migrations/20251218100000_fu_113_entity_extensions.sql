-- Migration: FU-113 Entity Extensions
-- Adds user isolation + merge tracking columns to entities table

BEGIN;

ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS merged_to_entity_id TEXT REFERENCES entities(id),
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;

UPDATE entities
SET
  user_id = COALESCE(user_id, '00000000-0000-0000-0000-000000000000'),
  first_seen_at = COALESCE(first_seen_at, created_at, NOW()),
  last_seen_at = COALESCE(last_seen_at, updated_at, NOW())
WHERE user_id IS NULL
   OR first_seen_at IS NULL
   OR last_seen_at IS NULL;

ALTER TABLE entities
  ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_entities_user ON entities(user_id);
CREATE INDEX IF NOT EXISTS idx_entities_user_type ON entities(user_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_user_type_name
  ON entities(user_id, entity_type, canonical_name);
CREATE INDEX IF NOT EXISTS idx_entities_merged
  ON entities(user_id, merged_to_entity_id)
  WHERE merged_to_entity_id IS NOT NULL;

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read - entities" ON entities;
DROP POLICY IF EXISTS "Users read own entities" ON entities;
CREATE POLICY "Users read own entities" ON entities
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Service role full access - entities" ON entities;
CREATE POLICY "Service role full access - entities" ON entities
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
