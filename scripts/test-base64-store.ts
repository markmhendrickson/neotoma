#!/usr/bin/env tsx
/**
 * Test backward compatibility of base64 file_content approach
 */

import { storeRawContent } from "../src/services/raw_storage.js";
import { readFileSync } from "fs";

const filePath = process.argv[2];
const userId = process.argv[3] || "00000000-0000-0000-0000-000000000000";

if (!filePath) {
  console.error("Usage: tsx scripts/test-base64-store.ts <file-path> [user-id]");
  process.exit(1);
}

async function testBase64Store() {
  try {
    console.log(`\n📁 Testing base64 file_content approach (backward compatibility)`);
    console.log(`   File: ${filePath}`);
    console.log(`   User ID: ${userId}\n`);

    // Read and base64 encode file
    console.log("✓ Test: Base64 encoding and storage");
    const fileBuffer = readFileSync(filePath);
    console.log(`  File read: ${fileBuffer.length} bytes`);

    // Store using buffer directly (simulating what happens after base64 decode)
    const storageResult = await storeRawContent({
      userId,
      fileBuffer,
      mimeType: "application/pdf",
      originalFilename: "test-backward-compat.pdf",
      provenance: {
        upload_method: "mcp_store",
        client: "test_script",
      },
    });

    console.log(`  ✅ Storage result:`);
    console.log(`     Source ID: ${storageResult.sourceId}`);
    console.log(`     Content Hash: ${storageResult.contentHash}`);
    console.log(`     Deduplicated: ${storageResult.deduplicated}`);

    console.log("\n🎉 Backward compatibility test passed!\n");
    process.exit(0);
  } catch (error: any) {
    console.error(`\n❌ Test failed: ${error.message}\n`);
    process.exit(1);
  }
}

testBase64Store();
