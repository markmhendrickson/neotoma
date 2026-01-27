-- Migration: Make fields_to_add nullable in schema_recommendations
-- Created: 2026-01-20
-- Description: Allows add_converters recommendations without fields_to_add

-- Make fields_to_add nullable (for add_converters recommendations)
ALTER TABLE schema_recommendations
ALTER COLUMN fields_to_add DROP NOT NULL;

-- Add comment
COMMENT ON COLUMN schema_recommendations.fields_to_add IS 'Array of field definitions to add. Required for add_fields recommendation_type, null for add_converters.';
