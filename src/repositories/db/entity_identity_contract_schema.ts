/** Existing-registry identity admission guards. No second schema registry. */
export const ENTITY_IDENTITY_CONTRACT_SCHEMA = [
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_namespace_anchor
   ON schema_registry(json_extract(identity_binding, '$.contract.namespace'))
   WHERE identity_binding IS NOT NULL AND
     json_extract(identity_binding, '$.anchor_schema_id') = id`,
  `CREATE TRIGGER IF NOT EXISTS identity_registry_insert_guard
   BEFORE INSERT ON schema_registry
   BEGIN
     SELECT CASE WHEN NEW.identity_binding IS NULL AND
       json_extract(NEW.schema_definition, '$.identity_contract') IS NOT NULL
       THEN RAISE(ABORT, 'EXACT_IDENTITY_BINDING_REQUIRED') END;
     SELECT CASE WHEN NEW.identity_binding IS NULL AND EXISTS (
       SELECT 1 FROM schema_registry s WHERE s.entity_type = NEW.entity_type AND
       s.identity_binding IS NOT NULL AND
       (s.scope IS NULL OR s.scope = 'global' OR NEW.scope = 'global' OR s.user_id IS NEW.user_id)
     ) THEN RAISE(ABORT, 'EXACT_IDENTITY_BINDING_IMMUTABLE') END;
     SELECT CASE WHEN NEW.identity_binding IS NOT NULL AND
       NOT json_valid(NEW.identity_binding)
       THEN RAISE(ABORT, 'EXACT_IDENTITY_BINDING_INVALID') END;
     SELECT CASE WHEN NEW.identity_binding IS NOT NULL AND (
       json_extract(NEW.identity_binding, '$.version') IS NOT '1' OR
       json_type(NEW.identity_binding, '$.anchor_schema_id') IS NOT 'text' OR
       json_extract(NEW.identity_binding, '$.anchor_schema_id') = '' OR
       json_type(NEW.identity_binding, '$.contract_id') IS NOT 'text' OR
       length(json_extract(NEW.identity_binding, '$.contract_id')) IS NOT 64 OR
       json_extract(NEW.identity_binding, '$.contract_id') GLOB '*[^0-9a-f]*' OR
       json_extract(NEW.identity_binding, '$.entity_type') IS NOT NEW.entity_type OR
       json_extract(NEW.identity_binding, '$.scope') IS NOT NEW.scope OR
       json_extract(NEW.identity_binding, '$.user_id') IS NOT NEW.user_id OR
       NEW.scope NOT IN ('global', 'user') OR NEW.scope IS NULL OR
       (NEW.scope = 'user' AND (NEW.user_id IS NULL OR NEW.user_id = '')) OR
       (NEW.scope = 'global' AND NEW.user_id IS NOT NULL) OR
       json_type(NEW.identity_binding, '$.tenant_scoped_entity_ids') NOT IN ('true', 'false') OR
       json_type(NEW.identity_binding, '$.tenant_scoped_entity_ids') IS NULL OR
       json_extract(NEW.identity_binding, '$.contract.version') IS NOT '2' OR
       json_extract(NEW.identity_binding, '$.contract.mode') IS NOT 'exact_utf8' OR
       json_extract(NEW.identity_binding, '$.contract.namespace') IS NULL OR
       json_extract(NEW.identity_binding, '$.contract.namespace') = '' OR
       json_extract(NEW.schema_definition, '$.identity_contract') IS NOT
         json_extract(NEW.identity_binding, '$.contract') OR
       json_extract(NEW.schema_definition, '$.canonical_name_fields') IS NOT
         json_extract(NEW.identity_binding, '$.contract.canonical_name_fields') OR
       json_extract(NEW.schema_definition, '$.identity_opt_out') IS NOT NULL
     ) THEN RAISE(ABORT, 'EXACT_IDENTITY_BINDING_INVALID') END;
     SELECT CASE WHEN NEW.identity_binding IS NOT NULL AND
       json_extract(NEW.identity_binding, '$.anchor_schema_id') IS NOT NEW.id AND NOT EXISTS (
         SELECT 1 FROM schema_registry s WHERE s.id =
           json_extract(NEW.identity_binding, '$.anchor_schema_id') AND
           s.identity_binding = NEW.identity_binding
       ) THEN RAISE(ABORT, 'EXACT_IDENTITY_ANCHOR_REQUIRED') END;
     SELECT CASE WHEN NEW.identity_binding IS NOT NULL AND
       json_extract(NEW.identity_binding, '$.anchor_schema_id') = NEW.id AND (
         EXISTS (SELECT 1 FROM schema_registry s WHERE s.entity_type = NEW.entity_type AND
           (s.scope IS NULL OR s.scope = 'global' OR NEW.scope = 'global' OR s.user_id IS NEW.user_id)) OR
         EXISTS (SELECT 1 FROM entities e WHERE e.entity_type = NEW.entity_type AND
           (NEW.scope = 'global' OR e.user_id IS NEW.user_id OR e.user_id IS NULL))
       ) THEN RAISE(ABORT, 'EXACT_IDENTITY_FRESH_NAMESPACE_REQUIRED') END;
   END`,
  `CREATE TRIGGER IF NOT EXISTS identity_registry_update_guard
   BEFORE UPDATE ON schema_registry
   BEGIN
     SELECT CASE WHEN OLD.identity_binding IS NOT NEW.identity_binding
       THEN RAISE(ABORT, 'EXACT_IDENTITY_BINDING_IMMUTABLE') END;
     SELECT CASE WHEN OLD.identity_binding IS NOT NULL AND (
       OLD.id IS NOT NEW.id OR OLD.entity_type IS NOT NEW.entity_type OR
       OLD.scope IS NOT NEW.scope OR OLD.user_id IS NOT NEW.user_id OR
       json_extract(NEW.schema_definition, '$.identity_contract') IS NOT
         json_extract(OLD.schema_definition, '$.identity_contract') OR
       json_extract(NEW.schema_definition, '$.canonical_name_fields') IS NOT
         json_extract(OLD.schema_definition, '$.canonical_name_fields') OR
       json_extract(NEW.schema_definition, '$.identity_opt_out') IS NOT NULL
     ) THEN RAISE(ABORT, 'EXACT_IDENTITY_BINDING_IMMUTABLE') END;
     SELECT CASE WHEN OLD.identity_binding IS NULL AND
       json_extract(NEW.schema_definition, '$.identity_contract') IS NOT NULL
       THEN RAISE(ABORT, 'EXACT_IDENTITY_FRESH_NAMESPACE_REQUIRED') END;
   END`,
  `CREATE TRIGGER IF NOT EXISTS identity_registry_delete_guard
   BEFORE DELETE ON schema_registry WHEN OLD.identity_binding IS NOT NULL
   BEGIN SELECT RAISE(ABORT, 'EXACT_IDENTITY_BINDING_IMMUTABLE'); END`,
  // Until supported readers/writers consume the accepted bytes, an inactive
  // reservation cannot silently acquire legacy entities or be SQL-activated.
  `CREATE TRIGGER IF NOT EXISTS identity_registry_activation_insert_guard
   BEFORE INSERT ON schema_registry
   WHEN NEW.identity_binding IS NOT NULL AND NEW.active = 1
   BEGIN SELECT RAISE(ABORT, 'EXACT_IDENTITY_ACTIVATION_UNAVAILABLE'); END`,
  `CREATE TRIGGER IF NOT EXISTS identity_registry_activation_update_guard
   BEFORE UPDATE OF active ON schema_registry
   WHEN NEW.identity_binding IS NOT NULL AND NEW.active = 1
   BEGIN SELECT RAISE(ABORT, 'EXACT_IDENTITY_ACTIVATION_UNAVAILABLE'); END`,
  `CREATE TRIGGER IF NOT EXISTS identity_reserved_entity_insert_guard
   BEFORE INSERT ON entities WHEN EXISTS (
     SELECT 1 FROM schema_registry s WHERE s.entity_type = NEW.entity_type AND
       s.identity_binding IS NOT NULL AND
       (s.scope = 'global' OR s.user_id IS NEW.user_id OR NEW.user_id IS NULL)
   ) BEGIN SELECT RAISE(ABORT, 'EXACT_IDENTITY_ACTIVATION_UNAVAILABLE'); END`,
  `CREATE TRIGGER IF NOT EXISTS identity_reserved_observation_insert_guard
   BEFORE INSERT ON observations WHEN EXISTS (
     SELECT 1 FROM schema_registry s WHERE s.entity_type = NEW.entity_type AND
       s.identity_binding IS NOT NULL AND
       (s.scope = 'global' OR s.user_id IS NEW.user_id OR NEW.user_id IS NULL)
   ) BEGIN SELECT RAISE(ABORT, 'EXACT_IDENTITY_ACTIVATION_UNAVAILABLE'); END`,
  `CREATE TRIGGER IF NOT EXISTS identity_reserved_entity_update_guard
   BEFORE UPDATE OF entity_type, user_id ON entities WHEN EXISTS (
     SELECT 1 FROM schema_registry s WHERE s.entity_type = NEW.entity_type AND
       s.identity_binding IS NOT NULL AND
       (s.scope = 'global' OR s.user_id IS NEW.user_id OR NEW.user_id IS NULL)
   ) BEGIN SELECT RAISE(ABORT, 'EXACT_IDENTITY_ACTIVATION_UNAVAILABLE'); END`,
  `CREATE TRIGGER IF NOT EXISTS identity_reserved_observation_update_guard
   BEFORE UPDATE OF entity_type, user_id, entity_id ON observations WHEN EXISTS (
     SELECT 1 FROM schema_registry s WHERE s.entity_type = NEW.entity_type AND
       s.identity_binding IS NOT NULL AND
       (s.scope = 'global' OR s.user_id IS NEW.user_id OR NEW.user_id IS NULL)
   ) BEGIN SELECT RAISE(ABORT, 'EXACT_IDENTITY_ACTIVATION_UNAVAILABLE'); END`,
];
