/**
 * Field Canonicalization Service
 * 
 * Canonicalizes validated fields to ensure same semantic content produces same canonical form.
 * This is the core of the idempotence pattern - enforcing determinism post-generation.
 */

import type { SchemaDefinition } from "./schema_registry.js";

export interface CanonicalizationOptions {
  preserveCase?: boolean; // Don't lowercase strings (default: false)
  dateFormat?: "iso" | "date-only"; // Date format (default: "iso")
  numberPrecision?: number; // Decimal places for numbers (default: 2)
}

/**
 * Heuristic patterns for fields that should preserve case
 * Used as fallback when field definition doesn't specify preserveCase
 */
const PRESERVE_CASE_PATTERNS = [
  /_name$/,           // Fields ending in _name (e.g., vendor_name, company_name)
  /_title$/,          // Fields ending in _title
  /^title$/,         // Exact match: title
  /^name$/,          // Exact match: name
  /^subject$/,       // Exact match: subject
  /^address$/,       // Exact match: address
  /^city$/,          // Exact match: city
  /^state$/,         // Exact match: state
  /^country$/,       // Exact match: country
  /^location$/,      // Exact match: location
  /^venue$/,         // Exact match: venue
  /^brand$/,         // Exact match: brand
  /^tagline$/,       // Exact match: tagline
  /^slogan$/,        // Exact match: slogan
];

/**
 * Fields that should preserve case (text-heavy content fields and fields where capitalization matters)
 * These fields contain prose, documents, names, titles, addresses, or other content where capitalization is meaningful
 * Used as fallback when field definition doesn't specify preserveCase and heuristics don't match
 */
const PRESERVE_CASE_FIELDS = new Set([
  // Content fields (prose, documents)
  "content",
  "body",
  "notes",
  "summary",
  "description",
  "text",
  "message",
  "comment",
  "transcript",
  "abstract",
  "full_text",
  "article",
  "essay",
  "paper",
  "document",
  
  // Titles and subjects
  "title",
  "subject",
  "headline",
  
  // Names (people, companies, products)
  "name",
  "first_name",
  "last_name",
  "full_name",
  "display_name",
  "company_name",
  "vendor_name",
  "customer_name",
  "merchant_name",
  "counterparty",
  "legal_name",
  "product_name",
  "item_name",
  "brand",
  "manufacturer",
  "organization",
  "institution",
  
  // Addresses and locations
  "address",
  "street",
  "street_address",
  "city",
  "state",
  "province",
  "country",
  "location",
  "place",
  "venue",
  
  // Other fields where capitalization matters
  "tagline",
  "slogan",
  "website",
  "domain",
]);

/**
 * Canonicalize fields based on schema definition
 * Ensures same semantic content produces same canonical form
 * 
 * Case Preservation Priority (for string fields):
 * 1. Global preserveCase option (explicit override)
 * 2. Field definition metadata (preserveCase: true in schema) - RECOMMENDED for new fields
 * 3. Hardcoded PRESERVE_CASE_FIELDS list (backward compatibility)
 * 4. Heuristic patterns (automatic detection for common naming patterns)
 * 
 * To preserve case for new fields in schemas:
 * - Add preserveCase: true to the field definition in schema_registry
 * - Or rely on heuristics (fields ending in _name, _title, etc. are auto-detected)
 * - Or add to PRESERVE_CASE_FIELDS list for exact matches
 */
export function canonicalizeFields(
  fields: Record<string, unknown>,
  schema: SchemaDefinition,
  options: CanonicalizationOptions = {}
): Record<string, unknown> {
  const canonical: Record<string, unknown> = {};
  
  // Sort keys alphabetically for consistent output
  const sortedKeys = Object.keys(fields).sort();
  
  for (const key of sortedKeys) {
    const value = fields[key];
    const fieldDef = schema.fields[key];
    
    if (!fieldDef) {
      // Unknown field - should not happen after validation, but handle it
      continue;
    }
    
    // Determine if this field should preserve case
    // Priority order:
    // 1. Explicit preserveCase option (global override)
    // 2. Field definition metadata (preserveCase in schema) - highest priority for schema-driven decisions
    // 3. Hardcoded list (known fields) - backward compatibility
    // 4. Heuristic patterns (common naming patterns) - automatic detection for new fields
    let shouldPreserveCase = options.preserveCase;
    
    if (!shouldPreserveCase) {
      // Check field definition metadata first (schema-driven, most explicit)
      if (fieldDef.preserveCase !== undefined) {
        shouldPreserveCase = fieldDef.preserveCase;
      }
      // Then check hardcoded list (backward compatibility)
      else if (PRESERVE_CASE_FIELDS.has(key)) {
        shouldPreserveCase = true;
      }
      // Finally check heuristic patterns (automatic detection for new fields)
      else {
        shouldPreserveCase = PRESERVE_CASE_PATTERNS.some(pattern => pattern.test(key));
      }
    }
    
    const fieldOptions = { ...options, preserveCase: shouldPreserveCase };
    
    // Canonicalize based on field type
    canonical[key] = canonicalizeValue(value, fieldDef.type, fieldOptions);
  }
  
  return canonical;
}

/**
 * Canonicalize a single value based on its type
 */
function canonicalizeValue(
  value: unknown,
  type: string,
  options: CanonicalizationOptions
): unknown {
  // Handle null/undefined consistently
  if (value === null || value === undefined) {
    return null;
  }
  
  switch (type) {
    case "string":
      return canonicalizeString(value, options);
    
    case "number":
      return canonicalizeNumber(value, options);
    
    case "date":
      return canonicalizeDate(value, options);
    
    case "boolean":
      return Boolean(value);
    
    case "array":
      return canonicalizeArray(value, options);
    
    case "object":
      return canonicalizeObject(value, options);
    
    default:
      return value;
  }
}

/**
 * Canonicalize string value
 */
function canonicalizeString(
  value: unknown,
  options: CanonicalizationOptions
): string {
  if (typeof value !== "string") {
    return String(value);
  }
  
  let normalized = value;
  
  // Trim whitespace
  normalized = normalized.trim();
  
  // Normalize line endings
  normalized = normalized.replace(/\r\n/g, "\n");
  
  // Normalize multiple spaces to single space
  normalized = normalized.replace(/\s+/g, " ");
  
  // Remove trailing spaces
  normalized = normalized.trimEnd();
  
  // Lowercase (unless preserveCase is true)
  if (!options.preserveCase) {
    normalized = normalized.toLowerCase();
  }
  
  return normalized;
}

/**
 * Canonicalize number value
 */
function canonicalizeNumber(
  value: unknown,
  options: CanonicalizationOptions
): number {
  if (typeof value !== "number") {
    const parsed = Number(value);
    if (isNaN(parsed)) {
      return 0;
    }
    return parsed;
  }
  
  const precision = options.numberPrecision ?? 2;
  
  // Round to specified precision
  const rounded = Math.round(value * Math.pow(10, precision)) / Math.pow(10, precision);
  
  return rounded;
}

/**
 * Canonicalize date value
 */
function canonicalizeDate(
  value: unknown,
  options: CanonicalizationOptions
): string {
  let date: Date;
  
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string") {
    date = new Date(value);
  } else {
    // Invalid date - return ISO string of epoch
    return new Date(0).toISOString();
  }
  
  // Check if date is valid
  if (isNaN(date.getTime())) {
    return new Date(0).toISOString();
  }
  
  const format = options.dateFormat ?? "iso";
  
  if (format === "date-only") {
    // Return date-only (YYYY-MM-DD)
    return date.toISOString().split("T")[0];
  }
  
  // Return full ISO 8601 timestamp (UTC)
  return date.toISOString();
}

/**
 * Canonicalize array value
 */
function canonicalizeArray(
  value: unknown,
  options: CanonicalizationOptions
): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }
  
  // Canonicalize each item recursively
  const canonicalized = value.map((item) => {
    if (typeof item === "string") {
      return canonicalizeString(item, options);
    } else if (typeof item === "number") {
      return canonicalizeNumber(item, options);
    } else if (item instanceof Date || (typeof item === "string" && !isNaN(Date.parse(item)))) {
      return canonicalizeDate(item, options);
    } else if (typeof item === "object" && item !== null && !Array.isArray(item)) {
      return canonicalizeObject(item, options);
    } else if (Array.isArray(item)) {
      return canonicalizeArray(item, options);
    }
    return item;
  });
  
  // Sort array by deterministic key
  return sortArray(canonicalized);
}

/**
 * Sort array by deterministic key
 */
function sortArray(arr: unknown[]): unknown[] {
  return arr.sort((a, b) => {
    // Sort by JSON stringification for consistent ordering
    const aStr = JSON.stringify(a);
    const bStr = JSON.stringify(b);
    return aStr.localeCompare(bStr);
  });
}

/**
 * Canonicalize object value
 */
function canonicalizeObject(
  value: unknown,
  options: CanonicalizationOptions
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  
  const obj = value as Record<string, unknown>;
  const canonical: Record<string, unknown> = {};
  
  // Sort keys alphabetically
  const sortedKeys = Object.keys(obj).sort();
  
  for (const key of sortedKeys) {
    const val = obj[key];
    
    // Skip null/undefined
    if (val === null || val === undefined) {
      canonical[key] = null;
      continue;
    }
    
    // Recursively canonicalize based on type
    if (typeof val === "string") {
      canonical[key] = canonicalizeString(val, options);
    } else if (typeof val === "number") {
      canonical[key] = canonicalizeNumber(val, options);
    } else if (val instanceof Date || (typeof val === "string" && !isNaN(Date.parse(val)))) {
      canonical[key] = canonicalizeDate(val, options);
    } else if (Array.isArray(val)) {
      canonical[key] = canonicalizeArray(val, options);
    } else if (typeof val === "object") {
      canonical[key] = canonicalizeObject(val, options);
    } else {
      canonical[key] = val;
    }
  }
  
  return canonical;
}

/**
 * Compute hash of canonical fields (for fixed-point convergence)
 */
export function hashCanonicalFields(canonicalFields: Record<string, unknown>): string {
  const { createHash } = require("crypto");
  const hash = createHash("sha256")
    .update(JSON.stringify(canonicalFields))
    .digest("hex");
  return hash;
}
