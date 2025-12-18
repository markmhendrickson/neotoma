-- Add payload_submissions table
CREATE TABLE IF NOT EXISTS payload_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payload_submission_id TEXT UNIQUE NOT NULL,
  payload_content_id TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  body JSONB NOT NULL,
  provenance JSONB NOT NULL,
  client_request_id TEXT,
  embedding vector(1536),
  summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payload_content_id ON payload_submissions(payload_content_id);
CREATE INDEX IF NOT EXISTS idx_payload_capability ON payload_submissions(capability_id);
CREATE INDEX IF NOT EXISTS idx_payload_created_at ON payload_submissions(created_at DESC);

ALTER TABLE payload_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - payload_submissions" ON payload_submissions;
CREATE POLICY "Service role full access - payload_submissions" ON payload_submissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public read - payload_submissions" ON payload_submissions;
CREATE POLICY "public read - payload_submissions" ON payload_submissions FOR SELECT USING (true);

-- Update observations table to reference payloads
-- First, handle existing data: delete orphaned observations or set to NULL
-- Check if column exists and handle migration
DO $$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'observations_source_record_id_fkey'
  ) THEN
    ALTER TABLE observations DROP CONSTRAINT observations_source_record_id_fkey;
  END IF;
  
  -- Rename column if it exists and hasn't been renamed yet
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'observations' AND column_name = 'source_record_id'
  ) THEN
    -- Since records and payload_submissions are separate entities with no direct mapping,
    -- we need to delete observations that reference records (they'll need to be recreated from payloads)
    -- OR set them to NULL if the column allows it
    -- For now, delete orphaned observations as there's no way to map records to payloads
    DELETE FROM observations 
    WHERE source_record_id IS NOT NULL;
    
    ALTER TABLE observations RENAME COLUMN source_record_id TO source_payload_id;
    
    -- Ensure column is UUID type (it should already be UUID from records reference)
    -- But check and convert if needed
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'observations' 
        AND column_name = 'source_payload_id' 
        AND udt_name != 'uuid'
    ) THEN
      -- Convert to UUID type if it's not already
      ALTER TABLE observations 
        ALTER COLUMN source_payload_id TYPE UUID USING source_payload_id::UUID;
    END IF;
  END IF;
  
  -- Add foreign key constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'observations_source_payload_id_fkey'
  ) THEN
    ALTER TABLE observations ADD CONSTRAINT observations_source_payload_id_fkey 
      FOREIGN KEY (source_payload_id) REFERENCES payload_submissions(id);
  END IF;
END $$;

-- Update index
DROP INDEX IF EXISTS idx_observations_record;
CREATE INDEX IF NOT EXISTS idx_observations_payload ON observations(source_payload_id);
