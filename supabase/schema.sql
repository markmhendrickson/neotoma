-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create records table
CREATE TABLE IF NOT EXISTS records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}',
  file_urls JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add embedding column if it doesn't exist (for existing tables)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'records' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE records ADD COLUMN embedding vector(1536);
  END IF;
END $$;

-- Create GIN index on type for fast filtering
CREATE INDEX IF NOT EXISTS idx_records_type ON records(type);

-- Create GIN index on properties for fast JSONB queries
CREATE INDEX IF NOT EXISTS idx_records_properties ON records USING GIN(properties);

-- Create vector index for semantic similarity search
CREATE INDEX IF NOT EXISTS idx_records_embedding ON records USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_records_updated_at ON records;
CREATE TRIGGER update_records_updated_at
  BEFORE UPDATE ON records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security: Allow service role full access
ALTER TABLE records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can do everything" ON records;
CREATE POLICY "Service role can do everything" ON records
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);




