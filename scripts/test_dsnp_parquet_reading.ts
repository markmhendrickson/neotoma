#!/usr/bin/env npx tsx
/**
 * Test Parquet Reading with @dsnp/parquetjs
 * 
 * Tests reading parquet files from DATA_DIR using @dsnp/parquetjs (updated fork).
 */

import { config } from "dotenv";

config();

const DATA_DIR = process.env.DATA_DIR || process.env.NEOTOMA_DATA_DIR;

if (!DATA_DIR) {
  console.error("❌ Error: DATA_DIR or NEOTOMA_DATA_DIR not set");
  process.exit(1);
}

async function testDsnpParquetReading() {
  try {
    // Test with transactions.parquet  
    const testFile = `${DATA_DIR}/transactions/transactions.parquet`;
    console.log(`\n📊 Testing parquet reading with: ${testFile}\n`);

    // Import the library
    console.log("📦 Loading @dsnp/parquetjs...");
    const parquet = await import("@dsnp/parquetjs");
    console.log("✅ Library loaded");
    
    // Open the parquet file
    console.log("📖 Opening parquet file...");
    const { ParquetReader } = parquet.default || parquet;
    const reader = await ParquetReader.openFile(testFile);
    console.log("✅ File opened successfully");
    
    // Get metadata
    const schema = reader.getSchema();
    
    console.log(`\n📋 Schema Information:`);
    console.log(`   Fields: ${Object.keys(schema.fields).length}`);
    console.log(`   Field names: ${Object.keys(schema.fields).join(", ")}`);
    
    console.log(`\n📈 File Statistics:`);
    console.log(`   Row count: ${reader.getRowCount()}`);
    
    // Read first few rows
    console.log(`\n📄 Sample Rows (first 3):`);
    const cursor = reader.getCursor();
    
    for (let i = 0; i < 3; i++) {
      const record = await cursor.next();
      if (record) {
        console.log(`\n   Row ${i + 1}:`, JSON.stringify(record, null, 2));
      }
    }
    
    await reader.close();
    
    console.log(`\n✅ @dsnp/parquetjs reading test PASSED!\n`);
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

testDsnpParquetReading();
