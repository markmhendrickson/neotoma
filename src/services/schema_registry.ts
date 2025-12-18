/**
 * Schema Registry Service for Schema Registry Service (FU-057)
 *
 * Manages config-driven schema definitions, versions, and merge policies.
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
   * Load active schema for entity type
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
   * Get all schema versions for entity type
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
