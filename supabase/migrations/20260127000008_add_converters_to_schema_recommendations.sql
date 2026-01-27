-- Migration: Add converters_to_add column to schema_recommendations
-- Created: 2026-01-20
-- Description: Enables auto-enhancement to add converters to existing schema fields

-- Add converters_to_add column for storing converter definitions
ALTER TABLE schema_recommendations
ADD COLUMN IF NOT EXISTS converters_to_add JSONB;

-- Update recommendation_type check to include 'add_converters'
ALTER TABLE schema_recommendations
DROP CONSTRAINT IF EXISTS schema_recommendations_recommendation_type_check;

ALTER TABLE schema_recommendations
ADD CONSTRAINT schema_recommendations_recommendation_type_check
CHECK (recommendation_type IN ('add_fields', 'new_schema', 'modify_field', 'add_converters'));

-- Add comment to table
COMMENT ON COLUMN schema_recommendations.converters_to_add IS 'Array of converter definitions to add to existing fields. Used when recommendation_type is add_converters.';
