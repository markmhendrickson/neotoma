/**
 * Create sample versions of all parquet files with 50 records each
 * 
 * Reads each parquet file, takes first 50 rows, and writes to a sample file
 * Sample files are saved in the same directory with "_sample" suffix
 */

import * as fs from "fs";
import * as path from "path";
import { tableFromIPC, tableFromArrays, tableToIPC } from "apache-arrow";
import { Table as WasmTable, readParquet, writeParquet } from "parquet-wasm";

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

    const parquetBytes = new Uint8Array(fs.readFileSync(sourceFile.fullPath));
    const wasmTable = readParquet(parquetBytes);
    const arrowTable = tableFromIPC(wasmTable.intoIPCStream());
    const rows = arrowTable.toArray() as Array<Record<string, unknown>>;
    wasmTable.drop();

    // Read first 50 rows (or all if fewer)
    const sampledRows = rows.slice(0, SAMPLE_SIZE);
    
    if (sampledRows.length === 0) {
      console.log(`  ⚠️  Skipping ${sourceFile.filename}: no rows found`);
      return;
    }

    const columnNames = Array.from(new Set(sampledRows.flatMap((row) => Object.keys(row))));
    const columns: Record<string, unknown[]> = {};
    for (const columnName of columnNames) {
      columns[columnName] = sampledRows.map((row) => row[columnName] ?? null);
    }

    const sampledArrowTable = tableFromArrays(columns);
    const sampledWasmTable = WasmTable.fromIPCStream(tableToIPC(sampledArrowTable, "stream"));
    const sampledParquetBytes = writeParquet(sampledWasmTable);
    sampledWasmTable.drop();
    fs.writeFileSync(sourceFile.samplePath, sampledParquetBytes);

    console.log(`  ✅ Created sample: ${path.basename(sourceFile.samplePath)} (${sampledRows.length} rows)`);
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

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

export { findParquetFiles, createSampleFile };
