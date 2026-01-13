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
  }): Promise<SchemaRegistryEntry> {
    // Validate schema definition
    this.validateSchemaDefinition(config.schema_definition);

    // Validate reducer config
    this.validateReducerConfig(config.reducer_config, config.schema_definition);

    const { data, error } = await supabase
      .from("schema_registry")
      .insert({
        entity_type: config.entity_type,
        schema_version: config.schema_version,
        schema_definition: config.schema_definition,
        reducer_config: config.reducer_config,
        active: false, // New schemas start inactive
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
   */
  async loadActiveSchema(
    entityType: string,
  ): Promise<SchemaRegistryEntry | null> {
    const { data, error } = await supabase
      .from("schema_registry")
      .select("*")
      .eq("entity_type", entityType)
      .eq("active", true)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // Not found
        return null;
      }
      throw new Error(`Failed to load active schema: ${error.message}`);
    }

    return data as SchemaRegistryEntry;
  }

  /**
   * Activate schema version
   */
  async activate(entityType: string, version: string): Promise<void> {
    // Deactivate all other versions for this entity type
    await supabase
      .from("schema_registry")
      .update({ active: false })
      .eq("entity_type", entityType)
      .eq("active", true);

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
