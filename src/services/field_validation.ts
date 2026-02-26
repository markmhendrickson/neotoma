/**
 * Field Validation with Type Converter Support
 *
 * Provides shared validation logic for field values with automatic type conversion.
 */

import type { FieldDefinition } from "./schema_registry.js";
import { getConverter } from "./field_converters.js";

export interface ValidationResult {
  /** Converted value (or original if no conversion needed) */
  value: unknown;
  /** Whether the value should be routed to raw_fragments */
  shouldRouteToRawFragments: boolean;
  /** Whether conversion was applied */
  wasConverted: boolean;
  /** Original value before conversion (if converted) */
  originalValue?: unknown;
}

/**
 * Get the JavaScript type of a value
 */
function getValueType(
  value: unknown
): "string" | "number" | "boolean" | "array" | "object" | "null" | "undefined" {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "string"; // Treat Date as string for validation
  return typeof value as "string" | "number" | "boolean" | "object";
}

/**
 * Check if value matches field type
 */
function isValidType(value: unknown, fieldType: FieldDefinition["type"]): boolean {
  switch (fieldType) {
    case "string":
      return typeof value === "string" || value instanceof Date;
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string" || value instanceof Date;
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    default:
      return false;
  }
}

/**
 * Validate field value with converter support
 *
 * @param fieldName - Name of the field being validated
 * @param value - Value to validate
 * @param fieldDef - Field definition from schema
 * @returns Validation result with converted value and routing decision
 */
export function validateFieldWithConverters(
  fieldName: string,
  value: unknown,
  fieldDef: FieldDefinition
): ValidationResult {
  // Check if value matches field type directly
  if (isValidType(value, fieldDef.type)) {
    return {
      value,
      shouldRouteToRawFragments: false,
      wasConverted: false,
    };
  }

  // Value doesn't match type - try converters if defined
  if (!fieldDef.converters || fieldDef.converters.length === 0) {
    // No converters defined - route to raw_fragments
    return {
      value,
      shouldRouteToRawFragments: true,
      wasConverted: false,
    };
  }

  // Try each converter in order
  const valueType = getValueType(value);
  
  for (const converterDef of fieldDef.converters) {
    // Check if converter matches the value's type
    if (converterDef.from !== valueType) {
      continue;
    }

    // Get converter function
    const converterFn = getConverter(converterDef.function);
    if (!converterFn) {
      // Converter function not found - skip
      continue;
    }

    try {
      // Apply converter
      const converted = converterFn(value);
      
      // Check if conversion succeeded and result matches field type
      if (converted !== null && converted !== undefined && isValidType(converted, fieldDef.type)) {
        return {
          value: converted,
          shouldRouteToRawFragments: false,
          wasConverted: true,
          originalValue: value,
        };
      }
    } catch {
      // Converter threw error - skip to next converter
      continue;
    }
  }

  // No converter succeeded - route to raw_fragments
  return {
    value,
    shouldRouteToRawFragments: true,
    wasConverted: false,
  };
}

/**
 * Validate multiple fields against schema with converter support
 *
 * @param data - Object with field values
 * @param fields - Schema field definitions
 * @returns Separated valid fields and unknown fields
 */
export function validateFieldsWithConverters(
  data: Record<string, unknown>,
  fields: Record<string, FieldDefinition>
): {
  validFields: Record<string, unknown>;
  unknownFields: Record<string, unknown>;
  originalValues: Record<string, unknown>; // Original values before conversion
} {
  const validFields: Record<string, unknown> = {};
  const unknownFields: Record<string, unknown> = {};
  const originalValues: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const fieldDef = fields[key];

    if (!fieldDef) {
      // Unknown field - route to raw_fragments
      unknownFields[key] = value;
      continue;
    }

    // Validate with converter support
    const result = validateFieldWithConverters(key, value, fieldDef);

    if (result.shouldRouteToRawFragments) {
      unknownFields[key] = value;
    } else {
      validFields[key] = result.value;
      if (result.wasConverted && result.originalValue !== undefined) {
        originalValues[key] = result.originalValue;
      }
    }
  }

  return { validFields, unknownFields, originalValues };
}
