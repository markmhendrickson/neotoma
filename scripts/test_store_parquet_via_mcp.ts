#!/usr/bin/env npx tsx
/**
 * Test storing parquet file via MCP store action
 * 
 * This script tests the MCP store action with a parquet file after BigInt fixes
 */

import { config } from "dotenv";
import { NeotomaServer } from "../src/server.js";

config();

const DATA_DIR = process.env.DATA_DIR || process.env.NEOTOMA_DATA_DIR;

if (!DATA_DIR) {
  console.error("❌ Error: DATA_DIR or NEOTOMA_DATA_DIR not set");
  process.exit(1);
}

async function testStoreParquetViaMCP() {
  try {
    const server = new NeotomaServer();
    const testUserId = "00000000-0000-0000-0000-000000000000";
    const parquetFile = `${DATA_DIR}/tasks/tasks.parquet`;

    console.log(`\n📊 Testing MCP store action with parquet file:`);
    console.log(`   File: ${parquetFile}\n`);

    // Call store action via MCP (using internal method for testing)
    const result = await (server as any).store({
      user_id: testUserId,
      file_path: parquetFile,
      interpret: false,
    });

    console.log("✅ Successfully stored parquet file via MCP!");
    console.log(`\n📋 Result:`);
    console.log(JSON.stringify(result, null, 2));

    // Parse result
    const resultData = JSON.parse(result.content[0].text);
    
    console.log(`\n📊 Summary:`);
    console.log(`   Source ID: ${resultData.source_id}`);
    console.log(`   Entities Created: ${resultData.entities?.length || 0}`);
    console.log(`   Unknown Fields Count: ${resultData.unknown_fields_count || 0}`);
    
    if (resultData.entities && resultData.entities.length > 0) {
      console.log(`\n   First few entities:`);
      resultData.entities.slice(0, 3).forEach((entity: any, i: number) => {
        console.log(`   ${i + 1}. ${entity.entity_type} (${entity.entity_id})`);
      });
    }

    console.log(`\n✅ Parquet storage test PASSED!\n`);
    
  } catch (error: any) {
    console.error(`\n❌ Parquet storage test FAILED:`, error.message);
    if (error.stack) {
      console.error(`   Stack:`, error.stack);
    }
    process.exit(1);
  }
}

testStoreParquetViaMCP();
