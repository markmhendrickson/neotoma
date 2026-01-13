#!/usr/bin/env node
/**
 * Analyze DATA_DIR Entity Types vs Schema Definitions
 * 
 * Compares entity types found in $DATA_DIR with schemas defined in
 * src/services/schema_definitions.ts to identify missing schemas.
 * 
 * Usage:
 *   node scripts/analyze-data-dir-schemas.js
 */

import { readdir } from "fs/promises";
import { readFile } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { config } from "dotenv";

config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

// Get DATA_DIR from environment
const DATA_DIR = process.env.DATA_DIR || process.env.NEOTOMA_DATA_DIR;

if (!DATA_DIR) {
  console.error("❌ Error: DATA_DIR or NEOTOMA_DATA_DIR not set");
  console.error("   Please set DATA_DIR environment variable");
  process.exit(1);
}

async function getDataDirEntityTypes() {
  try {
    const entries = await readdir(DATA_DIR, { withFileTypes: true });
    const entityTypes = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter(name => !name.startsWith(".") && name !== "README.md")
      .sort();
    return entityTypes;
  } catch (error) {
    console.error(`❌ Error reading DATA_DIR (${DATA_DIR}):`, error.message);
    process.exit(1);
  }
}

async function getSchemaDefinedTypes() {
  try {
    const schemaFile = join(PROJECT_ROOT, "src/services/schema_definitions.ts");
    const content = await readFile(schemaFile, "utf-8");
    
    // Extract entity types from ENTITY_TYPE_SCHEMAS object keys
    // Look for patterns like: "entity_type_name: {" at the top level
    const entityTypePattern = /export const ENTITY_TYPE_SCHEMAS[^}]*?^\s+([a-z_]+):\s*\{/gms;
    const definedTypes = [];
    let match;
    while ((match = entityTypePattern.exec(content)) !== null) {
      definedTypes.push(match[1]);
    }
    
    // Also extract from EXPANDED_ENTITY_TYPE_SCHEMAS
    const expandedPattern = /export const EXPANDED_ENTITY_TYPE_SCHEMAS[^}]*?^\s+([a-z_]+):\s*\{/gms;
    const expandedTypes = [];
    while ((match = expandedPattern.exec(content)) !== null) {
      expandedTypes.push(match[1]);
    }
    
    // Better approach: look for entity_type: "..." patterns
    const entityTypeFieldPattern = /entity_type:\s*"([^"]+)"/g;
    const allEntityTypes = new Set();
    while ((match = entityTypeFieldPattern.exec(content)) !== null) {
      allEntityTypes.add(match[1]);
    }
    
    return Array.from(allEntityTypes).sort();
  } catch (error) {
    console.error(`❌ Error reading schema_definitions.ts:`, error.message);
    process.exit(1);
  }
}

function normalizeEntityType(dirName) {
  // Skip .nosync directories and other non-entity directories
  if (dirName.includes(".nosync") || dirName === "README.md" || dirName.startsWith(".")) {
    return null;
  }
  
  // Handle special cases first
  const specialCases = {
    "crypto_transactions": "crypto_transaction",
    "tax_filings": "tax_filing",
    "fixed_costs": "fixed_cost",
    "asset_types": "asset_type",
    "asset_values": "asset_value",
    "account_identifiers": "account_identifier",
    "bank_certificates": "bank_certificate",
    "email_workflows": "email_workflow",
    "env_var_mappings": "env_var_mapping",
    "equity_units": "equity_unit",
    "financial_strategies": "financial_strategy",
    "property_equipment": "property_equipment",
    "recurring_events": "recurring_event",
    "related_materials": "related_material",
    "task_attachments": "task_attachment",
    "task_comments": "task_comment",
    "task_custom_fields": "task_custom_field",
    "task_dependencies": "task_dependency",
    "task_stories": "task_story",
    "user_accounts": "user_account",
    "payroll_documents": "payroll_document",
    "addresses": "address",
    "companies": "company",
    "liabilities": "liability",
    "properties": "property",
    "people": "person",
    "emails": "email",
    "messages": "message",
    "notes": "note",
    "tasks": "task",
    "projects": "project",
    "goals": "goal",
    "events": "event",
    "exercises": "exercise",
    "workouts": "workout",
    "meals": "meal",
    "foods": "food",
    "movies": "movie",
    "reads": "read",
    "transcriptions": "transcription",
    "investments": "investment",
    "daily_triages": "daily_triage",
    "daily-triage": "daily_triage",
  };
  
  if (specialCases[dirName]) {
    return specialCases[dirName];
  }
  
  // For compound names (with underscores), handle plural on last word
  if (dirName.includes("_")) {
    const parts = dirName.split("_");
    const lastPart = parts[parts.length - 1];
    
    // Handle common plural endings
    if (lastPart.endsWith("ies") && lastPart.length > 3) {
      // e.g., "stories" -> "story"
      parts[parts.length - 1] = lastPart.slice(0, -3) + "y";
    } else if (lastPart.endsWith("es") && lastPart.length > 2) {
      // e.g., "disputes" -> "dispute"
      parts[parts.length - 1] = lastPart.slice(0, -2);
    } else if (lastPart.endsWith("s") && lastPart.length > 1) {
      // e.g., "domains" -> "domain"
      parts[parts.length - 1] = lastPart.slice(0, -1);
    }
    
    return parts.join("_");
  }
  
  // For simple names, handle plural endings
  if (dirName.endsWith("ies") && dirName.length > 3) {
    return dirName.slice(0, -3) + "y";
  } else if (dirName.endsWith("es") && dirName.length > 2) {
    return dirName.slice(0, -2);
  } else if (dirName.endsWith("s") && dirName.length > 1) {
    return dirName.slice(0, -1);
  }
  
  return dirName;
}

async function analyze() {
  console.log("🔍 Analyzing DATA_DIR Entity Types vs Schema Definitions\n");
  console.log(`📁 DATA_DIR: ${DATA_DIR}\n`);

  const dataDirTypes = await getDataDirEntityTypes();
  const schemaDefinedTypes = await getSchemaDefinedTypes();
  
  // Normalize data dir types (handle plurals, etc.)
  const normalizedDataTypes = dataDirTypes
    .map(normalizeEntityType)
    .filter(type => type !== null); // Filter out nulls (skipped directories)
  const uniqueDataTypes = [...new Set(normalizedDataTypes)].sort();
  
  console.log(`📊 Found ${dataDirTypes.length} directories in DATA_DIR`);
  console.log(`📋 Found ${schemaDefinedTypes.length} entity types in schema_definitions.ts\n`);
  
  // Find missing schemas
  const missingSchemas = uniqueDataTypes.filter(
    type => !schemaDefinedTypes.includes(type)
  );
  
  // Find schemas not in DATA_DIR
  const extraSchemas = schemaDefinedTypes.filter(
    type => !uniqueDataTypes.includes(type)
  );
  
  // Find matches
  const matchingTypes = uniqueDataTypes.filter(
    type => schemaDefinedTypes.includes(type)
  );
  
  console.log("=".repeat(60));
  console.log("ANALYSIS RESULTS");
  console.log("=".repeat(60));
  
  console.log(`\n✅ Matching Types (${matchingTypes.length}):`);
  if (matchingTypes.length > 0) {
    matchingTypes.forEach(type => console.log(`   ✓ ${type}`));
  } else {
    console.log("   (none)");
  }
  
  console.log(`\n⚠️  Missing Schemas (${missingSchemas.length}):`);
  if (missingSchemas.length > 0) {
    console.log("   These entity types exist in DATA_DIR but have no schema definition:");
    missingSchemas.forEach(type => {
      const originalDir = dataDirTypes.find(dir => normalizeEntityType(dir) === type);
      console.log(`   - ${type} (from directory: ${originalDir})`);
    });
  } else {
    console.log("   ✓ All DATA_DIR entity types have schemas");
  }
  
  console.log(`\n📝 Extra Schemas (${extraSchemas.length}):`);
  if (extraSchemas.length > 0) {
    console.log("   These schemas are defined but not found in DATA_DIR:");
    extraSchemas.forEach(type => console.log(`   - ${type}`));
  } else {
    console.log("   ✓ All schemas have corresponding DATA_DIR entries");
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total DATA_DIR types: ${uniqueDataTypes.length}`);
  console.log(`Total schema definitions: ${schemaDefinedTypes.length}`);
  console.log(`Matching: ${matchingTypes.length}`);
  console.log(`Missing schemas: ${missingSchemas.length}`);
  console.log(`Extra schemas: ${extraSchemas.length}`);
  
  if (missingSchemas.length > 0) {
    console.log("\n💡 RECOMMENDATION:");
    console.log("   Add schema definitions for missing entity types to");
    console.log("   src/services/schema_definitions.ts");
    console.log("\n   Missing types:");
    missingSchemas.forEach(type => console.log(`     - ${type}`));
  }
  
  console.log("");
}

analyze().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
