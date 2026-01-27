/**
 * Schema Sync Validation Script
 *
 * Ensures that all entity schemas in schema_definitions.ts have complete metadata
 * and that types derived in record_types.ts are in sync with the schemas.
 *
 * Run: tsx scripts/validate-schema-sync.ts
 */

import { ENTITY_SCHEMAS } from "../src/services/schema_definitions.js";
import { listCanonicalRecordTypes } from "../src/config/record_types.js";

interface ValidationError {
  type: "missing_metadata" | "metadata_incomplete" | "field_mismatch" | "type_mismatch";
  entity_type: string;
  message: string;
}

const errors: ValidationError[] = [];

console.log("🔍 Validating schema synchronization...\n");

// Validation 1: All schemas must have metadata
console.log("✓ Checking all schemas have metadata...");
for (const [entityType, schema] of Object.entries(ENTITY_SCHEMAS)) {
  if (!schema.metadata) {
    errors.push({
      type: "missing_metadata",
      entity_type: entityType,
      message: `Schema for '${entityType}' is missing metadata`,
    });
  } else {
    // Validation 2: Metadata must be complete
    const metadata = schema.metadata;
    if (!metadata.label) {
      errors.push({
        type: "metadata_incomplete",
        entity_type: entityType,
        message: `Schema for '${entityType}' has incomplete metadata: missing label`,
      });
    }
    if (!metadata.description) {
      errors.push({
        type: "metadata_incomplete",
        entity_type: entityType,
        message: `Schema for '${entityType}' has incomplete metadata: missing description`,
      });
    }
    if (!metadata.category) {
      errors.push({
        type: "metadata_incomplete",
        entity_type: entityType,
        message: `Schema for '${entityType}' has incomplete metadata: missing category`,
      });
    }

    // Validation 3: primaryProperties (if specified) must match actual field names
    if (metadata.primaryProperties && metadata.primaryProperties.length > 0) {
      const fieldNames = Object.keys(schema.schema_definition.fields);
      for (const prop of metadata.primaryProperties) {
        if (!fieldNames.includes(prop)) {
          errors.push({
            type: "field_mismatch",
            entity_type: entityType,
            message: `Schema for '${entityType}' references non-existent field '${prop}' in primaryProperties`,
          });
        }
      }
    }
  }
}

// Validation 4: Derived record types must match schemas
console.log("✓ Checking derived record types match schemas...");
const recordTypes = listCanonicalRecordTypes();
const schemaEntityTypes = Object.keys(ENTITY_SCHEMAS).filter(
  (key) => ENTITY_SCHEMAS[key].metadata
);

for (const recordType of recordTypes) {
  if (!schemaEntityTypes.includes(recordType.id)) {
    errors.push({
      type: "type_mismatch",
      entity_type: recordType.id,
      message: `Record type '${recordType.id}' exists in derived types but not in schema definitions`,
    });
  }
}

// Report results
console.log("\n📊 Validation Results:\n");

if (errors.length === 0) {
  console.log("✅ All validations passed!");
  console.log(`   - ${Object.keys(ENTITY_SCHEMAS).length} schemas checked`);
  console.log(`   - ${recordTypes.length} record types validated`);
  console.log("\n✨ Schema and types are in sync!\n");
  process.exit(0);
} else {
  console.log(`❌ Found ${errors.length} validation error(s):\n`);

  const errorsByType = {
    missing_metadata: errors.filter((e) => e.type === "missing_metadata"),
    metadata_incomplete: errors.filter((e) => e.type === "metadata_incomplete"),
    field_mismatch: errors.filter((e) => e.type === "field_mismatch"),
    type_mismatch: errors.filter((e) => e.type === "type_mismatch"),
  };

  if (errorsByType.missing_metadata.length > 0) {
    console.log("🚨 Missing Metadata:");
    errorsByType.missing_metadata.forEach((e) => console.log(`   - ${e.message}`));
    console.log("");
  }

  if (errorsByType.metadata_incomplete.length > 0) {
    console.log("⚠️  Incomplete Metadata:");
    errorsByType.metadata_incomplete.forEach((e) => console.log(`   - ${e.message}`));
    console.log("");
  }

  if (errorsByType.field_mismatch.length > 0) {
    console.log("🔧 Field Mismatches:");
    errorsByType.field_mismatch.forEach((e) => console.log(`   - ${e.message}`));
    console.log("");
  }

  if (errorsByType.type_mismatch.length > 0) {
    console.log("🔀 Type Mismatches:");
    errorsByType.type_mismatch.forEach((e) => console.log(`   - ${e.message}`));
    console.log("");
  }

  console.log("❌ Schema validation failed!\n");
  process.exit(1);
}
