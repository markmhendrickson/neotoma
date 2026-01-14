-- Migration: Add preserveCase metadata to schema fields
-- Purpose: Explicitly mark fields that should preserve case during canonicalization
-- This enables schema-driven case preservation as schemas expand

-- Update note schema: add preserveCase to title, content, summary, notes
UPDATE schema_registry
SET schema_definition = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        schema_definition,
        '{fields,title,preserveCase}',
        'true'::jsonb
      ),
      '{fields,content,preserveCase}',
      'true'::jsonb
    ),
    '{fields,summary,preserveCase}',
    'true'::jsonb
  ),
  '{fields,notes,preserveCase}',
  'true'::jsonb
)
WHERE entity_type = 'note'
  AND schema_version = '1.0'
  AND schema_definition->'fields'->'title' IS NOT NULL;

-- Update message schema: add preserveCase to subject, body, notes
UPDATE schema_registry
SET schema_definition = jsonb_set(
  jsonb_set(
    jsonb_set(
      schema_definition,
      '{fields,subject,preserveCase}',
      'true'::jsonb
    ),
    '{fields,body,preserveCase}',
    'true'::jsonb
  ),
  '{fields,notes,preserveCase}',
  'true'::jsonb
)
WHERE entity_type = 'message'
  AND schema_version = '1.0'
  AND schema_definition->'fields'->'subject' IS NOT NULL;

-- Update person schema: add preserveCase to name fields
UPDATE schema_registry
SET schema_definition = 
  CASE 
    WHEN schema_definition->'fields'->'name' IS NOT NULL THEN
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              schema_definition,
              '{fields,name,preserveCase}',
              'true'::jsonb
            ),
            '{fields,first_name,preserveCase}',
            'true'::jsonb
          ),
          '{fields,last_name,preserveCase}',
          'true'::jsonb
        ),
        '{fields,full_name,preserveCase}',
        'true'::jsonb
      )
    ELSE schema_definition
  END
WHERE entity_type = 'person'
  AND schema_version = '1.0';

-- Update company schema: add preserveCase to name fields
UPDATE schema_registry
SET schema_definition = 
  CASE 
    WHEN schema_definition->'fields'->'name' IS NOT NULL THEN
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              schema_definition,
              '{fields,name,preserveCase}',
              'true'::jsonb
            ),
            '{fields,legal_name,preserveCase}',
            'true'::jsonb
          ),
          '{fields,address,preserveCase}',
          'true'::jsonb
        ),
        '{fields,description,preserveCase}',
        'true'::jsonb
      )
    ELSE schema_definition
  END
WHERE entity_type = 'company'
  AND schema_version = '1.0';

-- Update invoice schema: add preserveCase to name and address fields
UPDATE schema_registry
SET schema_definition = 
  CASE 
    WHEN schema_definition->'fields'->'vendor_name' IS NOT NULL THEN
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                schema_definition,
                '{fields,vendor_name,preserveCase}',
                'true'::jsonb
              ),
              '{fields,customer_name,preserveCase}',
              'true'::jsonb
            ),
            '{fields,vendor_address,preserveCase}',
            'true'::jsonb
          ),
          '{fields,customer_address,preserveCase}',
          'true'::jsonb
        ),
        '{fields,notes,preserveCase}',
        'true'::jsonb
      )
    ELSE schema_definition
  END
WHERE entity_type = 'invoice'
  AND schema_version = '1.0';

-- Update transaction schema: add preserveCase to merchant_name and description
UPDATE schema_registry
SET schema_definition = 
  CASE 
    WHEN schema_definition->'fields'->'merchant_name' IS NOT NULL THEN
      jsonb_set(
        jsonb_set(
          schema_definition,
          '{fields,merchant_name,preserveCase}',
          'true'::jsonb
        ),
        '{fields,description,preserveCase}',
        'true'::jsonb
      )
    ELSE schema_definition
  END
WHERE entity_type = 'transaction'
  AND schema_version = '1.0';

-- Update contact schema: add preserveCase to name fields
UPDATE schema_registry
SET schema_definition = 
  CASE 
    WHEN schema_definition->'fields'->'name' IS NOT NULL THEN
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                schema_definition,
                '{fields,name,preserveCase}',
                'true'::jsonb
              ),
              '{fields,first_name,preserveCase}',
              'true'::jsonb
            ),
            '{fields,last_name,preserveCase}',
            'true'::jsonb
          ),
          '{fields,company_name,preserveCase}',
          'true'::jsonb
        ),
        '{fields,address,preserveCase}',
        'true'::jsonb
      )
    ELSE schema_definition
  END
WHERE entity_type = 'contact'
  AND schema_version = '1.0';

-- Update task schema: add preserveCase to title and description
UPDATE schema_registry
SET schema_definition = 
  CASE 
    WHEN schema_definition->'fields'->'title' IS NOT NULL THEN
      jsonb_set(
        jsonb_set(
          schema_definition,
          '{fields,title,preserveCase}',
          'true'::jsonb
        ),
        '{fields,description,preserveCase}',
        'true'::jsonb
      )
    ELSE schema_definition
  END
WHERE entity_type = 'task'
  AND schema_version = '1.0';

-- Update event schema: add preserveCase to title, description, location, venue
UPDATE schema_registry
SET schema_definition = 
  CASE 
    WHEN schema_definition->'fields'->'title' IS NOT NULL THEN
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              schema_definition,
              '{fields,title,preserveCase}',
              'true'::jsonb
            ),
            '{fields,description,preserveCase}',
            'true'::jsonb
          ),
          '{fields,location,preserveCase}',
          'true'::jsonb
        ),
        '{fields,venue,preserveCase}',
        'true'::jsonb
      )
    ELSE schema_definition
  END
WHERE entity_type = 'event'
  AND schema_version = '1.0';

-- Update property schema: add preserveCase to address and location fields
UPDATE schema_registry
SET schema_definition = 
  CASE 
    WHEN schema_definition->'fields'->'address' IS NOT NULL THEN
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                schema_definition,
                '{fields,address,preserveCase}',
                'true'::jsonb
              ),
              '{fields,city,preserveCase}',
              'true'::jsonb
            ),
            '{fields,state,preserveCase}',
            'true'::jsonb
          ),
          '{fields,country,preserveCase}',
          'true'::jsonb
        ),
        '{fields,location,preserveCase}',
        'true'::jsonb
      )
    ELSE schema_definition
  END
WHERE entity_type = 'property'
  AND schema_version = '1.0';

-- Note: This migration updates existing schemas in the database.
-- New schemas registered via schema:init will automatically include preserveCase
-- metadata from schema_definitions.ts (which should be updated separately).
