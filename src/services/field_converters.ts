/**
 * Field Type Converters for Schema Registry
 *
 * Provides deterministic type conversion functions for schema fields.
 * All converters must be pure functions with no side effects.
 */

export type ConverterFunction = (value: unknown) => unknown;

/**
 * Convert nanosecond timestamp to ISO 8601 date string
 * Handles both number and bigint inputs
 */
export function convertTimestampNanosToIso(value: unknown): string | null {
  if (typeof value !== "number" && typeof value !== "bigint") {
    return null;
  }

  try {
    // Convert nanoseconds to milliseconds
    const nanos = typeof value === "bigint" ? value : BigInt(value);
    const millis = Number(nanos / BigInt(1000000));
    
    // Check for valid timestamp range (year 1970-2100)
    if (millis < 0 || millis > 4102444800000) {
      return null;
    }

    const date = new Date(millis);
    if (isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString();
  } catch (error) {
    return null;
  }
}

/**
 * Convert millisecond timestamp to ISO 8601 date string
 */
export function convertTimestampMsToIso(value: unknown): string | null {
  if (typeof value !== "number") {
    return null;
  }

  try {
    // Check for valid timestamp range (year 1970-2100)
    if (value < 0 || value > 4102444800000) {
      return null;
    }

    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString();
  } catch (error) {
    return null;
  }
}

/**
 * Convert second timestamp to ISO 8601 date string
 */
export function convertTimestampSecondsToIso(value: unknown): string | null {
  if (typeof value !== "number") {
    return null;
  }

  try {
    // Check for valid timestamp range (year 1970-2100)
    if (value < 0 || value > 4102444800) {
      return null;
    }

    const date = new Date(value * 1000);
    if (isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString();
  } catch (error) {
    return null;
  }
}

/**
 * Convert number to string
 */
export function convertNumberToString(value: unknown): string | null {
  if (typeof value !== "number") {
    return null;
  }

  return String(value);
}

/**
 * Convert string to number
 */
export function convertStringToNumber(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const num = parseFloat(value);
  if (isNaN(num)) {
    return null;
  }

  return num;
}

/**
 * Convert boolean to string
 */
export function convertBooleanToString(value: unknown): string | null {
  if (typeof value !== "boolean") {
    return null;
  }

  return value ? "true" : "false";
}

/**
 * Convert string to boolean
 */
export function convertStringToBoolean(value: unknown): boolean | null {
  if (typeof value !== "string") {
    return null;
  }

  const lower = value.toLowerCase().trim();
  if (lower === "true" || lower === "1" || lower === "yes") {
    return true;
  }
  if (lower === "false" || lower === "0" || lower === "no") {
    return false;
  }

  return null;
}

/**
 * Converter function registry
 * Maps converter function names to their implementations
 */
export const CONVERTER_REGISTRY: Record<string, ConverterFunction> = {
  timestamp_nanos_to_iso: convertTimestampNanosToIso,
  timestamp_ms_to_iso: convertTimestampMsToIso,
  timestamp_s_to_iso: convertTimestampSecondsToIso,
  number_to_string: convertNumberToString,
  string_to_number: convertStringToNumber,
  boolean_to_string: convertBooleanToString,
  string_to_boolean: convertStringToBoolean,
};

/**
 * Get converter function by name
 */
export function getConverter(name: string): ConverterFunction | null {
  return CONVERTER_REGISTRY[name] || null;
}

/**
 * Check if converter function exists
 */
export function hasConverter(name: string): boolean {
  return name in CONVERTER_REGISTRY;
}
