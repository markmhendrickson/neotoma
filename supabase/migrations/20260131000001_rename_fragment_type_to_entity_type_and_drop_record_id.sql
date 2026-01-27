-- Migration: Rename fragment_type to entity_type and drop record_id column
-- Purpose: Clarify that fragment_type stores entity types, not fragment type names
--          Remove legacy record_id column (no backward compatibility needed)
-- Date: 2026-01-31

-- Step 1: Rename fragment_type column to entity_type (only if column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'raw_fragments' AND column_name = 'fragment_type'
  ) THEN
    ALTER TABLE raw_fragments RENAME COLUMN fragment_type TO entity_type;
  END IF;
  
  -- Update column comment (only if entity_type column exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'raw_fragments' AND column_name = 'entity_type'
  ) THEN
    COMMENT ON COLUMN raw_fragments.entity_type IS 'Entity type (e.g., "invoice", "transaction", "task") - stores the entity type, not fragment type names';
  END IF;
END $$;

-- Step 2: Drop record_id column (no backward compatibility needed)
-- First, drop any indexes that reference record_id
DROP INDEX IF EXISTS idx_fragments_record;
DROP INDEX IF EXISTS idx_raw_fragments_record;

-- Drop the column
ALTER TABLE raw_fragments 
  DROP COLUMN IF EXISTS record_id;

-- Step 3: Update any queries that might reference the old column name
-- (This is handled in application code, but documenting here for reference)
