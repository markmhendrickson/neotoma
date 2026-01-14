#!/usr/bin/env npx tsx
/**
 * DATA_DIR Ingestion Script
 * 
 * Ingests all parquet files from DATA_DIR into Neotoma.
 * Uses the MCP store action with automatic schema enhancement.
 * 
 * Usage:
 *   npm run ingest:data-dir
 *   
 *   # Or with specific entity types:
 *   npm run ingest:data-dir -- --entity-types=transactions,tasks
 *   
 *   # Or dry-run mode:
 *   npm run ingest:data-dir -- --dry-run
 */

import { config } from "dotenv";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import { NeotomaServer } from "../src/server.js";

config();

const DATA_DIR = process.env.DATA_DIR || process.env.NEOTOMA_DATA_DIR;

if (!DATA_DIR) {
  console.error("❌ Error: DATA_DIR or NEOTOMA_DATA_DIR not set");
  process.exit(1);
}

// Parse command-line arguments
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const entityTypesArg = args.find(arg => arg.startsWith("--entity-types="));
const filterEntityTypes = entityTypesArg 
  ? entityTypesArg.split("=")[1].split(",") 
  : null;

interface IngestionStats {
  total_directories: number;
  processed_directories: number;
  skipped_directories: number;
  total_files: number;
  processed_files: number;
  failed_files: number;
  total_entities: number;
  entity_types: Record<string, number>;
  errors: Array<{ file: string; error: string }>;
}

const stats: IngestionStats = {
  total_directories: 0,
  processed_directories: 0,
  skipped_directories: 0,
  total_files: 0,
  processed_files: 0,
  failed_files: 0,
  total_entities: 0,
  entity_types: {},
  errors: [],
};

async function findParquetFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      
      if (entry.isFile() && entry.name.endsWith(".parquet")) {
        files.push(fullPath);
      }
    }
  } catch (error: any) {
    console.error(`   Warning: Error reading directory: ${error.message}`);
  }
  
  return files;
}

async function ingestDirectory(server: NeotomaServer, dirPath: string, dirName: string) {
  console.log("\nProcessing: " + dirName);
  
  const parquetFiles = await findParquetFiles(dirPath);
  
  if (parquetFiles.length === 0) {
    console.log("   No parquet files found");
    stats.skipped_directories++;
    return;
  }
  
  console.log("   Found " + parquetFiles.length + " parquet file(s)");
  stats.total_files += parquetFiles.length;
  
  for (const filePath of parquetFiles) {
    const fileName = filePath.split("/").pop() || filePath;
    
    try {
      if (dryRun) {
        console.log("   [DRY RUN] Would ingest: " + fileName);
        stats.processed_files++;
        continue;
      }
      
      console.log("   Ingesting: " + fileName + "...");
      
      // Call MCP store action
      // Note: This is a simplified version - in production, you'd call via MCP protocol
      const result = await (server as any).store({
        user_id: "00000000-0000-0000-0000-000000000000", // System user
        file_path: filePath,
        interpret: false, // Skip interpretation, use structured path only
      });
      
      // Parse result to get entity count
      const resultData = JSON.parse(result.content[0].text);
      const entityCount = resultData.entities_created?.length || 0;
      
      stats.processed_files++;
      stats.total_entities += entityCount;
      
      // Track entity type stats
      if (resultData.entity_type) {
        stats.entity_types[resultData.entity_type] = 
          (stats.entity_types[resultData.entity_type] || 0) + entityCount;
      }
      
      console.log("   SUCCESS: Ingested " + entityCount + " entities");
      
    } catch (error: any) {
      console.error("   ERROR: Failed to ingest " + fileName + ": " + error.message);
      stats.failed_files++;
      stats.errors.push({
        file: filePath,
        error: error.message,
      });
    }
  }
  
  stats.processed_directories++;
}

async function main() {
  console.log("🚀 DATA_DIR Ingestion Starting...\n");
  console.log(`📁 DATA_DIR: ${DATA_DIR}`);
  
  if (dryRun) {
    console.log("🔍 DRY RUN MODE - No data will be ingested\n");
  }
  
  if (filterEntityTypes) {
    console.log(`🔎 Filtering entity types: ${filterEntityTypes.join(", ")}\n");
  }
  
  // Get all entity type directories
  const entries = await readdir(DATA_DIR, { withFileTypes: true });
  const directories = entries
    .filter(entry => entry.isDirectory())
    .filter(entry => !entry.name.startsWith(".")) // Skip hidden directories
    .sort((a, b) => a.name.localeCompare(b.name));
  
  stats.total_directories = directories.length;
  console.log("Found " + stats.total_directories + " entity type directories\n");
  
  // Initialize MCP server (needed for store action)
  const server = new NeotomaServer();
  
  // Process each directory
  for (const dir of directories) {
    // Skip if filtering and not in list
    if (filterEntityTypes && !filterEntityTypes.includes(dir.name)) {
      continue;
    }
    
    const dirPath = join(DATA_DIR, dir.name);
    await ingestDirectory(server, dirPath, dir.name);
  }
  
  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("INGESTION SUMMARY");
  console.log("=".repeat(60));
  console.log("Directories: " + stats.processed_directories + "/" + stats.total_directories + " processed");
  console.log("Files: " + stats.processed_files + "/" + stats.total_files + " processed, " + stats.failed_files + " failed");
  console.log("Entities: " + stats.total_entities + " total");
  
  if (Object.keys(stats.entity_types).length > 0) {
    console.log("\nEntity Types:");
    for (const [entityType, count] of Object.entries(stats.entity_types).sort((a, b) => b[1] - a[1])) {
      console.log("   " + entityType + ": " + count);
    }
  }
  
  if (stats.errors.length > 0) {
    console.log("\nErrors:");
    for (const error of stats.errors) {
      console.log("   " + error.file + ": " + error.error);
    }
  }
  
  console.log("\nIngestion complete!\n");
  
  if (stats.failed_files > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error("\nFatal error:", error.message);
  console.error(error.stack);
  process.exit(1);
});
