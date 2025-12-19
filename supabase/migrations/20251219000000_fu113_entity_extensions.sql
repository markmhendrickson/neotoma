-- FU-113: Entity Extensions Migration
-- Adds user_id, merged_to tracking, and RLS to entities table

-- Add user_id column to entities table for user isolation
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'entities' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE entities ADD COLUMN user_id UUID;
  END IF;
END $$;

-- Add merged_to_entity_id column for entity merge tracking
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'entities' AND column_name = 'merged_to_entity_id'
  ) THEN
    ALTER TABLE entities ADD COLUMN merged_to_entity_id TEXT;
  END IF;
END $$;

-- Add merged_at timestamp column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'entities' AND column_name = 'merged_at'
  ) THEN
    ALTER TABLE entities ADD COLUMN merged_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add foreign key constraint for merged_to_entity_id (self-referencing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'entities_merged_to_entity_id_fkey'
    AND table_name = 'entities'
  ) THEN
    ALTER TABLE entities 
    ADD CONSTRAINT entities_merged_to_entity_id_fkey 
    FOREIGN KEY (merged_to_entity_id) REFERENCES entities(id);
  END IF;
END $$;

-- Create index on user_id for efficient user-scoped queries
CREATE INDEX IF NOT EXISTS idx_entities_user_id ON entities(user_id);

-- Create index on merged_to_entity_id for merge tracking queries
CREATE INDEX IF NOT EXISTS idx_entities_merged_to ON entities(merged_to_entity_id) WHERE merged_to_entity_id IS NOT NULL;

-- Create composite index for user + type queries
CREATE INDEX IF NOT EXISTS idx_entities_user_type ON entities(user_id, entity_type);

-- Create composite index for excluding merged entities in user queries
CREATE INDEX IF NOT EXISTS idx_entities_user_not_merged ON entities(user_id) WHERE merged_to_entity_id IS NULL;

-- Update RLS policies for user isolation
-- Drop existing policies first to avoid conflicts
DROP POLICY IF EXISTS "Service role full access - entities" ON entities;
DROP POLICY IF EXISTS "public read - entities" ON entities;
DROP POLICY IF EXISTS "Users can read own entities" ON entities;
DROP POLICY IF EXISTS "Users can insert own entities" ON entities;
DROP POLICY IF EXISTS "Users can update own entities" ON entities;
DROP POLICY IF EXISTS "Users can delete own entities" ON entities;

-- Service role full access (for backend operations)
CREATE POLICY "Service role full access - entities" ON entities
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can only read their own entities (or entities without user_id for backward compatibility)
CREATE POLICY "Users can read own entities" ON entities
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);

-- Users can only insert entities with their own user_id
CREATE POLICY "Users can insert own entities" ON entities
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can only update their own entities
CREATE POLICY "Users can update own entities" ON entities
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can only delete their own entities
CREATE POLICY "Users can delete own entities" ON entities
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Public read access for anonymous users (limited to non-user-specific entities)
CREATE POLICY "public read - entities" ON entities
  FOR SELECT
  TO anon
  USING (user_id IS NULL);

-- Comment on columns for documentation
COMMENT ON COLUMN entities.user_id IS 'Owner user ID for RLS isolation';
COMMENT ON COLUMN entities.merged_to_entity_id IS 'ID of entity this was merged into (NULL if not merged)';
COMMENT ON COLUMN entities.merged_at IS 'Timestamp when entity was merged';
