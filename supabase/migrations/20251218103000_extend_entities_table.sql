-- Migration: Extend entities with user isolation and merge tracking (FU-113)
-- Created: 2025-12-18

BEGIN;

-- 1. Add user_id column (default single-user UUID for backfill)
ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS user_id UUID
    DEFAULT '00000000-0000-0000-0000-000000000000';

-- Backfill existing rows that might be NULL
UPDATE entities
SET user_id = '00000000-0000-0000-0000-000000000000'
WHERE user_id IS NULL;

-- Enforce NOT NULL and drop default so callers must stamp user_id explicitly
ALTER TABLE entities
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN user_id DROP DEFAULT;

-- 2. Add merge-tracking columns
ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS merged_to_entity_id TEXT REFERENCES entities(id),
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;

-- 3. Indexes to support user-scoped queries and merge lookups
CREATE INDEX IF NOT EXISTS idx_entities_user
  ON entities(user_id);

CREATE INDEX IF NOT EXISTS idx_entities_user_type
  ON entities(user_id, entity_type);

CREATE INDEX IF NOT EXISTS idx_entities_user_type_name
  ON entities(user_id, entity_type, canonical_name);

CREATE INDEX IF NOT EXISTS idx_entities_merged
  ON entities(user_id, merged_to_entity_id)
  WHERE merged_to_entity_id IS NOT NULL;

-- 4. Tighten RLS: remove public read, enforce user isolation
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read - entities" ON entities;
DROP POLICY IF EXISTS "Users read own entities" ON entities;

CREATE POLICY "Users read own entities" ON entities
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access - entities" ON entities;
CREATE POLICY "Service role full access - entities" ON entities
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. Ensure entity_snapshots RLS mirrors entity ownership
ALTER TABLE entity_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read - entity_snapshots" ON entity_snapshots;
DROP POLICY IF EXISTS "Users read own entity_snapshots" ON entity_snapshots;

CREATE POLICY "Users read own entity_snapshots" ON entity_snapshots
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access - entity_snapshots" ON entity_snapshots;
CREATE POLICY "Service role full access - entity_snapshots" ON entity_snapshots
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
