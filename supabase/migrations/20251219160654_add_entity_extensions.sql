-- Migration: Entity Extensions (FU-113)
-- Created: 2025-12-19
-- Description: Adds user_id, merged_to tracking, and RLS policies for user isolation
-- This enables multi-user entity isolation and entity merge tracking for v0.2.0

-- Step 1: Add user_id column to entities table
-- Default to a null-ish UUID for existing rows (will be updated by application)
ALTER TABLE entities
ADD COLUMN IF NOT EXISTS user_id UUID;

-- Step 2: Add merge tracking columns
ALTER TABLE entities
ADD COLUMN IF NOT EXISTS merged_to_entity_id TEXT REFERENCES entities(id);

ALTER TABLE entities
ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;

-- Step 3: Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_entities_user_id ON entities(user_id);
CREATE INDEX IF NOT EXISTS idx_entities_merged_to ON entities(merged_to_entity_id) WHERE merged_to_entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entities_not_merged ON entities(user_id) WHERE merged_to_entity_id IS NULL;

-- Step 4: Update RLS policies for user isolation
-- Drop existing policies
DROP POLICY IF EXISTS "public read - entities" ON entities;
DROP POLICY IF EXISTS "Service role full access - entities" ON entities;

-- Service role full access (for MCP server operations)
CREATE POLICY "Service role full access - entities" ON entities
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can only read their own entities (when authenticated)
CREATE POLICY "Users can read own entities" ON entities
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can only insert their own entities
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

-- Anon/public read access (for backward compatibility in single-user mode)
-- This will be removed in later releases when auth is fully enforced
CREATE POLICY "Public read fallback - entities" ON entities
  FOR SELECT
  TO anon
  USING (true);

-- Step 5: Add trigger to prevent cross-user merge operations
CREATE OR REPLACE FUNCTION validate_entity_merge()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  target_user_id UUID;
BEGIN
  -- If merged_to_entity_id is being set, validate same user ownership
  IF NEW.merged_to_entity_id IS NOT NULL AND 
     (OLD.merged_to_entity_id IS NULL OR NEW.merged_to_entity_id != OLD.merged_to_entity_id) THEN
    -- Get the user_id of the target entity
    SELECT user_id INTO target_user_id
    FROM entities
    WHERE id = NEW.merged_to_entity_id;
    
    -- Ensure both entities belong to the same user
    IF target_user_id IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'Cannot merge entities across different users';
    END IF;
    
    -- Set merged_at timestamp if not already set
    IF NEW.merged_at IS NULL THEN
      NEW.merged_at = NOW();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_entity_merge_trigger ON entities;
CREATE TRIGGER validate_entity_merge_trigger
  BEFORE UPDATE ON entities
  FOR EACH ROW
  EXECUTE FUNCTION validate_entity_merge();

-- Step 6: Add comment to document the extension
COMMENT ON COLUMN entities.user_id IS 'User who owns this entity. Required for RLS isolation.';
COMMENT ON COLUMN entities.merged_to_entity_id IS 'If this entity was merged into another, references the target entity.';
COMMENT ON COLUMN entities.merged_at IS 'Timestamp when this entity was merged into another.';

-- Step 7: Create helper view for non-merged entities (commonly used query pattern)
CREATE OR REPLACE VIEW active_entities AS
SELECT *
FROM entities
WHERE merged_to_entity_id IS NULL;

COMMENT ON VIEW active_entities IS 'View of entities that have not been merged. Use for most queries.';

