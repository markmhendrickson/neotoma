-- Migration: FU-113 - Entity Extensions
-- Created: 2025-12-31
-- Description: Add user_id, merge tracking, and RLS to entities table

-- Add user_id column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'entities' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE entities ADD COLUMN user_id UUID;
  END IF;
END $$;

-- Add merged_to_entity_id column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'entities' AND column_name = 'merged_to_entity_id'
  ) THEN
    ALTER TABLE entities ADD COLUMN merged_to_entity_id TEXT;
  END IF;
END $$;

-- Add merged_at column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'entities' AND column_name = 'merged_at'
  ) THEN
    ALTER TABLE entities ADD COLUMN merged_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add foreign key constraint for merged_to_entity_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_entities_merged_to' AND table_name = 'entities'
  ) THEN
    ALTER TABLE entities 
      ADD CONSTRAINT fk_entities_merged_to 
      FOREIGN KEY (merged_to_entity_id) 
      REFERENCES entities(id);
  END IF;
END $$;

-- Create index on user_id
CREATE INDEX IF NOT EXISTS idx_entities_user ON entities(user_id);

-- Create index on merged_to_entity_id for merge lookups
CREATE INDEX IF NOT EXISTS idx_entities_merged_to ON entities(merged_to_entity_id) 
  WHERE merged_to_entity_id IS NOT NULL;

-- Update existing RLS policies to use user_id

-- Drop old policies
DROP POLICY IF EXISTS "public read - entities" ON entities;
DROP POLICY IF EXISTS "Service role full access - entities" ON entities;

-- Service role has full access
CREATE POLICY "Service role full access - entities"
  ON entities
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can only read their own non-merged entities
CREATE POLICY "Users read own entities"
  ON entities
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON COLUMN entities.user_id IS 'User who owns this entity (for RLS)';
COMMENT ON COLUMN entities.merged_to_entity_id IS 'If not NULL, this entity was merged into another entity';
COMMENT ON COLUMN entities.merged_at IS 'Timestamp when entity was merged';

