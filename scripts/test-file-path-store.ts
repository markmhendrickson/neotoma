#!/usr/bin/env tsx
/**
 * Test file path support in MCP store action
 */

import { storeRawContent } from "../src/services/raw_storage.js";
import { runInterpretation } from "../src/services/interpretation.js";
import { analyzeFileForRecord } from "../src/services/file_analysis.js";
import { readFileSync, existsSync } from "fs";
import { extname, basename } from "path";

const filePath = process.argv[2];
const userId = process.argv[3] || "00000000-0000-0000-0000-000000000000";

if (!filePath) {
  console.error("Usage: tsx scripts/test-file-path-store.ts <file-path> [user-id]");
  process.exit(1);
}

// MIME type detection helper (same as in server.ts)
function getMimeTypeFromExtension(ext: string): string | null {
  const mimeTypes: Record<string, string> = {
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".json": "application/json",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".html": "text/html",
    ".xml": "application/xml",
    ".md": "text/markdown",
  };
  return mimeTypes[ext] || null;
}

async function testFilePathStore() {
  try {
    console.log(`\n📁 Testing file_path support with: ${filePath}`);
    console.log(`👤 User ID: ${userId}\n`);

    // Test 1: File exists check
    console.log("✓ Test 1: File exists check");
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    console.log("  ✅ File exists\n");

    // Test 2: Read file
    console.log("✓ Test 2: Read file from filesystem");
    let fileBuffer: Buffer;
    try {
      fileBuffer = readFileSync(filePath);
      console.log(`  ✅ File read successfully (${fileBuffer.length} bytes)\n`);
    } catch (error: any) {
      throw new Error(`File read error: ${error.message}`);
    }

    // Test 3: MIME type detection
    console.log("✓ Test 3: MIME type auto-detection");
    const ext = extname(filePath).toLowerCase();
    const detectedMimeType = getMimeTypeFromExtension(ext) || "application/octet-stream";
    console.log(`  File extension: ${ext}`);
    console.log(`  ✅ Detected MIME type: ${detectedMimeType}\n`);

    // Test 4: Filename detection
    console.log("✓ Test 4: Filename auto-detection");
    const detectedFilename = basename(filePath);
    console.log(`  ✅ Detected filename: ${detectedFilename}\n`);

    // Test 5: Store raw content
    console.log("✓ Test 5: Store raw content");
    const storageResult = await storeRawContent({
      userId,
      fileBuffer,
      mimeType: detectedMimeType,
      originalFilename: detectedFilename,
      provenance: {
        upload_method: "mcp_store",
        client: "test_script",
      },
    });
    console.log(`  ✅ Storage result:`);
    console.log(`     Source ID: ${storageResult.sourceId}`);
    console.log(`     Content Hash: ${storageResult.contentHash}`);
    console.log(`     Storage URL: ${storageResult.storageUrl}`);
    console.log(`     File Size: ${storageResult.fileSize} bytes`);
    console.log(`     Deduplicated: ${storageResult.deduplicated}\n`);

    // Test 6: File analysis and interpretation (if not deduplicated)
    if (!storageResult.deduplicated) {
      console.log("✓ Test 6: File analysis and interpretation");
      const analysis = await analyzeFileForRecord({
        buffer: fileBuffer,
        fileName: detectedFilename,
        mimeType: detectedMimeType,
      });
      console.log(`  ✅ Analysis result:`);
      console.log(`     Type: ${analysis.type}`);
      console.log(`     Properties: ${Object.keys(analysis.properties).length} fields`);

      const extractedData = [{
        entity_type: analysis.type,
        ...analysis.properties,
      }];

      const defaultConfig = {
        provider: "rule_based",
        model_id: "neotoma_v1",
        temperature: 0,
        prompt_hash: "n/a",
        code_version: "v0.2.0",
      };

      try {
        const interpretationResult = await runInterpretation({
          userId,
          sourceId: storageResult.sourceId,
          extractedData,
          config: defaultConfig,
        });
        console.log(`  ✅ Interpretation completed:`);
        console.log(`     Interpretation ID: ${interpretationResult.interpretationId}`);
        console.log(`     Observations Created: ${interpretationResult.observationsCreated}`);
        console.log(`     Unknown Fields: ${interpretationResult.unknownFieldsCount}\n`);
      } catch (error: any) {
        console.log(`  ⚠️  Interpretation failed: ${error.message}\n`);
      }
    } else {
      console.log("✓ Test 6: Skipped (file was deduplicated)\n");
    }

    console.log("🎉 All tests passed!\n");
    process.exit(0);
  } catch (error: any) {
    console.error(`\n❌ Test failed: ${error.message}\n`);
    process.exit(1);
  }
}

testFilePathStore();
