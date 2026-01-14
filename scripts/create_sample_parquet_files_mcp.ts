/**
 * Create sample versions of all parquet files with 50 records each
 * Uses MCP parquet server to read files (which handles edge cases better)
 */

import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

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
    try {
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
    } catch (error: any) {
      // Skip directories we can't read
      console.error(`Error reading directory ${dir}: ${error.message}`);
    }
  }
  
  walkDir(DATA_DIR);
  return files;
}

/**
 * Create sample parquet file using Python with pandas
 * This is simpler and more reliable than trying to use Node.js parquet libraries
 */
async function createSampleFile(sourceFile: ParquetFile): Promise<boolean> {
  return new Promise((resolve) => {
    const pythonScript = `
import pandas as pd
import sys
import os

source_path = "${sourceFile.fullPath}"
sample_path = "${sourceFile.samplePath}"

try:
    # Check file size
    file_size_mb = os.path.getsize(source_path) / (1024 * 1024)
    if file_size_mb > 100:
        print(f"SKIP: File too large ({file_size_mb:.1f} MB)", file=sys.stderr)
        sys.exit(1)
    
    # Read parquet file
    df = pd.read_parquet(source_path, engine='pyarrow')
    
    # Take first 50 rows
    sample_size = min(${SAMPLE_SIZE}, len(df))
    df_sample = df.head(sample_size)
    
    if len(df_sample) == 0:
        print("SKIP: No rows found", file=sys.stderr)
        sys.exit(1)
    
    # Write sample file
    df_sample.to_parquet(sample_path, index=False, engine='pyarrow')
    print(f"SUCCESS: {len(df_sample)} rows")
    sys.exit(0)
except Exception as e:
    print(f"ERROR: {str(e)}", file=sys.stderr)
    sys.exit(1)
`;

    const python = spawn("python3", ["-c", pythonScript]);
    let stdout = "";
    let stderr = "";

    python.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    python.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    python.on("close", (code) => {
      if (code === 0) {
        console.log(`  ✅ Created sample: ${path.basename(sourceFile.samplePath)} ${stdout.trim()}`);
        resolve(true);
      } else {
        const errorMsg = stderr.trim() || stdout.trim();
        if (errorMsg.includes("SKIP:")) {
          console.log(`  ⚠️  ${errorMsg.replace("SKIP: ", "")}`);
        } else {
          console.error(`  ❌ Error: ${errorMsg.replace("ERROR: ", "")}`);
        }
        resolve(false);
      }
    });

    // Timeout after 10 seconds per file
    setTimeout(() => {
      python.kill();
      console.error(`  ❌ Timeout processing ${sourceFile.filename}`);
      resolve(false);
    }, 10000);
  });
}

/**
 * Main function
 */
async function main() {
  const maxFiles = process.argv[2] ? parseInt(process.argv[2]) : undefined;
  
  console.log(`Finding parquet files in ${DATA_DIR}...`);
  let files = findParquetFiles();
  
  if (maxFiles) {
    files = files.slice(0, maxFiles);
    console.log(`Limiting to first ${maxFiles} files for testing...`);
  }
  
  console.log(`Found ${files.length} parquet files`);
  console.log(`Creating sample files with ${SAMPLE_SIZE} records each...\n`);
  
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    // Check if sample already exists
    if (fs.existsSync(file.samplePath)) {
      console.log(`[${i + 1}/${files.length}] ⏭️  Skipping ${file.filename}: sample already exists`);
      skipCount++;
      continue;
    }
    
    console.log(`[${i + 1}/${files.length}] Processing: ${file.filename}`);
    const success = await createSampleFile(file);
    
    if (success) {
      successCount++;
    } else {
      errorCount++;
    }
  }
  
  console.log(`\n✅ Complete!`);
  console.log(`   Processed: ${files.length} files`);
  console.log(`   Created: ${successCount} sample files`);
  console.log(`   Skipped: ${skipCount} (already exist)`);
  console.log(`   Errors: ${errorCount}`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { findParquetFiles, createSampleFile };
