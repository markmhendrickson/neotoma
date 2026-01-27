/**
 * Schema Inference Service
 *
 * Automatically infers schema definitions from structured data (parquet files, JSON arrays).
 * Used for auto-creating user-specific schemas when no schema exists for an entity type.
 */

import type { SchemaDefinition, ReducerConfig } from "./schema_registry.js";
import { logger } from "../utils/logger.js";

/**
 * Inferred schema result
 */
export interface InferredSchema {
  schemaDefinition: SchemaDefinition;
  reducerConfig: ReducerConfig;
  metadata: {
    field_count: number;
    inferred_types: Record<string, string>;
    confidence: number;
  };
}

/**
 * Infer schema from array of entity objects
 *
 * Samples the first N entities to determine field types and creates a schema definition.
 *
 * @param entities - Array of entity objects
 * @param entityType - Entity type name
 * @param options - Optional configuration (sample size)
 * @returns Inferred schema with definition and reducer config
 */
export async function inferSchemaFromEntities(
  entities: Array<Record<string, unknown>>,
  entityType: string,
  options?: { sampleSize?: number }
): Promise<InferredSchema> {
  if (!entities || entities.length === 0) {
    throw new Error("Cannot infer schema from empty entities array");
  }

  const sampleSize = options?.sampleSize || Math.min(100, entities.length);
  const samples = entities.slice(0, sampleSize);

  // Collect all field names across samples
  const allFields = new Set<string>();
  for (const entity of samples) {
    for (const key of Object.keys(entity)) {
      // Skip entity_type and type metadata fields
      if (key !== "entity_type" && key !== "type") {
        allFields.add(key);
      }
    }
  }

  // Analyze each field to determine type
  const fieldTypes = new Map<string, Map<string, number>>();
  for (const fieldName of allFields) {
    const typeCounts = new Map<string, number>();

    for (const entity of samples) {
      const value = entity[fieldName];
      const inferredType = inferFieldType(value, fieldName);
      typeCounts.set(inferredType, (typeCounts.get(inferredType) || 0) + 1);
    }

    fieldTypes.set(fieldName, typeCounts);
  }

  // Build schema definition
  const fields: Record<
    string,
    {
      type: "string" | "number" | "date" | "boolean" | "array" | "object";
      required: boolean;
    }
  > = {};
  const inferredTypes: Record<string, string> = {};

  for (const fieldName of allFields) {
    const typeCounts = fieldTypes.get(fieldName)!;
    const dominantType = getDominantType(typeCounts);

    fields[fieldName] = {
      type: dominantType as any,
      required: false, // All fields optional by default
    };

    inferredTypes[fieldName] = dominantType;
  }

  // Build reducer config with default policies
  const mergePolicies: Record<string, any> = {};
  for (const fieldName of allFields) {
    mergePolicies[fieldName] = {
      strategy: "last_write",
      tie_breaker: "observed_at",
    };
  }

  // Calculate confidence based on type consistency
  const confidence = calculateTypeConfidence(fieldTypes);

  logger.error(
    `[SCHEMA_INFERENCE] Inferred schema for "${entityType}": ${allFields.size} fields, confidence ${confidence.toFixed(2)}`
  );

  return {
    schemaDefinition: { fields },
    reducerConfig: { merge_policies: mergePolicies },
    metadata: {
      field_count: allFields.size,
      inferred_types: inferredTypes,
      confidence,
    },
  };
}

/**
 * Infer schema from parquet file metadata
 *
 * Extracts type information directly from parquet schema.
 *
 * @param filePath - Path to parquet file
 * @param entityType - Entity type name
 * @returns Inferred schema with definition and reducer config
 */
export async function inferSchemaFromParquet(
  filePath: string,
  entityType: string
): Promise<InferredSchema> {
  try {
    // Dynamic import for CommonJS module
    const parquet = await import("@dsnp/parquetjs");
    const { ParquetReader } = parquet.default || parquet;
    const reader = await ParquetReader.openFile(filePath);

    // Get schema
    const schema = reader.getSchema();
    const fields: Record<
      string,
      {
        type: "string" | "number" | "date" | "boolean" | "array" | "object";
        required: boolean;
      }
    > = {};
    const inferredTypes: Record<string, string> = {};

    // Map parquet types to Neotoma types
    for (const [fieldName, field] of Object.entries(schema.fields)) {
      const parquetType = (field as any).primitiveType || (field as any).type;
      const neotomaType = mapParquetTypeToNeotoma(parquetType, fieldName);

      fields[fieldName] = {
        type: neotomaType,
        required: false, // All fields optional by default
      };

      inferredTypes[fieldName] = neotomaType;
    }

    await reader.close();

    // Build default reducer config
    const mergePolicies: Record<string, any> = {};
    for (const fieldName of Object.keys(fields)) {
      mergePolicies[fieldName] = {
        strategy: "last_write",
        tie_breaker: "observed_at",
      };
    }

    logger.error(
      `[SCHEMA_INFERENCE] Inferred schema from parquet for "${entityType}": ${Object.keys(fields).length} fields`
    );

    return {
      schemaDefinition: { fields },
      reducerConfig: { merge_policies: mergePolicies },
      metadata: {
        field_count: Object.keys(fields).length,
        inferred_types: inferredTypes,
        confidence: 1.0, // High confidence from parquet schema
      },
    };
  } catch (error: any) {
    throw new Error(`Failed to infer schema from parquet: ${error.message}`);
  }
}

/**
 * Map parquet primitive type to Neotoma field type
 */
function mapParquetTypeToNeotoma(
  parquetType: string,
  fieldName: string
): "string" | "number" | "date" | "boolean" | "array" | "object" {
  const typeLower = parquetType?.toLowerCase() || "";

  // Numeric types
  if (
    typeLower.includes("int") ||
    typeLower.includes("float") ||
    typeLower.includes("double") ||
    typeLower.includes("decimal")
  ) {
    // Check if field name suggests it's a date (timestamp)
    if (isDateFieldName(fieldName)) {
      return "date";
    }
    return "number";
  }

  // String types
  if (
    typeLower.includes("string") ||
    typeLower.includes("utf8") ||
    typeLower.includes("byte_array")
  ) {
    // Check if field name suggests it's a date
    if (isDateFieldName(fieldName)) {
      return "date";
    }
    return "string";
  }

  // Boolean
  if (typeLower.includes("bool")) {
    return "boolean";
  }

  // Date/Time
  if (typeLower.includes("timestamp") || typeLower.includes("date")) {
    return "date";
  }

  // List/Array
  if (typeLower.includes("list") || typeLower.includes("array")) {
    return "array";
  }

  // Struct/Object
  if (typeLower.includes("struct") || typeLower.includes("map")) {
    return "object";
  }

  // Default to string
  return "string";
}

/**
 * Check if field name suggests it contains date/time data
 */
function isDateFieldName(fieldName: string): boolean {
  const lower = fieldName.toLowerCase();
  return (
    lower.endsWith("_date") ||
    lower.endsWith("_at") ||
    lower.endsWith("_time") ||
    lower.includes("timestamp") ||
    lower === "date" ||
    lower === "time" ||
    lower === "created" ||
    lower === "updated" ||
    lower === "deleted"
  );
}

/**
 * Infer field type from a single value
 */
function inferFieldType(
  value: unknown,
  fieldName: string
): "string" | "number" | "date" | "boolean" | "array" | "object" | "null" {
  if (value === null || value === undefined) {
    return "null";
  }

  // Obvious types
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object" && !(value instanceof Date)) return "object";

  // Number analysis
  if (typeof value === "number") {
    // Check if it's a timestamp
    if (isDateFieldName(fieldName)) {
      return "date";
    }
    // Check if value magnitude suggests timestamp
    if (value > 1000000000 && value < 1e19) {
      return "date";
    }
    return "number";
  }

  // String analysis
  if (typeof value === "string") {
    const str = value.trim();

    // ISO 8601 date detection
    if (isISODate(str)) return "date";

    // Boolean string
    if (isBooleanString(str)) return "boolean";

    // Numeric string (but check for IDs first)
    if (isNumericString(str)) {
      // Keep as string if it looks like an ID (long or leading zeros)
      if (str.length > 10 || /^0+/.test(str)) {
        return "string";
      }
      return "number";
    }

    return "string";
  }

  return "string";
}

/**
 * Get dominant type from type counts (excluding null)
 */
function getDominantType(typeCounts: Map<string, number>): string {
  let dominantType = "string";
  let maxCount = 0;

  for (const [type, count] of typeCounts.entries()) {
    if (type === "null") continue; // Skip null
    if (count > maxCount) {
      maxCount = count;
      dominantType = type;
    }
  }

  return dominantType;
}

/**
 * Calculate overall confidence based on type consistency across samples
 */
function calculateTypeConfidence(
  fieldTypes: Map<string, Map<string, number>>
): number {
  let totalConsistency = 0;
  let fieldCount = 0;

  for (const typeCounts of fieldTypes.values()) {
    const totalSamples = Array.from(typeCounts.values()).reduce(
      (sum, count) => sum + count,
      0
    );
    const dominantCount = Math.max(...Array.from(typeCounts.values()));

    // Calculate consistency for this field (excluding null from denominator)
    const nonNullSamples = totalSamples - (typeCounts.get("null") || 0);
    const consistency =
      nonNullSamples > 0 ? dominantCount / nonNullSamples : 0;

    totalConsistency += consistency;
    fieldCount++;
  }

  return fieldCount > 0 ? totalConsistency / fieldCount : 0;
}

/**
 * Check if string is ISO 8601 date
 */
function isISODate(str: string): boolean {
  if (str.length < 10) return false;
  const date = new Date(str);
  return !isNaN(date.getTime()) && str.includes("-");
}

/**
 * Check if string is boolean
 */
function isBooleanString(str: string): boolean {
  const lower = str.toLowerCase();
  return (
    lower === "true" ||
    lower === "false" ||
    lower === "yes" ||
    lower === "no" ||
    lower === "1" ||
    lower === "0"
  );
}

/**
 * Check if string is numeric
 */
function isNumericString(str: string): boolean {
  if (str === "") return false;
  const num = parseFloat(str);
  return !isNaN(num) && isFinite(num);
}
