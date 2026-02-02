-- Migration: Add metadata column to schema_registry
-- Created: 2026-01-28
-- Description: Adds metadata JSONB column to store icon information and other schema metadata

-- Add metadata column to schema_registry
ALTER TABLE schema_registry 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Add GIN index for efficient metadata queries
CREATE INDEX IF NOT EXISTS idx_schema_registry_metadata 
ON schema_registry USING GIN(metadata);

-- Add comment explaining metadata structure
COMMENT ON COLUMN schema_registry.metadata IS 'Schema metadata including icon information. Structure: { icon: { icon_type: "lucide" | "svg", icon_name: string, icon_svg?: string, confidence?: number, generated_at: string }, label?: string, description?: string, category?: string }';
