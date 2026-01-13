-- Migration: Add idempotence to raw_fragments table
-- Purpose: Prevent duplicate raw_fragments from the same source
--          Use frequency_count and last_seen to track recurrence
-- Date: 2026-01-12

-- Step 1: Deduplicate existing raw_fragments before adding unique constraint
-- For each (source_id, fragment_key, user_id) group, keep the oldest row and merge others
DO $$
DECLARE
  duplicate_record RECORD;
  kept_id UUID;
  merged_count INTEGER;
BEGIN
  -- Find all duplicate groups
  FOR duplicate_record IN
    SELECT source_id, fragment_key, user_id, COUNT(*) as dup_count
    FROM raw_fragments
    WHERE source_id IS NOT NULL
    GROUP BY source_id, fragment_key, user_id
    HAVING COUNT(*) > 1
  LOOP
    -- Get the ID of the row to keep (oldest first_seen)
    SELECT id INTO kept_id
    FROM raw_fragments
    WHERE source_id = duplicate_record.source_id
      AND fragment_key = duplicate_record.fragment_key
      AND user_id = duplicate_record.user_id
    ORDER BY first_seen ASC
    LIMIT 1;
    
    -- Update frequency_count to reflect total duplicates
    UPDATE raw_fragments
    SET 
      frequency_count = duplicate_record.dup_count,
      last_seen = (
        SELECT MAX(last_seen)
        FROM raw_fragments
        WHERE source_id = duplicate_record.source_id
          AND fragment_key = duplicate_record.fragment_key
          AND user_id = duplicate_record.user_id
      )
    WHERE id = kept_id;
    
    -- Delete duplicate rows (keep only the one we updated)
    DELETE FROM raw_fragments
    WHERE source_id = duplicate_record.source_id
      AND fragment_key = duplicate_record.fragment_key
      AND user_id = duplicate_record.user_id
      AND id != kept_id;
    
    merged_count := merged_count + (duplicate_record.dup_count - 1);
  END LOOP;
  
  RAISE NOTICE 'Deduplicated % duplicate raw_fragments rows', merged_count;
END $$;

-- Step 2: Add unique constraint to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_fragments_idempotence
ON raw_fragments(source_id, fragment_key, user_id)
WHERE source_id IS NOT NULL;

-- Comment explaining the constraint
COMMENT ON INDEX idx_raw_fragments_idempotence IS 
'Prevents duplicate raw_fragments from the same source. When the same source produces the same fragment_key, upsert updates frequency_count and last_seen instead of creating a new row.';
