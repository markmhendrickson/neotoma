/**
 * Schema Registry Service for Schema Registry Service (FU-057)
 *
 * Manages config-driven entity schemas, versions, and merge policies.
 */

import { supabase } from "../db.js";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ConverterDefinition {
  from: "number" | "string" | "boolean" | "array" | "object";
  to: "string" | "number" | "date" | "boolean" | "array" | "object";
  function: string; // Converter function name
  deterministic: boolean; // Must be true for MVP
}

export interface FieldDefinition {
  type: "string" | "number" | "date" | "boolean" | "array" | "object";
  required?: boolean;
  validator?: string;
  preserveCase?: boolean; // Preserve case for this field during canonicalization
  description?: string; // Field description
  converters?: ConverterDefinition[]; // Field type converters
}

export interface SchemaDefinition {
  fields: Record<string, FieldDefinition>;
}

export interface ReducerConfig {
  merge_policies: Record<
    string,
    {
      strategy:
        | "last_write"
        | "highest_priority"
        | "most_specific"
        | "merge_array";
      tie_breaker?: "observed_at" | "source_priority";
    }
  >;
}

export interface IconMetadata {
  icon_type: "lucide" | "svg";
  icon_name: string; // Lucide icon name or 'custom'
  icon_svg?: string; // SVG code for custom icons
  confidence?: number; // Match confidence (0-1)
  generated_at: string; // ISO timestamp
}

export interface SchemaMetadata {
  label?: string;
  description?: string;
  category?: "finance" | "productivity" | "knowledge" | "health" | "media";
  icon?: IconMetadata;
  test?: boolean; // Mark schemas created for testing
  test_marked_at?: string; // ISO timestamp when test schema was marked
}

export interface SchemaRegistryEntry {
  id: string;
  entity_type: string;
  schema_version: string;
  schema_definition: SchemaDefinition;
  reducer_config: ReducerConfig;
  active: boolean;
  created_at: string;
  user_id?: string | null;
  scope?: "global" | "user";
  metadata?: SchemaMetadata;
}

export class SchemaRegistryService {
  /**
   * Register a new schema version
   */
  async register(config: {
    entity_type: string;
    schema_version: string;
    schema_definition: SchemaDefinition;
    reducer_config: ReducerConfig;
    user_id?: string;
    user_specific?: boolean;
    activate?: boolean;
    metadata?: SchemaMetadata;
  }): Promise<SchemaRegistryEntry> {
    // Validate schema definition
    this.validateSchemaDefinition(config.schema_definition);

    // Validate reducer config
    this.validateReducerConfig(config.reducer_config, config.schema_definition);

    const scope = config.user_specific ? "user" : "global";

    const { data, error } = await supabase
      .from("schema_registry")
      .insert({
        entity_type: config.entity_type,
        schema_version: config.schema_version,
        schema_definition: config.schema_definition,
        reducer_config: config.reducer_config,
        active: config.activate || false, // New schemas start inactive unless specified
        user_id: config.user_id || null,
        scope: scope,
        metadata: config.metadata || {},
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to register schema: ${error.message}`);
    }

    const registeredSchema = data as SchemaRegistryEntry;

    // Auto-generate icon if not provided (non-blocking)
    this.generateIconAsync(registeredSchema.entity_type, config.metadata);

    // Automatically export schema snapshots (non-blocking)
    this.exportSnapshotsAsync();

    return registeredSchema;
  }

  /**
   * Load active entity schema for entity type
   * Supports user-specific schemas: tries user-specific first, then falls back to global
   */
  async loadActiveSchema(
    entityType: string,
    userId?: string,
  ): Promise<SchemaRegistryEntry | null> {
    // 1. Try user-specific schema first if userId provided
    if (userId) {
      const userSchema = await this.loadUserSpecificSchema(entityType, userId);
      if (userSchema) {
        return userSchema;
      }
    }

    // 2. Fall back to global schema
    return await this.loadGlobalSchema(entityType);
  }

  /**
   * Load user-specific schema for entity type
   */
  async loadUserSpecificSchema(
    entityType: string,
    userId: string,
  ): Promise<SchemaRegistryEntry | null> {
    const { data, error } = await supabase
      .from("schema_registry")
      .select("*")
      .eq("entity_type", entityType)
      .eq("user_id", userId)
      .eq("scope", "user")
      .eq("active", true)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // Not found
        return null;
      }
      throw new Error(
        `Failed to load user-specific schema: ${error.message}`,
      );
    }

    return data as SchemaRegistryEntry;
  }

  /**
   * Load global schema for entity type
   */
  async loadGlobalSchema(
    entityType: string,
  ): Promise<SchemaRegistryEntry | null> {
    const { data, error } = await supabase
      .from("schema_registry")
      .select("*")
      .eq("entity_type", entityType)
      .eq("scope", "global")
      .eq("active", true)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // Not found
        return null;
      }
      throw new Error(`Failed to load global schema: ${error.message}`);
    }

    return data as SchemaRegistryEntry;
  }

  /**
   * Incrementally update schema by adding fields
   *
   * IMPORTANT: After activation, the new schema immediately applies to all new data.
   * The interpretation process automatically uses loadActiveSchema(), so new observations
   * will use the updated schema fields immediately. migrate_existing is only for
   * backfilling historical data stored before the schema update.
   */
  async updateSchemaIncremental(options: {
    entity_type: string;
    fields_to_add?: Array<{
      field_name: string;
      field_type: "string" | "number" | "date" | "boolean" | "array" | "object";
      required?: boolean;
      reducer_strategy?:
        | "last_write"
        | "highest_priority"
        | "most_specific"
        | "merge_array";
    }>;
    converters_to_add?: Array<{
      field_name: string;
      converter: {
        from: "number" | "string" | "boolean" | "array" | "object";
        to: "string" | "number" | "date" | "boolean" | "array" | "object";
        function: string;
        deterministic: boolean;
      };
    }>;
    schema_version?: string;
    user_specific?: boolean;
    user_id?: string;
    migrate_existing?: boolean; // Only for backfilling historical data
    activate?: boolean; // Default: true - activate immediately so new data uses updated schema
  }): Promise<SchemaRegistryEntry> {
    const activateSchema = options.activate !== false; // Default to true

    // 1. Load current active schema (user-specific or global)
    const currentSchema = await this.loadActiveSchema(
      options.entity_type,
      options.user_id,
    );

    if (!currentSchema) {
      throw new Error(
        `No active schema found for entity type: ${options.entity_type}`,
      );
    }

    // 2. Determine change type and increment version
    const changeType = this.determineChangeType({
      fields_to_add: options.fields_to_add,
      converters_to_add: options.converters_to_add,
    });
    const newVersion =
      options.schema_version ||
      this.incrementVersion(currentSchema.schema_version, changeType);

    // 3. Merge fields (add new fields to existing schema)
    const mergedFields = {
      ...currentSchema.schema_definition.fields,
    };

    // Add new fields
    for (const field of options.fields_to_add || []) {
      // Skip if field already exists
      if (mergedFields[field.field_name]) {
        console.log(
          `[SCHEMA_REGISTRY] Field ${field.field_name} already exists in schema, skipping`,
        );
        continue;
      }

      mergedFields[field.field_name] = {
        type: field.field_type,
        required: field.required || false,
      };
    }

    // 4. Merge reducer configs
    const mergedReducerPolicies = {
      ...currentSchema.reducer_config.merge_policies,
    };

    // Add reducer policies for new fields
    for (const field of options.fields_to_add || []) {
      if (!mergedReducerPolicies[field.field_name]) {
        mergedReducerPolicies[field.field_name] = {
          strategy: field.reducer_strategy || "last_write",
          tie_breaker: "observed_at",
        };
      }
    }

    // Handle default user ID: convert to undefined for optional parameter
    const defaultUserId = "00000000-0000-0000-0000-000000000000";
    const userId = options.user_id && options.user_id !== defaultUserId 
      ? options.user_id 
      : undefined;

    // 5. Register new version (start inactive, we'll activate separately if needed)
    const newSchema = await this.register({
      entity_type: options.entity_type,
      schema_version: newVersion,
      schema_definition: { fields: mergedFields },
      reducer_config: { merge_policies: mergedReducerPolicies },
      user_id: userId,
      user_specific: options.user_specific,
      activate: false, // Register as inactive first
    });

    // 6. Activate new version if requested (this deactivates other versions)
    if (activateSchema) {
      await this.activate(options.entity_type, newVersion);
    }

    console.log(
      `[SCHEMA_REGISTRY] Incrementally updated schema for ${options.entity_type} to version ${newVersion}`,
    );

    // 7. Migrate raw_fragments if requested (historical data backfill only)
    if (options.migrate_existing) {
      console.log(
        `[SCHEMA_REGISTRY] Migrating existing raw_fragments for ${options.entity_type}`,
      );
      const fieldNamesToMigrate = [
        ...(options.fields_to_add?.map((f) => f.field_name) || []),
        ...(options.converters_to_add?.map((c) => c.field_name) || []),
      ];
      
      if (fieldNamesToMigrate.length > 0) {
        await this.migrateRawFragmentsToObservations({
          entity_type: options.entity_type,
          field_names: fieldNamesToMigrate,
          user_id: options.user_id,
        });
      }
    }

    return newSchema;
  }

  /**
   * Migrate raw_fragments to observations for updated schema
   * This is for backfilling historical data only - new data automatically uses the updated schema
   */
  async migrateRawFragmentsToObservations(options: {
    entity_type: string;
    field_names: string[];
    user_id?: string;
  }): Promise<{ migrated_count: number }> {
    const BATCH_SIZE = 100; // Smaller batch size for safety
    let totalMigrated = 0;

    console.log(
      `[SCHEMA_REGISTRY] Starting migration for fields: ${options.field_names.join(", ")}`,
    );

    // For each field, get raw_fragments and create observations
    for (const fieldName of options.field_names) {
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        // Get batch of raw_fragments
        let query = supabase
          .from("raw_fragments")
          .select("*")
          .eq("entity_type", options.entity_type)
          .eq("fragment_key", fieldName);

        // Handle user_id properly: check both default UUID and null
        // NOTE: .or() must be called before .range()
        const defaultUserId = "00000000-0000-0000-0000-000000000000";
        if (options.user_id) {
          if (options.user_id === defaultUserId) {
            query = query.or(`user_id.eq.${defaultUserId},user_id.is.null`);
          } else {
            query = query.eq("user_id", options.user_id);
          }
        } else {
          query = query.or(`user_id.is.null,user_id.eq.${defaultUserId}`);
        }

        // Apply range after or() filter
        query = query.range(offset, offset + BATCH_SIZE - 1);

        const { data: fragments, error: fetchError } = await query;

        if (fetchError || !fragments || fragments.length === 0) {
          hasMore = false;
          continue; // No more fragments to migrate
        }

        console.log(
          `[SCHEMA_REGISTRY] Processing batch of ${fragments.length} fragments for field ${fieldName}`,
        );

        // Group fragments by (source_id, interpretation_id) to find entities
        // Fragments from the same source+interpretation belong to the same entity
        const fragmentGroups = new Map<string, typeof fragments>();
        for (const fragment of fragments) {
          const groupKey = `${fragment.source_id || "null"}:${fragment.interpretation_id || "null"}`;
          if (!fragmentGroups.has(groupKey)) {
            fragmentGroups.set(groupKey, []);
          }
          fragmentGroups.get(groupKey)!.push(fragment);
        }

        // Process each group (represents one entity)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const [_groupKey, groupFragments] of fragmentGroups.entries()) {
          if (groupFragments.length === 0) continue;

          const firstFragment = groupFragments[0];
          const sourceId = firstFragment.source_id;
          const interpretationId = firstFragment.interpretation_id;

          // Find entity_id from existing observations with same source_id
          // For structured data (parquet), interpretation_id may be null, so match on source_id only
          let entityId: string | null = null;
          if (sourceId) {
            let obsQuery = supabase
              .from("observations")
              .select("entity_id")
              .eq("source_id", sourceId)
              .eq("entity_type", options.entity_type)
              .limit(1);

            // If interpretation_id exists, also match on it; otherwise match any interpretation_id
            if (interpretationId) {
              obsQuery = obsQuery.eq("interpretation_id", interpretationId);
            } else {
              // For null interpretation_id, match observations with null interpretation_id
              obsQuery = obsQuery.is("interpretation_id", null);
            }

            const { data: existingObs } = await obsQuery.maybeSingle();

            if (existingObs) {
              entityId = existingObs.entity_id;
            }
          }

          if (!entityId) {
            // No existing observation found - skip this group
            // This can happen if fragments were created but observations weren't
            console.warn(
              `[SCHEMA_REGISTRY] No entity found for source ${sourceId}, interpretation ${interpretationId}, skipping migration`,
            );
            continue;
          }

          // Load current schema to get version
          const currentSchema = await this.loadActiveSchema(
            options.entity_type,
            options.user_id,
          );
          if (!currentSchema) {
            console.error(
              `[SCHEMA_REGISTRY] No active schema found for ${options.entity_type}`,
            );
            continue;
          }

          // Collect all promoted fields for this entity from this group
          const promotedFields: Record<string, unknown> = {};
          for (const fragment of groupFragments) {
            if (options.field_names.includes(fragment.fragment_key)) {
              promotedFields[fragment.fragment_key] = fragment.fragment_value;
            }
          }

          if (Object.keys(promotedFields).length === 0) {
            continue; // No fields to migrate for this entity
          }

          try {
            // Create new observation with promoted fields
            // Use the same source_id and interpretation_id for provenance
            const observedAt = new Date().toISOString();
            const { error: obsError } = await supabase
              .from("observations")
              .insert({
                entity_id: entityId,
                entity_type: options.entity_type,
                schema_version: currentSchema.schema_version,
                source_id: sourceId,
                interpretation_id: interpretationId,
                observed_at: observedAt,
                specificity_score: 0.8, // Medium specificity for migrated fields
                source_priority: 0, // Same priority as original interpretation
                fields: promotedFields,
                user_id: firstFragment.user_id,
              });

            if (obsError) {
              // Check if it's a duplicate (idempotence) - that's okay
              if (obsError.code !== "23505") {
                console.error(
                  `[SCHEMA_REGISTRY] Failed to create observation for entity ${entityId}:`,
                  obsError.message,
                );
                continue;
              }
            } else {
              totalMigrated += Object.keys(promotedFields).length;
              console.log(
                `[SCHEMA_REGISTRY] Migrated ${Object.keys(promotedFields).length} fields for entity ${entityId}`,
              );

              // Recompute snapshot to include migrated fields
              try {
                const { observationReducer } = await import("../reducers/observation_reducer.js");
                const { data: allObservations } = await supabase
                  .from("observations")
                  .select("*")
                  .eq("entity_id", entityId)
                  .order("observed_at", { ascending: false });

                if (allObservations && allObservations.length > 0) {
                  const snapshot = await observationReducer.computeSnapshot(
                    entityId,
                    allObservations as any,
                  );

                  await supabase.from("entity_snapshots").upsert(
                    {
                      entity_id: snapshot.entity_id,
                      entity_type: snapshot.entity_type,
                      schema_version: snapshot.schema_version,
                      snapshot: snapshot.snapshot,
                      computed_at: snapshot.computed_at,
                      observation_count: snapshot.observation_count,
                      last_observation_at: snapshot.last_observation_at,
                      provenance: snapshot.provenance,
                      user_id: snapshot.user_id,
                    },
                    {
                      onConflict: "entity_id",
                    },
                  );
                }
              } catch (snapshotError: any) {
                console.warn(
                  `[SCHEMA_REGISTRY] Failed to recompute snapshot for entity ${entityId}:`,
                  snapshotError.message,
                );
                // Continue - snapshot will be recomputed on next observation creation
              }
            }
          } catch (error: any) {
            console.error(
              `[SCHEMA_REGISTRY] Failed to migrate fields for entity ${entityId}:`,
              error.message,
            );
            // Continue with next group - don't fail entire migration
          }
        }

        offset += BATCH_SIZE;

        // Safety check - don't migrate more than 10,000 fragments at once
        if (totalMigrated >= 10000) {
          console.warn(
            `[SCHEMA_REGISTRY] Migration limit reached (10,000 fragments), stopping`,
          );
          break;
        }
      }
    }

    console.log(
      `[SCHEMA_REGISTRY] Migration complete. Total fragments processed: ${totalMigrated}`,
    );

    return { migrated_count: totalMigrated };
  }

  /**
   * Determine change type for schema update
   * 
   * Breaking changes (major):
   * - Removing fields
   * - Changing field types (not just adding converters)
   * - Changing field from optional to required
   * - Removing converters
   * 
   * Minor changes (minor):
   * - Adding new optional fields
   * - Adding converters to existing fields
   * - Changing reducer strategies
   * 
   * Patch changes (patch):
   * - Documentation updates
   * - Non-functional changes
   */
  private determineChangeType(options: {
    fields_to_add?: Array<{
      field_name: string;
      field_type: string;
      required?: boolean;
    }>;
    converters_to_add?: Array<{
      field_name: string;
      converter: any;
    }>;
    fields_to_remove?: string[];
    fields_to_modify?: Array<{
      field_name: string;
      old_type?: string;
      new_type?: string;
      old_required?: boolean;
      new_required?: boolean;
    }>;
  }): "major" | "minor" | "patch" {
    // Breaking changes (major version)
    if (
      options.fields_to_remove &&
      options.fields_to_remove.length > 0
    ) {
      return "major";
    }

    if (options.fields_to_modify && options.fields_to_modify.length > 0) {
      for (const mod of options.fields_to_modify) {
        // Changing field type is breaking
        if (mod.old_type && mod.new_type && mod.old_type !== mod.new_type) {
          return "major";
        }
        // Changing from optional to required is breaking
        if (
          mod.old_required === false &&
          mod.new_required === true
        ) {
          return "major";
        }
      }
    }

    // Minor changes (additive, backward compatible)
    if (
      (options.fields_to_add && options.fields_to_add.length > 0) ||
      (options.converters_to_add && options.converters_to_add.length > 0)
    ) {
      return "minor";
    }

    // Patch changes (no functional changes)
    return "patch";
  }

  /**
   * Increment schema version using semantic versioning (major.minor.patch)
   * 
   * - Major: Breaking changes (removing fields, changing types, making fields required)
   * - Minor: Additive changes (new fields, new converters) - backward compatible
   * - Patch: Non-functional changes (documentation, formatting)
   * 
   * Examples:
   * - 1.0.0 -> 1.1.0 (add new optional field)
   * - 1.1.0 -> 1.1.1 (patch change)
   * - 1.1.1 -> 2.0.0 (breaking change - remove field)
   */
  private incrementVersion(
    currentVersion: string,
    changeType: "major" | "minor" | "patch" = "minor"
  ): string {
    // Parse version (support both "1.0" and "1.0.0" formats)
    const parts = currentVersion.split(".");
    const major = parseInt(parts[0] || "1", 10);
    const minor = parseInt(parts[1] || "0", 10);
    const patch = parseInt(parts[2] || "0", 10);

    switch (changeType) {
      case "major":
        // Breaking change: increment major, reset minor and patch
        return `${major + 1}.0.0`;
      case "minor":
        // Additive change: increment minor, reset patch
        return `${major}.${minor + 1}.0`;
      case "patch":
        // Non-functional change: increment patch
        return `${major}.${minor}.${patch + 1}`;
      default:
        // Default to minor for backward compatibility
        return `${major}.${minor + 1}.0`;
    }
  }

  /**
   * Activate schema version
   * Supports user-specific schemas: deactivates other versions for same entity_type and user_id/scope
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async activate(entityType: string, version: string, _userId?: string): Promise<void> {
    // Load the schema to get its scope and user_id
    const { data: schema } = await supabase
      .from("schema_registry")
      .select("scope, user_id")
      .eq("entity_type", entityType)
      .eq("schema_version", version)
      .single();

    if (!schema) {
      throw new Error(`Schema not found: ${entityType} version ${version}`);
    }

    const scope = schema.scope || "global";
    const schemaUserId = schema.user_id;

    // Deactivate all other versions for this entity type and scope/user_id
    let deactivateQuery = supabase
      .from("schema_registry")
      .update({ active: false })
      .eq("entity_type", entityType)
      .eq("active", true);

    if (scope === "user" && schemaUserId) {
      deactivateQuery = deactivateQuery.eq("user_id", schemaUserId);
    } else {
      deactivateQuery = deactivateQuery.eq("scope", "global").is("user_id", null);
    }

    await deactivateQuery;

    // Activate specified version
    const { error } = await supabase
      .from("schema_registry")
      .update({ active: true })
      .eq("entity_type", entityType)
      .eq("schema_version", version);

    if (error) {
      throw new Error(`Failed to activate schema: ${error.message}`);
    }

    // Automatically export schema snapshots (non-blocking)
    this.exportSnapshotsAsync();
  }

  /**
   * Deactivate schema version
   */
  async deactivate(entityType: string, version: string): Promise<void> {
    const { error } = await supabase
      .from("schema_registry")
      .update({ active: false })
      .eq("entity_type", entityType)
      .eq("schema_version", version);

    if (error) {
      throw new Error(`Failed to deactivate schema: ${error.message}`);
    }

    // Automatically export schema snapshots (non-blocking)
    this.exportSnapshotsAsync();
  }

  /**
   * Get all entity schema versions for entity type
   */
  async getSchemaVersions(entityType: string): Promise<SchemaRegistryEntry[]> {
    const { data, error } = await supabase
      .from("schema_registry")
      .select("*")
      .eq("entity_type", entityType)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to get schema versions: ${error.message}`);
    }

    return (data || []) as SchemaRegistryEntry[];
  }

  /**
   * Generate searchable text for an entity schema (for embedding generation)
   */
  private generateSearchableText(schema: SchemaRegistryEntry): string {
    const parts: string[] = [schema.entity_type];
    
    // Add field names
    const fieldNames = Object.keys(schema.schema_definition.fields || {});
    parts.push(...fieldNames);
    
    // Add field types for context (e.g., "date", "amount", "name")
    for (const [fieldName, fieldDef] of Object.entries(schema.schema_definition.fields || {})) {
      if (fieldDef.type === "date" && fieldName.includes("date")) {
        parts.push("date", "time", "timestamp");
      }
      if (fieldDef.type === "number" && (fieldName.includes("amount") || fieldName.includes("price") || fieldName.includes("cost"))) {
        parts.push("amount", "price", "cost", "money", "financial");
      }
      if (fieldName.includes("name") || fieldName.includes("title")) {
        parts.push("name", "title", "label");
      }
    }
    
    return parts.join(" ");
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * List all active entity types, optionally filtered by keyword with vector search fallback
   */
  async listEntityTypes(keyword?: string): Promise<Array<{
    entity_type: string;
    schema_version: string;
    field_names: string[];
    field_summary: Record<string, { type: string; required: boolean }>;
    similarity_score?: number;
    match_type?: "keyword" | "vector";
  }>> {
    // Get all active schemas from database
    const query = supabase
      .from("schema_registry")
      .select("entity_type, schema_version, schema_definition")
      .eq("active", true);

    const { data: dbSchemas } = await query;

    // Fallback to code-defined schemas if database is empty or error
    const { ENTITY_SCHEMAS } = await import("./schema_definitions.js");
    const allSchemas = new Map<string, SchemaRegistryEntry>();

    if (dbSchemas && dbSchemas.length > 0) {
      for (const schema of dbSchemas) {
        allSchemas.set(schema.entity_type, schema as SchemaRegistryEntry);
      }
    } else {
      // Use code-defined schemas as fallback
      for (const [entityType, schema] of Object.entries(ENTITY_SCHEMAS)) {
        allSchemas.set(entityType, {
          id: "",
          entity_type: schema.entity_type,
          schema_version: schema.schema_version,
          schema_definition: schema.schema_definition,
          reducer_config: schema.reducer_config,
          active: true,
          created_at: new Date().toISOString(),
        });
      }
    }

    const allSchemasArray = Array.from(allSchemas.values());

    // If no keyword, return all
    if (!keyword) {
      return allSchemasArray.map((schema) => {
        const fieldNames = Object.keys(schema.schema_definition.fields || {});
        const fieldSummary: Record<string, { type: string; required: boolean }> = {};
        for (const [fieldName, fieldDef] of Object.entries(schema.schema_definition.fields || {})) {
          fieldSummary[fieldName] = {
            type: fieldDef.type,
            required: fieldDef.required || false,
          };
        }

        return {
          entity_type: schema.entity_type,
          schema_version: schema.schema_version,
          field_names: fieldNames,
          field_summary: fieldSummary,
        };
      });
    }

    const keywordLower = keyword.toLowerCase();
    
    // Step 1: Try keyword matching first (deterministic, strong consistency)
    const keywordMatches: Array<{
      schema: SchemaRegistryEntry;
      score: number;
    }> = [];

    for (const schema of allSchemasArray) {
      let score = 0;
      
      // Exact entity type match (highest score)
      if (schema.entity_type.toLowerCase() === keywordLower) {
        score = 10;
      }
      // Entity type contains keyword
      else if (schema.entity_type.toLowerCase().includes(keywordLower)) {
        score = 5;
      }
      
      // Field name matches
      const fieldNames = Object.keys(schema.schema_definition.fields || {});
      for (const fieldName of fieldNames) {
        if (fieldName.toLowerCase() === keywordLower) {
          score += 3;
        } else if (fieldName.toLowerCase().includes(keywordLower)) {
          score += 1;
        }
      }
      
      if (score > 0) {
        keywordMatches.push({ schema, score });
      }
    }

    // If we have good keyword matches (score >= 3), return those
    const goodKeywordMatches = keywordMatches.filter(m => m.score >= 3);
    if (goodKeywordMatches.length > 0) {
      return goodKeywordMatches
        .sort((a, b) => b.score - a.score)
        .map(({ schema, score }) => {
          const fieldNames = Object.keys(schema.schema_definition.fields || {});
          const fieldSummary: Record<string, { type: string; required: boolean }> = {};
          for (const [fieldName, fieldDef] of Object.entries(schema.schema_definition.fields || {})) {
            fieldSummary[fieldName] = {
              type: fieldDef.type,
              required: fieldDef.required || false,
            };
          }

          return {
            entity_type: schema.entity_type,
            schema_version: schema.schema_version,
            field_names: fieldNames,
            field_summary: fieldSummary,
            similarity_score: score / 10, // Normalize to 0-1 range
            match_type: "keyword" as const,
          };
        });
    }

    // Step 2: Fallback to vector search (semantic matching, bounded eventual consistency)
    const { generateEmbedding } = await import("../embeddings.js");
    const queryEmbedding = await generateEmbedding(keyword);
    
    if (!queryEmbedding) {
      // If embeddings not available, return keyword matches even if low score
      return keywordMatches
        .sort((a, b) => b.score - a.score)
        .map(({ schema, score }) => {
          const fieldNames = Object.keys(schema.schema_definition.fields || {});
          const fieldSummary: Record<string, { type: string; required: boolean }> = {};
          for (const [fieldName, fieldDef] of Object.entries(schema.schema_definition.fields || {})) {
            fieldSummary[fieldName] = {
              type: fieldDef.type,
              required: fieldDef.required || false,
            };
          }

          return {
            entity_type: schema.entity_type,
            schema_version: schema.schema_version,
            field_names: fieldNames,
            field_summary: fieldSummary,
            similarity_score: score / 10,
            match_type: "keyword" as const,
          };
        });
    }

    // Generate embeddings for all schemas and calculate similarity
    const schemaEmbeddings: Array<{
      schema: SchemaRegistryEntry;
      embedding: number[];
      similarity: number;
    }> = [];

    for (const schema of allSchemasArray) {
      const searchableText = this.generateSearchableText(schema);
      const schemaEmbedding = await generateEmbedding(searchableText);
      
      if (schemaEmbedding) {
        const similarity = this.cosineSimilarity(queryEmbedding, schemaEmbedding);
        schemaEmbeddings.push({ schema, embedding: schemaEmbedding, similarity });
      }
    }

    // Sort by similarity and return top matches
    const vectorMatches = schemaEmbeddings
      .filter(item => item.similarity > 0.3) // Threshold for relevance
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 20) // Limit results
      .map(({ schema, similarity }) => {
        const fieldNames = Object.keys(schema.schema_definition.fields || {});
        const fieldSummary: Record<string, { type: string; required: boolean }> = {};
        for (const [fieldName, fieldDef] of Object.entries(schema.schema_definition.fields || {})) {
          fieldSummary[fieldName] = {
            type: fieldDef.type,
            required: fieldDef.required || false,
          };
        }

        return {
          entity_type: schema.entity_type,
          schema_version: schema.schema_version,
          field_names: fieldNames,
          field_summary: fieldSummary,
          similarity_score: similarity,
          match_type: "vector" as const,
        };
      });

    // If vector search found results, return them
    if (vectorMatches.length > 0) {
      return vectorMatches;
    }

    // Final fallback: return keyword matches even if low score
    return keywordMatches
      .sort((a, b) => b.score - a.score)
      .map(({ schema, score }) => {
        const fieldNames = Object.keys(schema.schema_definition.fields || {});
        const fieldSummary: Record<string, { type: string; required: boolean }> = {};
        for (const [fieldName, fieldDef] of Object.entries(schema.schema_definition.fields || {})) {
          fieldSummary[fieldName] = {
            type: fieldDef.type,
            required: fieldDef.required || false,
          };
        }

        return {
          entity_type: schema.entity_type,
          schema_version: schema.schema_version,
          field_names: fieldNames,
          field_summary: fieldSummary,
          similarity_score: score / 10,
          match_type: "keyword" as const,
        };
      });
  }

  /**
   * Validate schema definition
   */
  private validateSchemaDefinition(definition: SchemaDefinition): void {
    if (!definition.fields || typeof definition.fields !== "object") {
      throw new Error("Schema definition must have fields object");
    }

    const validTypes = [
      "string",
      "number",
      "date",
      "boolean",
      "array",
      "object",
    ];
    for (const [fieldName, fieldDef] of Object.entries(definition.fields)) {
      if (!validTypes.includes(fieldDef.type)) {
        throw new Error(
          `Invalid field type for ${fieldName}: ${fieldDef.type}`,
        );
      }

      // Validate converters if defined
      if (fieldDef.converters) {
        if (!Array.isArray(fieldDef.converters)) {
          throw new Error(
            `Converters for ${fieldName} must be an array`,
          );
        }

        for (const converter of fieldDef.converters) {
          // Validate required properties
          if (!converter.from || !converter.to || !converter.function) {
            throw new Error(
              `Converter for ${fieldName} must have from, to, and function properties`,
            );
          }

          // Validate deterministic property
          if (converter.deterministic !== true) {
            throw new Error(
              `Converter for ${fieldName} must be deterministic (deterministic: true)`,
            );
          }

          // Validate from/to types
          if (!validTypes.includes(converter.from)) {
            throw new Error(
              `Invalid converter from type for ${fieldName}: ${converter.from}`,
            );
          }
          if (!validTypes.includes(converter.to)) {
            throw new Error(
              `Invalid converter to type for ${fieldName}: ${converter.to}`,
            );
          }

          // Validate that converter 'to' type matches field type
          if (converter.to !== fieldDef.type) {
            throw new Error(
              `Converter for ${fieldName} must convert to field type ${fieldDef.type}, not ${converter.to}`,
            );
          }

          // Validate converter function name format (basic check)
          if (typeof converter.function !== "string" || converter.function.length === 0) {
            throw new Error(
              `Converter function name for ${fieldName} must be a non-empty string`,
            );
          }
        }
      }
    }
  }

  /**
   * Validate reducer config
   */
  private validateReducerConfig(
    config: ReducerConfig,
    schemaDefinition: SchemaDefinition,
  ): void {
    if (!config.merge_policies || typeof config.merge_policies !== "object") {
      throw new Error("Reducer config must have merge_policies object");
    }

    const validStrategies = [
      "last_write",
      "highest_priority",
      "most_specific",
      "merge_array",
    ];
    const validTieBreakers = ["observed_at", "source_priority"];

    for (const [fieldName, policy] of Object.entries(config.merge_policies)) {
      if (!schemaDefinition.fields[fieldName]) {
        throw new Error(`Merge policy references unknown field: ${fieldName}`);
      }

      if (!validStrategies.includes(policy.strategy)) {
        throw new Error(
          `Invalid merge strategy for ${fieldName}: ${policy.strategy}`,
        );
      }

      if (
        policy.tie_breaker &&
        !validTieBreakers.includes(policy.tie_breaker)
      ) {
        throw new Error(
          `Invalid tie breaker for ${fieldName}: ${policy.tie_breaker}`,
        );
      }
    }
  }

  /**
   * Update icon metadata for a schema
   */
  async updateIconMetadata(
    entityType: string,
    iconMetadata: IconMetadata,
    userId?: string
  ): Promise<void> {
    // Find the active schema for this entity type
    const schema = await this.loadActiveSchema(entityType, userId);
    
    if (!schema) {
      console.warn(`[SCHEMA_REGISTRY] No active schema found for ${entityType}, cannot update icon`);
      return;
    }
    
    // Update metadata with icon
    const updatedMetadata = {
      ...(schema.metadata || {}),
      icon: iconMetadata,
    };
    
    const { error } = await supabase
      .from("schema_registry")
      .update({ metadata: updatedMetadata })
      .eq("id", schema.id);
    
    if (error) {
      console.error(`[SCHEMA_REGISTRY] Failed to update icon metadata for ${entityType}:`, error);
    }
  }

  /**
   * Generate icon for a schema asynchronously (non-blocking)
   */
  private async generateIconAsync(
    entityType: string,
    metadata?: SchemaMetadata
  ): Promise<void> {
    // Only generate if icon doesn't already exist
    if (metadata?.icon) {
      return;
    }
    
    try {
      // Import icon service dynamically to avoid circular dependencies
      const { generateIconForEntityType } = await import("./schema_icon_service.js");
      
      // Generate icon
      const iconMetadata = await generateIconForEntityType(entityType, metadata);
      
      // Update schema with icon
      await this.updateIconMetadata(entityType, iconMetadata);
    } catch (error) {
      // Don't fail schema registration if icon generation fails
      console.warn(`[SCHEMA_REGISTRY] Failed to generate icon for ${entityType}:`, error);
    }
  }

  /**
   * Export schema snapshots asynchronously (non-blocking)
   * Automatically exports snapshots after schema changes without blocking operations
   */
  private exportSnapshotsAsync(): void {
    // Only export if we're in a Node.js environment (not browser)
    if (typeof process === "undefined" || !process.env) {
      return;
    }

    // Skip export in test environments to avoid side effects
    if (process.env.NODE_ENV === "test" || process.env.VITEST) {
      return;
    }

    // Run export script asynchronously (fire-and-forget)
    const scriptPath = join(
      __dirname,
      "../../scripts/export_schema_snapshots.ts",
    );
    const child = spawn("tsx", [scriptPath], {
      stdio: "ignore", // Suppress output to avoid cluttering logs
      detached: true,
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "development" },
    });

    // Don't wait for completion - let it run in background
    child.unref();

    // Handle errors silently (don't fail schema operations if export fails)
    child.on("error", (error) => {
      // Silently ignore export errors - schema operations should not fail
      // if snapshot export fails (e.g., in CI/CD or restricted environments)
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `[Schema Registry] Failed to export snapshots: ${error.message}`,
        );
      }
    });
  }
}

export const schemaRegistry = new SchemaRegistryService();
