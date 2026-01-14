-- Create field_blacklist table to prevent noise fields from auto-enhancement
-- Migration: 20260127000005_add_field_blacklist.sql

CREATE TABLE IF NOT EXISTS field_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT, -- NULL = applies to all entity types
  field_pattern TEXT NOT NULL, -- Can use wildcards: _test*, *debug*, etc.
  scope TEXT DEFAULT 'global' CHECK (scope IN ('global', 'user')),
  user_id UUID REFERENCES auth.users(id),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  
  -- Note: Unique constraint handled via index below (COALESCE not allowed in UNIQUE constraint)
  
  CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_created_by FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create indexes for efficient blacklist lookups
CREATE INDEX IF NOT EXISTS idx_field_blacklist_entity_type 
ON field_blacklist(entity_type) WHERE entity_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_field_blacklist_scope 
ON field_blacklist(scope);

CREATE INDEX IF NOT EXISTS idx_field_blacklist_user 
ON field_blacklist(user_id) WHERE user_id IS NOT NULL;

-- Create unique index for blacklist entries (using COALESCE for NULL user_id)
CREATE UNIQUE INDEX IF NOT EXISTS unique_blacklist_entry 
ON field_blacklist(
  entity_type, 
  field_pattern, 
  COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- Pre-populate with common noise fields (global blacklist)
INSERT INTO field_blacklist (entity_type, field_pattern, scope, reason) VALUES
  (NULL, '_test*', 'global', 'Test fields'),
  (NULL, '*_test', 'global', 'Test fields'),
  (NULL, '_debug*', 'global', 'Debug fields'),
  (NULL, '*_debug', 'global', 'Debug fields'),
  (NULL, '_temp*', 'global', 'Temporary fields'),
  (NULL, '*_temp', 'global', 'Temporary fields'),
  (NULL, '_old*', 'global', 'Old/backup fields'),
  (NULL, '*_old', 'global', 'Old/backup fields'),
  (NULL, '*__pycache__*', 'global', 'Python cache'),
  (NULL, '*node_modules*', 'global', 'Node modules'),
  (NULL, '*.tmp', 'global', 'Temporary files'),
  (NULL, '_internal*', 'global', 'Internal fields'),
  (NULL, '_private*', 'global', 'Private fields'),
  (NULL, '__*', 'global', 'Double underscore (system) fields')
ON CONFLICT DO NOTHING;

-- Add comments
COMMENT ON TABLE field_blacklist IS 'Blacklist of field patterns to prevent from auto-enhancement';
COMMENT ON COLUMN field_blacklist.entity_type IS 'Entity type to apply blacklist to. NULL = applies to all entity types';
COMMENT ON COLUMN field_blacklist.field_pattern IS 'Field pattern with wildcards (* = any characters). Example: _test* matches _test, _test1, _testing';
COMMENT ON COLUMN field_blacklist.scope IS 'Scope: global (all users) or user (user-specific blacklist)';
