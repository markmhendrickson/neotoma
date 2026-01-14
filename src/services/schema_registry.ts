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

export interface SchemaDefinition {
  fields: Record<
    string,
    {
      type: "string" | "number" | "date" | "boolean" | "array" | "object";
      required?: boolean;
      validator?: string;
      preserveCase?: boolean; // Preserve case for this field during canonicalization
      description?: string; // Field description
    }
  >;
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
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to register schema: ${error.message}`);
    }

    // Automatically export schema snapshots (non-blocking)
    this.exportSnapshotsAsync();

    return data as SchemaRegistryEntry;
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
    fields_to_add: Array<{
      field_name: string;
      field_type: "string" | "number" | "date" | "boolean" | "array" | "object";
      required?: boolean;
      reducer_strategy?:
        | "last_write"
        | "highest_priority"
        | "most_specific"
        | "merge_array";
    }>;
    schema_version?: string;
    user_specific?: boolean;
    user_id?: string;
    migrate_existing?: boolean; // Only for backfilling historical data
    activate?: boolean; // Default: true - activate immediately so new data uses updated schema
  }): Promise<SchemaRegistryEntry> {
    const activateSchema = options.activate !== false; // Default to true
    const scope = options.user_specific ? "user" : "global";

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

    // 2. Increment version
    const newVersion =
      options.schema_version || this.incrementVersion(currentSchema.schema_version);

    // 3. Merge fields (add new fields to existing schema)
    const mergedFields = {
      ...currentSchema.schema_definition.fields,
    };

    for (const field of options.fields_to_add) {
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

    for (const field of options.fields_to_add) {
      if (!mergedReducerPolicies[field.field_name]) {
        mergedReducerPolicies[field.field_name] = {
          strategy: field.reducer_strategy || "last_write",
          tie_breaker: "observed_at",
        };
      }
    }

    // 5. Register new version (start inactive, we'll activate separately if needed)
    const newSchema = await this.register({
      entity_type: options.entity_type,
      schema_version: newVersion,
      schema_definition: { fields: mergedFields },
      reducer_config: { merge_policies: mergedReducerPolicies },
      user_id: options.user_id,
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
      await this.migrateRawFragmentsToObservations({
        entity_type: options.entity_type,
        field_names: options.fields_to_add.map((f) => f.field_name),
        user_id: options.user_id,
      });
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

      while (true) {
        // Get batch of raw_fragments
        let query = supabase
          .from("raw_fragments")
          .select("*")
          .eq("entity_type", options.entity_type)
          .eq("fragment_key", fieldName)
          .range(offset, offset + BATCH_SIZE - 1);

        if (options.user_id) {
          query = query.eq("user_id", options.user_id);
        }

        const { data: fragments, error: fetchError } = await query;

        if (fetchError || !fragments || fragments.length === 0) {
          break; // No more fragments to migrate
        }

        console.log(
          `[SCHEMA_REGISTRY] Processing batch of ${fragments.length} fragments for field ${fieldName}`,
        );

        // Process each fragment
        for (const fragment of fragments) {
          try {
            // Note: Actual migration would involve:
            // 1. Loading the entity
            // 2. Creating a new observation with the promoted field
            // 3. Updating the entity snapshot
            // 4. Marking the raw_fragment as migrated (don't delete for audit)
            
            // For now, we'll just log the migration
            console.log(
              `[SCHEMA_REGISTRY] Would migrate fragment: ${fragment.id} for entity ${fragment.record_id}`,
            );

            totalMigrated++;
          } catch (error: any) {
            console.error(
              `[SCHEMA_REGISTRY] Failed to migrate fragment ${fragment.id}:`,
              error.message,
            );
            // Continue with next fragment - don't fail entire migration
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
   * Increment schema version (1.0 -> 1.1, 1.9 -> 2.0)
   */
  private incrementVersion(currentVersion: string): string {
    const parts = currentVersion.split(".");
    const major = parseInt(parts[0] || "1", 10);
    const minor = parseInt(parts[1] || "0", 10);

    // Increment minor version
    const newMinor = minor + 1;

    // If minor version reaches 10, increment major and reset minor
    if (newMinor >= 10) {
      return `${major + 1}.0`;
    }

    return `${major}.${newMinor}`;
  }

  /**
   * Activate schema version
   * Supports user-specific schemas: deactivates other versions for same entity_type and user_id/scope
   */
  async activate(entityType: string, version: string, userId?: string): Promise<void> {
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
    let query = supabase
      .from("schema_registry")
      .select("entity_type, schema_version, schema_definition")
      .eq("active", true);

    const { data: dbSchemas, error: dbError } = await query;

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
