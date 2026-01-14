/**
 * Create sample versions of all parquet files with 50 records each
 * 
 * Reads each parquet file, takes first 50 rows, and writes to a sample file
 * Sample files are saved in the same directory with "_sample" suffix
 */

import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const parquetjs = require("parquetjs");

const DATA_DIR = process.env.DATA_DIR || "/Users/markmhendrickson/Documents/data";
const SAMPLE_SIZE = 50;

interface ParquetFile {
  fullPath: string;
  dir: string;
  filename: string;
  samplePath: string;
}

/**
 * Find all parquet files in DATA_DIR
 */
function findParquetFiles(): ParquetFile[] {
  const files: ParquetFile[] = [];
  
  function walkDir(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".parquet")) {
        // Skip sample files and snapshots
        if (entry.name.includes("_sample") || dir.includes("snapshots")) {
          continue;
        }
        
        const filename = entry.name;
        const sampleFilename = filename.replace(".parquet", "_sample.parquet");
        const samplePath = path.join(dir, sampleFilename);
        
        files.push({
          fullPath,
          dir,
          filename,
          samplePath,
        });
      }
    }
  }
  
  walkDir(DATA_DIR);
  return files;
}

/**
 * Create sample parquet file from source file
 */
async function createSampleFile(sourceFile: ParquetFile): Promise<void> {
  try {
    console.log(`Processing: ${sourceFile.filename}`);
    
    // Read source file
    const reader = await parquetjs.ParquetReader.openFile(sourceFile.fullPath);
    const schema = reader.getSchema();
    const cursor = reader.getCursor();
    const rowCount = reader.getRowCount();
    
    // Read first 50 rows (or all if less than 50)
    const sampleSize = Math.min(SAMPLE_SIZE, Number(rowCount));
    const rows: any[] = [];
    
    for (let i = 0; i < sampleSize; i++) {
      const row = await cursor.next();
      if (!row) break;
      rows.push(row);
    }
    
    await reader.close();
    
    if (rows.length === 0) {
      console.log(`  ⚠️  Skipping ${sourceFile.filename}: no rows found`);
      return;
    }
    
    // Write sample file
    const writer = await parquetjs.ParquetWriter.openFile(schema, sourceFile.samplePath);
    
    for (const row of rows) {
      await writer.appendRow(row);
    }
    
    await writer.close();
    
    console.log(`  ✅ Created sample: ${path.basename(sourceFile.samplePath)} (${rows.length} rows)`);
  } catch (error: any) {
    console.error(`  ❌ Error processing ${sourceFile.filename}:`, error.message);
  }
}

/**
 * Main function
 */
async function main() {
  console.log(`Finding parquet files in ${DATA_DIR}...`);
  const files = findParquetFiles();
  
  console.log(`Found ${files.length} parquet files`);
  console.log(`Creating sample files with ${SAMPLE_SIZE} records each...\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const file of files) {
    // Check if sample already exists
    if (fs.existsSync(file.samplePath)) {
      console.log(`⏭️  Skipping ${file.filename}: sample already exists`);
      continue;
    }
    
    await createSampleFile(file);
    successCount++;
  }
  
  console.log(`\n✅ Complete!`);
  console.log(`   Processed: ${files.length} files`);
  console.log(`   Created: ${successCount} sample files`);
  console.log(`   Errors: ${errorCount}`);
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { findParquetFiles, createSampleFile };
