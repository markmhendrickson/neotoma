#!/usr/bin/env npx tsx
/**
 * Test parquet reading with parquet-wasm.
 *
 * Tests reading parquet files from DATA_DIR using parquet-wasm + apache-arrow.
 */

import { config } from "dotenv";
import { tableFromIPC } from "apache-arrow";
import { readParquet } from "parquet-wasm";
import { readFileSync } from "node:fs";

config();

const DATA_DIR = process.env.DATA_DIR || process.env.NEOTOMA_DATA_DIR;

if (!DATA_DIR) {
  console.error("❌ Error: DATA_DIR or NEOTOMA_DATA_DIR not set");
  process.exit(1);
}

async function testParquetWasmReading() {
  try {
    // Test with transactions.parquet  
    const testFile = `${DATA_DIR}/transactions/transactions.parquet`;
    console.log(`\n📊 Testing parquet reading with: ${testFile}\n`);

    console.log("📦 Loading parquet-wasm + apache-arrow...");
    console.log("✅ Libraries loaded");

    console.log("📖 Opening parquet file...");
    const parquetBytes = new Uint8Array(readFileSync(testFile));
    const wasmTable = readParquet(parquetBytes);
    const arrowTable = tableFromIPC(wasmTable.intoIPCStream());
    console.log("✅ File opened successfully");
    
    console.log(`\n📋 Schema Information:`);
    const fieldNames = arrowTable.schema.fields.map((field) => field.name);
    console.log(`   Fields: ${fieldNames.length}`);
    console.log(`   Field names: ${fieldNames.join(", ")}`);
    
    console.log(`\n📈 File Statistics:`);
    console.log(`   Row count: ${arrowTable.numRows}`);
    
    // Read first few rows
    console.log(`\n📄 Sample Rows (first 3):`);
    const rows = arrowTable.toArray() as Array<Record<string, unknown>>;
    for (let i = 0; i < Math.min(3, rows.length); i++) {
      const record = rows[i];
      if (record) {
        console.log(`\n   Row ${i + 1}:`, JSON.stringify(record, null, 2));
      }
    }

    wasmTable.drop();

    console.log(`\n✅ parquet-wasm reading test PASSED!\n`);
    console.log(`Next steps:`);
    console.log(`  1. Extend MCP store action to detect .parquet files`);
    console.log(`  2. Convert parquet rows to entity objects`);
    console.log(`  3. Process through existing structured entities path\n`);
    
  } catch (error: any) {
    console.error(`\n❌ Parquet reading test FAILED:`, error.message);
    console.error(`   Stack:`, error.stack);
    process.exit(1);
  }
}

testParquetWasmReading();
