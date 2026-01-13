-- Migration: Add observation idempotence support
-- Adds canonical_hash column and unique constraint for deduplication
-- Per idempotence pattern: hash-based identity ensures no duplicate observations

-- Add canonical_hash column to observations table
ALTER TABLE observations
ADD COLUMN IF NOT EXISTS canonical_hash TEXT;

-- Create index on canonical_hash for fast lookups
CREATE INDEX IF NOT EXISTS idx_observations_canonical_hash 
ON observations(canonical_hash)
WHERE canonical_hash IS NOT NULL;

-- Create unique constraint for idempotence
-- Prevents duplicate observations for same source + interpretation + entity + canonical fields
CREATE UNIQUE INDEX IF NOT EXISTS idx_observations_idempotence 
ON observations(user_id, source_id, interpretation_id, entity_id, canonical_hash)
WHERE canonical_hash IS NOT NULL 
  AND source_id IS NOT NULL 
  AND interpretation_id IS NOT NULL;

-- Comment on column
COMMENT ON COLUMN observations.canonical_hash IS 
'SHA-256 hash of canonicalized fields. Used for idempotence - prevents duplicate observations from same source + config.';

-- Note: Existing observations will have null canonical_hash
-- New observations will have hash computed from canonicalized fields
-- This is non-breaking: existing observations continue to work
-- Deduplication only applies to new observations with non-null canonical_hash
