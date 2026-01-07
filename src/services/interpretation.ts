// FU-121: Interpretation Service
// Schema validation, entity resolution, and unknown field routing

import { supabase } from "../db.js";
import { schemaRegistry, type SchemaDefinition, type SchemaRegistryEntry } from "./schema_registry.js";
import { resolveEntity } from "./entity_resolution.js";
import { getExpandedSchemaDefinition, getSchemaDefinition } from "./schema_definitions.js";
import { randomUUID } from "crypto";

// Migration compatibility: Resolve table name (interpretations vs interpretation_runs)
let interpretationsTableName: string | null = null;

async function getInterpretationsTableName(): Promise<string> {
  if (interpretationsTableName) {
    return interpretationsTableName;
  }

  // Try interpretations first (new table name)
  const { error: newError } = await supabase.from("interpretations").select("id").limit(1);
  if (!newError || (newError.code !== "PGRST116" && newError.code !== "PGRST205")) {
    interpretationsTableName = "interpretations";
    return interpretationsTableName;
  }

  // Fallback to interpretation_runs (legacy table name)
  const { error: oldError } = await supabase.from("interpretation_runs").select("id").limit(1);
  if (!oldError) {
    interpretationsTableName = "interpretation_runs";
    return interpretationsTableName;
  }

  // Neither exists - use new name (will fail with clearer error)
  interpretationsTableName = "interpretations";
  return interpretationsTableName;
}

export interface InterpretationConfig {
  provider: string;
  model_id: string;
  temperature: number;
  prompt_hash: string;
  code_version: string;
  feature_flags?: Record<string, boolean>;
}

export interface InterpretationOptions {
  userId: string;
  sourceId: string;
  extractedData: Record<string, unknown>[];
  config: InterpretationConfig;
}

export interface InterpretationResult {
  interpretationRunId: string;
  observationsCreated: number;
  unknownFieldsCount: number;
  entities: Array<{
    entityId: string;
    entityType: string;
    observationId: string;
  }>;
}

interface ValidatedField {
  field: string;
  value: unknown;
  valid: boolean;
}

interface EntityData {
  entityType: string;
  fields: Record<string, unknown>;
  observedAt: Date;
  sourcePriority: number;
}

/**
 * Validate extracted data against schema definition
 * Returns: { validFields, unknownFields }
 */
function validateAgainstSchema(
  data: Record<string, unknown>,
  schema: SchemaDefinition
): {
  validFields: Record<string, unknown>;
  unknownFields: Record<string, unknown>;
} {
  const validFields: Record<string, unknown> = {};
  const unknownFields: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const fieldDef = schema.fields[key];
    
    if (!fieldDef) {
      // Unknown field - route to raw_fragments
      unknownFields[key] = value;
      continue;
    }

    // Basic type validation
    let isValid = false;
    switch (fieldDef.type) {
      case "string":
        isValid = typeof value === "string";
        break;
      case "number":
        isValid = typeof value === "number";
        break;
      case "boolean":
        isValid = typeof value === "boolean";
        break;
      case "date":
        isValid = typeof value === "string" || value instanceof Date;
        break;
      case "array":
        isValid = Array.isArray(value);
        break;
      case "object":
        isValid = typeof value === "object" && value !== null && !Array.isArray(value);
        break;
    }

    if (isValid) {
      validFields[key] = value;
    } else {
      // Invalid type - route to raw_fragments
      unknownFields[key] = value;
    }
  }

  return { validFields, unknownFields };
}

/**
 * Run interpretation on extracted data
 * Creates interpretation run, validates fields, resolves entities, creates observations
 */
export async function runInterpretation(
  options: InterpretationOptions
): Promise<InterpretationResult> {
  const { userId, sourceId, extractedData, config } = options;

  // Create interpretation
  const tableName = await getInterpretationsTableName();
  const { data: run, error: runError } = await supabase
    .from(tableName)
    .insert({
      user_id: userId,
      source_id: sourceId,
      interpretation_config: config,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (runError) {
    throw new Error(`Failed to create interpretation run: ${runError.message}`);
  }

  const interpretationRunId = run.id;
  let observationsCreated = 0;
  let unknownFieldsCount = 0;
  const entities: Array<{
    entityId: string;
    entityType: string;
    observationId: string;
  }> = [];

  try {
    // Process each extracted entity
    for (const entityData of extractedData) {
      // Support both 'entity_type' and 'type' fields for entity type identification
      const entityType = (entityData.entity_type as string) || 
                         (entityData.type as string) || 
                         "generic";
      
      // Load active schema for entity type (try database first, then code definitions)
      let schema: SchemaRegistryEntry | null = await schemaRegistry.loadActiveSchema(entityType);
      
      // Fallback to code-defined schemas if database schema not found
      if (!schema) {
        // Try expanded schema first (includes newer fields), then base schema
        const expandedSchema = getExpandedSchemaDefinition(entityType);
        const baseSchema = getSchemaDefinition(entityType);
        const codeSchema = expandedSchema || baseSchema;
        
        if (codeSchema && codeSchema.entity_type && codeSchema.schema_definition && codeSchema.reducer_config) {
          // Convert code schema to SchemaRegistryEntry format
          schema = {
            id: "", // Not needed for validation
            entity_type: codeSchema.entity_type,
            schema_version: codeSchema.schema_version || "1.0",
            schema_definition: codeSchema.schema_definition,
            reducer_config: codeSchema.reducer_config,
            active: true, // Code schemas are considered active
            created_at: new Date().toISOString(),
          };
        }
      }
      
      if (!schema) {
        // No schema found - route all fields to raw_fragments
        const fragmentId = randomUUID();
        await supabase.from("raw_fragments").insert({
          id: fragmentId,
          record_id: null, // No record_id in sources-first architecture
          source_id: sourceId,
          interpretation_id: interpretationRunId,
          user_id: userId,
          fragment_type: entityType,
          fragment_key: "full_entity",
          fragment_value: entityData,
          fragment_envelope: {
            reason: "no_schema",
            entity_type: entityType,
          },
        });
        unknownFieldsCount += Object.keys(entityData).length;
        continue;
      }

      // Exclude entity_type and type from field validation (they're metadata, not schema fields)
      const fieldsToValidate = { ...entityData };
      delete fieldsToValidate.entity_type;
      delete fieldsToValidate.type;

      // Validate fields against schema
      const { validFields, unknownFields } = validateAgainstSchema(
        fieldsToValidate,
        schema.schema_definition
      );

      // Store unknown fields in raw_fragments
      for (const [key, value] of Object.entries(unknownFields)) {
        const fragmentId = randomUUID();
        await supabase.from("raw_fragments").insert({
          id: fragmentId,
          record_id: null,
          source_id: sourceId,
          interpretation_id: interpretationRunId,
          user_id: userId,
          fragment_type: entityType,
          fragment_key: key,
          fragment_value: value,
          fragment_envelope: {
            reason: "unknown_field",
            entity_type: entityType,
            schema_version: schema.schema_version,
          },
        });
        unknownFieldsCount++;
      }

      // Resolve entity (user-scoped)
      const entityId = await resolveEntity({
        entityType,
        fields: validFields,
        userId,
      });

      // Create observation
      const observationId = randomUUID();
      const { error: obsError } = await supabase
        .from("observations")
        .insert({
          id: observationId,
          entity_id: entityId,
          entity_type: entityType,
          schema_version: schema.schema_version,
          source_payload_id: null, // Not using payload_submissions in v0.2.0
          source_id: sourceId,
          interpretation_id: interpretationRunId,
          observed_at: new Date().toISOString(),
          specificity_score: 0.5,
          source_priority: 0, // AI interpretation has priority 0
          fields: validFields,
          user_id: userId,
        });

      if (obsError) {
        throw new Error(`Failed to create observation: ${obsError.message}`);
      }

      observationsCreated++;
      entities.push({
        entityId,
        entityType,
        observationId,
      });
    }

    // Mark interpretation as completed
    const tableNameCompleted = await getInterpretationsTableName();
    await supabase
      .from(tableNameCompleted)
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        observations_created: observationsCreated,
        unknown_fields_count: unknownFieldsCount,
      })
      .eq("id", interpretationRunId);

    return {
      interpretationRunId,
      observationsCreated,
      unknownFieldsCount,
      entities,
    };
  } catch (error) {
    // Mark interpretation as failed
    const tableNameFailed = await getInterpretationsTableName();
    await supabase
      .from(tableNameFailed)
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : String(error),
      })
      .eq("id", interpretationRunId);

    throw error;
  }
}

/**
 * Check interpretation quota (simple hard-coded limit for v0.2.0)
 */
export async function checkInterpretationQuota(
  userId: string,
  limit: number = 100
): Promise<{ allowed: boolean; current: number; limit: number }> {
  // Count interpretation runs in the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const tableNameQuota = await getInterpretationsTableName();
  const { count, error } = await supabase
    .from(tableNameQuota)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", thirtyDaysAgo.toISOString());

  if (error) {
    console.warn(`Failed to check quota: ${error.message}`);
    // Allow on error (fail open)
    return { allowed: true, current: 0, limit };
  }

  const current = count || 0;
  return {
    allowed: current < limit,
    current,
    limit,
  };
}

