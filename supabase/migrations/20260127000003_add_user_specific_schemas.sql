-- Add user_id and scope to schema_registry for user-specific schemas
-- Migration: 20260127000003_add_user_specific_schemas.sql

-- Add new columns to schema_registry
ALTER TABLE schema_registry 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'global' CHECK (scope IN ('global', 'user'));

-- Update existing records to have global scope
UPDATE schema_registry SET scope = 'global' WHERE scope IS NULL;

-- Drop old unique constraint if it exists
ALTER TABLE schema_registry 
DROP CONSTRAINT IF EXISTS schema_registry_entity_type_schema_version_key;

-- Create new unique index that includes user_id (using COALESCE to handle NULL user_id)
CREATE UNIQUE INDEX IF NOT EXISTS schema_registry_unique 
ON schema_registry(entity_type, schema_version, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Add index for user-specific schema lookups
CREATE INDEX IF NOT EXISTS idx_schema_registry_user 
ON schema_registry(user_id) WHERE user_id IS NOT NULL;

-- Add composite index for efficient scope + entity_type + active lookups
CREATE INDEX IF NOT EXISTS idx_schema_registry_scope_active 
ON schema_registry(scope, entity_type, active) WHERE active = true;

-- Add comment explaining the schema
COMMENT ON COLUMN schema_registry.user_id IS 'User ID for user-specific schemas. NULL for global schemas.';
COMMENT ON COLUMN schema_registry.scope IS 'Scope of schema: global (all users) or user (user-specific)';
