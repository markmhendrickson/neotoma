-- Create schema_recommendations table for tracking schema update recommendations
-- Migration: 20260127000004_add_schema_recommendations.sql

-- Table to store schema recommendations (from agents, inference, or analysis)
CREATE TABLE IF NOT EXISTS schema_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  source TEXT NOT NULL CHECK (source IN ('raw_fragments', 'agent', 'inference')),
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN ('add_fields', 'new_schema', 'modify_field')),
  fields_to_add JSONB NOT NULL, -- Array of field definitions
  confidence_score NUMERIC(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  reasoning TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'applied', 'auto_applied')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  applied_at TIMESTAMPTZ,
  applied_by UUID REFERENCES auth.users(id),
  can_rollback BOOLEAN DEFAULT true,
  idempotency_key TEXT UNIQUE,
  
  -- Metadata for tracking
  sample_count INTEGER, -- Number of samples analyzed
  frequency_count INTEGER, -- Frequency of field occurrence
  type_consistency NUMERIC(3,2), -- Type consistency score 0-1
  
  CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_applied_by FOREIGN KEY (applied_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_schema_recommendations_entity 
ON schema_recommendations(entity_type, user_id, status);

CREATE INDEX IF NOT EXISTS idx_schema_recommendations_source 
ON schema_recommendations(source, status);

CREATE INDEX IF NOT EXISTS idx_schema_recommendations_status 
ON schema_recommendations(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_schema_recommendations_idempotency 
ON schema_recommendations(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Add comments
COMMENT ON TABLE schema_recommendations IS 'Stores schema update recommendations from raw_fragments analysis, agents, or LLM inference';
COMMENT ON COLUMN schema_recommendations.source IS 'Source of recommendation: raw_fragments (deterministic), agent (manual), or inference (LLM)';
COMMENT ON COLUMN schema_recommendations.recommendation_type IS 'Type of schema change: add_fields, new_schema, or modify_field';
COMMENT ON COLUMN schema_recommendations.fields_to_add IS 'JSONB array of field definitions to add to schema';
COMMENT ON COLUMN schema_recommendations.confidence_score IS 'Confidence score 0-1 for auto-enhancement eligibility';
COMMENT ON COLUMN schema_recommendations.status IS 'Status: pending, approved, rejected, applied, or auto_applied';
COMMENT ON COLUMN schema_recommendations.idempotency_key IS 'Unique key to prevent duplicate auto-enhancements';
