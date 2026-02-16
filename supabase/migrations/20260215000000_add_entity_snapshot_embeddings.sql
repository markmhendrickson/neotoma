-- Migration: Add embedding column to entity_snapshots for semantic search
-- Created: 2025-02-15
-- Description: Adds embedding vector(1536) to entity_snapshots for entity semantic search.
--              Embeddings are generated at upsert time from entity_type + canonical_name + snapshot.
--              Enables retrieve_entities and retrieve_entity_by_identifier to match by semantic similarity.

-- Add embedding column (nullable; existing rows and rows without OPENAI_API_KEY have NULL)
ALTER TABLE entity_snapshots
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create ivfflat index for cosine similarity search (only on non-null embeddings)
CREATE INDEX IF NOT EXISTS idx_entity_snapshots_embedding
  ON entity_snapshots
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL;

COMMENT ON COLUMN entity_snapshots.embedding IS 'Vector embedding of entity_type + canonical_name + snapshot for semantic similarity search. Generated at upsert time when OPENAI_API_KEY is configured.';

-- RPC function for entity semantic search (PostgREST does not support pgvector operators)
CREATE OR REPLACE FUNCTION search_entity_snapshots_by_embedding(
  query_embedding vector(1536),
  p_user_id uuid,
  p_entity_type text DEFAULT NULL,
  p_include_merged boolean DEFAULT false,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  entity_id text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    es.entity_id,
    (1 - (es.embedding <=> query_embedding))::float AS similarity
  FROM entity_snapshots es
  INNER JOIN entities e ON e.id = es.entity_id
  WHERE es.embedding IS NOT NULL
    AND es.user_id = p_user_id
    AND (p_entity_type IS NULL OR es.entity_type = p_entity_type)
    AND (p_include_merged OR e.merged_to_entity_id IS NULL)
  ORDER BY es.embedding <=> query_embedding
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION search_entity_snapshots_by_embedding IS 'Semantic search over entity_snapshots by embedding similarity. Used by retrieve_entities and retrieve_entity_by_identifier.';
