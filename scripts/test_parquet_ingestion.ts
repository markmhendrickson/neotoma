#!/usr/bin/env npx tsx
/**
 * Test Parquet Ingestion
 * 
 * Quick test to verify parquet file ingestion works correctly.
 */

import { config } from "dotenv";
import { readParquetFile } from "../src/services/parquet_reader.js";

config();

const DATA_DIR = process.env.DATA_DIR || process.env.NEOTOMA_DATA_DIR;

if (!DATA_DIR) {
  console.error("❌ Error: DATA_DIR or NEOTOMA_DATA_DIR not set");
  process.exit(1);
}

async function testParquetIngestion() {
  try {
    // Test with accounts.parquet (small file)
    const testFile = `${DATA_DIR}/accounts/accounts.parquet`;
    console.log(`\n📊 Testing parquet ingestion with: ${testFile}\n`);

    // Read parquet file
    console.log("📖 Reading parquet file...");
    const result = await readParquetFile(testFile);
    
    console.log("✅ Successfully read parquet file!");
    console.log(`\n📋 Metadata:`);
    console.log(`   Entity type: ${result.metadata.entity_type}`);
    console.log(`   Row count: ${result.metadata.row_count}`);
    console.log(`   Field count: ${result.metadata.field_count}`);
    console.log(`   Fields: ${result.metadata.field_names.join(", ")}`);
    
    console.log(`\n📄 Sample Entities (first 3):`);
    for (let i = 0; i < Math.min(3, result.entities.length); i++) {
      console.log(`\n   Entity ${i + 1}:`, JSON.stringify(result.entities[i], null, 2));
    }
    
    console.log(`\n✅ Parquet ingestion test PASSED!\n`);
    console.log(`Next: Test with MCP store action\n`);
    
  } catch (error: any) {
    console.error(`\n❌ Parquet ingestion test FAILED:`, error.message);
    console.error(`   Stack:`, error.stack);
    process.exit(1);
  }
}

testParquetIngestion();
