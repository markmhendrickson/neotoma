#!/usr/bin/env tsx

/**
 * Export Schema Snapshots
 *
 * Exports all schema versions to docs/subsystems/schema_snapshots/ for public reference.
 * 
 * Sources:
 * 1. Latest schemas from schema_definitions.ts (source of truth for current code)
 * 2. Historic versions from schema_registry database table (all past versions)
 * 
 * The export merges both sources:
 * - Latest versions use definitions from code (authoritative)
 * - Historic versions are preserved from database (for reference)
 * - Database metadata (active status, created_at) is merged into code schemas
 *
 * Usage:
 *   npm run schema:export
 *   tsx scripts/export_schema_snapshots.ts
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  RECORD_TYPE_SCHEMAS,
  EXPANDED_RECORD_TYPE_SCHEMAS,
} from "../src/services/schema_definitions.js";
import { supabase } from "../src/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_DIR = join(__dirname, "../docs/subsystems/schema_snapshots");

interface SchemaSnapshot {
  entity_type: string;
  schema_version: string;
  active: boolean;
  created_at: string;
  schema_definition: {
    fields: Record<
      string,
      {
        type: string;
        required?: boolean;
        validator?: string;
        description?: string;
      }
    >;
  };
  reducer_config: {
    merge_policies: Record<
      string,
      {
        strategy: string;
        tie_breaker?: string;
      }
    >;
  };
}

async function ensureDir(path: string): Promise<void> {
  try {
    await mkdir(path, { recursive: true });
  } catch (error: any) {
    if (error.code !== "EEXIST") {
      throw error;
    }
  }
}

async function getAllSchemas(): Promise<SchemaSnapshot[]> {
  const schemas: SchemaSnapshot[] = [];
  const schemaMap = new Map<string, SchemaSnapshot>();

  // 1. Get latest schemas from code definitions (source of truth for current)
  for (const schema of Object.values(RECORD_TYPE_SCHEMAS)) {
    const snapshot: SchemaSnapshot = {
      entity_type: schema.entity_type,
      schema_version: schema.schema_version,
      active: false, // Will check database for active status
      created_at: new Date().toISOString(), // Fallback, will be updated from DB if available
      schema_definition: schema.schema_definition,
      reducer_config: schema.reducer_config,
    };
    schemas.push(snapshot);
    // Use composite key for lookup: entity_type + schema_version
    schemaMap.set(`${schema.entity_type}:${schema.schema_version}`, snapshot);
  }

  // Add expanded schemas (partial schemas that extend existing types)
  for (const schema of Object.values(EXPANDED_RECORD_TYPE_SCHEMAS)) {
    if (schema.entity_type && schema.schema_definition && schema.reducer_config) {
      const version = schema.schema_version || "1.0";
      const key = `${schema.entity_type}:${version}`;
      
      // Only add if not already present
      if (!schemaMap.has(key)) {
        const snapshot: SchemaSnapshot = {
          entity_type: schema.entity_type,
          schema_version: version,
          active: false,
          created_at: new Date().toISOString(),
          schema_definition: schema.schema_definition,
          reducer_config: schema.reducer_config,
        };
        schemas.push(snapshot);
        schemaMap.set(key, snapshot);
      }
    }
  }

  // 2. Get ALL versions from database (including historic)
  try {
    const { data: dbSchemas, error } = await supabase
      .from("schema_registry")
      .select("*")
      .order("entity_type", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    if (dbSchemas && dbSchemas.length > 0) {
      for (const dbSchema of dbSchemas) {
        const key = `${dbSchema.entity_type}:${dbSchema.schema_version}`;
        const existingSchema = schemaMap.get(key);

        if (existingSchema) {
          // Schema exists in code - update metadata from database
          existingSchema.active = dbSchema.active;
          existingSchema.created_at = dbSchema.created_at;
        } else {
          // Historic version not in code - add from database
          const historicSnapshot: SchemaSnapshot = {
            entity_type: dbSchema.entity_type,
            schema_version: dbSchema.schema_version,
            active: dbSchema.active,
            created_at: dbSchema.created_at,
            schema_definition: dbSchema.schema_definition,
            reducer_config: dbSchema.reducer_config,
          };
          schemas.push(historicSnapshot);
          schemaMap.set(key, historicSnapshot);
        }
      }
    }
  } catch (error) {
    // If database is unavailable, use code definitions only
    console.warn(
      `Could not fetch schema metadata from database: ${error instanceof Error ? error.message : String(error)}`
    );
    console.warn("Using code definitions only (no historic versions)");
  }

  return schemas;
}

export async function exportSnapshots(): Promise<void> {
  const schemas = await getAllSchemas();

  if (schemas.length === 0) {
    if (process.env.NODE_ENV !== "test") {
      console.log("No schemas found in schema_definitions.ts.");
    }
    return;
  }

  // Only print header if running directly (not when called from schema registry)
  if (process.argv[1]?.includes("export_schema_snapshots")) {
    console.log("Exporting schema snapshots from schema_definitions.ts...\n");
  }

  // Group by entity_type
  const byEntityType = new Map<string, SchemaSnapshot[]>();
  for (const schema of schemas) {
    const existing = byEntityType.get(schema.entity_type) || [];
    existing.push(schema);
    byEntityType.set(schema.entity_type, existing);
  }

  // Create entity type directories and write files
  let exportedCount = 0;
  for (const [entityType, versions] of byEntityType.entries()) {
    const entityDir = join(SNAPSHOTS_DIR, entityType);
    await ensureDir(entityDir);

    for (const schema of versions) {
      const filename = `v${schema.schema_version}.json`;
      const filepath = join(entityDir, filename);

      // Format JSON with 2-space indentation
      const content = JSON.stringify(schema, null, 2) + "\n";

      await writeFile(filepath, content, "utf-8");
      console.log(
        `  ✓ ${entityType}/v${schema.schema_version}.json ${
          schema.active ? "(active)" : ""
        }`
      );
      exportedCount++;
    }
  }

  // Update README changelog
  await updateReadmeChangelog(schemas);

  console.log(`\nExported ${exportedCount} schema snapshot(s) across ${byEntityType.size} entity type(s).`);
}

async function updateReadmeChangelog(schemas: SchemaSnapshot[]): Promise<void> {
  const readmePath = join(SNAPSHOTS_DIR, "README.md");
  let readmeContent = await readFile(readmePath, "utf-8");

  // Generate changelog
  const byEntityType = new Map<string, SchemaSnapshot[]>();
  for (const schema of schemas) {
    const existing = byEntityType.get(schema.entity_type) || [];
    existing.push(schema);
    byEntityType.set(schema.entity_type, existing);
  }

  const changelogLines: string[] = [];
  changelogLines.push("## Changelog");
  changelogLines.push("");
  changelogLines.push("<!-- Auto-generated by export script -->");
  changelogLines.push(`_Last updated: ${new Date().toISOString()}_`);
  changelogLines.push("");

  for (const [entityType, versions] of Array.from(byEntityType.entries()).sort()) {
    changelogLines.push(`### ${entityType}`);
    for (const schema of versions.sort((a, b) => 
      a.schema_version.localeCompare(b.schema_version)
    )) {
      const activeBadge = schema.active ? " **(active)**" : "";
      changelogLines.push(
        `- **v${schema.schema_version}**${activeBadge}: ${schema.created_at.split("T")[0]}`
      );
    }
    changelogLines.push("");
  }

  // Replace changelog section
  const changelogStart = readmeContent.indexOf("## Changelog");
  if (changelogStart !== -1) {
    const beforeChangelog = readmeContent.substring(0, changelogStart);
    readmeContent = beforeChangelog + changelogLines.join("\n");
  } else {
    // Append if not found
    readmeContent = readmeContent.trim() + "\n\n" + changelogLines.join("\n") + "\n";
  }

  await writeFile(readmePath, readmeContent, "utf-8");
}

// Only run if called directly via tsx/node (not when imported)
// When spawned as a child process, this will execute the export function
if (!import.meta.url.includes("node_modules")) {
  // Check if we're being run directly (not imported)
  const scriptName = fileURLToPath(import.meta.url);
  const isDirectExecution = process.argv[1] === scriptName || 
                            process.argv[1]?.includes("export_schema_snapshots");
  
  if (isDirectExecution) {
    exportSnapshots()
      .then(() => {
        console.log("Schema snapshots exported successfully.");
      })
      .catch((error) => {
        console.error("Error exporting schema snapshots:", error);
        process.exit(1);
      });
  }
}

