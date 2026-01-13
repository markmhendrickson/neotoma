#!/usr/bin/env tsx
/**
 * Test MCP store action response structure
 * Verifies that store action includes related_entities and related_relationships
 */

import { NeotomaServer } from "../src/server.js";
import { existsSync } from "fs";
import { resolve } from "path";

const filePath = process.argv[2];
const userId = process.argv[3] || "00000000-0000-0000-0000-000000000000";

if (!filePath) {
  console.error("Usage: tsx scripts/test-store-response-structure.ts <file-path> [user-id]");
  process.exit(1);
}

async function testStoreResponseStructure() {
  try {
    const absolutePath = resolve(filePath);
    
    console.log(`\n📁 Testing MCP store action with: ${absolutePath}`);
    console.log(`👤 User ID: ${userId}\n`);

    // Check file exists
    if (!existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }
    console.log("✅ File exists\n");

    // Create server instance
    const server = new NeotomaServer();
    
    // Get the store method (it's private, so we'll need to access it via reflection or make it testable)
    // For now, let's use the MCP protocol directly
    console.log("📤 Calling MCP store action with file_path...\n");
    
    // Access the private store method via type assertion
    const serverAny = server as any;
    const storeMethod = serverAny.store.bind(serverAny);
    
    const result = await storeMethod({
      user_id: userId,
      file_path: absolutePath,
      interpret: true,
    });

    // Parse the response
    const responseText = result.content[0]?.text || "{}";
    const response = JSON.parse(responseText);

    console.log("📋 Response Structure:\n");
    console.log(JSON.stringify(response, null, 2));
    console.log("\n");

    // Verify response structure
    console.log("✓ Verifying response structure...\n");

    // Required fields
    const requiredFields = ["source_id"];
    for (const field of requiredFields) {
      if (!(field in response)) {
        throw new Error(`Missing required field: ${field}`);
      }
      console.log(`  ✅ ${field}: ${response[field]}`);
    }

    // Verify related_entities and related_relationships are ALWAYS included
    console.log("\n  ✓ Verifying related entities and related relationships (always required)...");
    
    if (!("related_entities" in response)) {
      throw new Error("Missing field: related_entities (should ALWAYS be included, even when interpretation doesn't run)");
    }
    console.log(`  ✅ related_entities: present (${Array.isArray(response.related_entities) ? response.related_entities.length : 0} entities)`);
    
    if (!("related_relationships" in response)) {
      throw new Error("Missing field: related_relationships (should ALWAYS be included, even when interpretation doesn't run)");
    }
    console.log(`  ✅ related_relationships: present (${Array.isArray(response.related_relationships) ? response.related_relationships.length : 0} relationships)`);

    // Check for interpretation result (if interpretation ran)
    if (response.interpretation) {
      console.log(`\n  ✅ interpretation: present`);
      console.log(`     - interpretation_id: ${response.interpretation.interpretationId || "N/A"}`);
      console.log(`     - entities created: ${response.interpretation.entities?.length || 0}`);
    } else {
      console.log("\n  ℹ️  No interpretation result (file may have been deduplicated or interpret=false)");
    }
    
    // Show related entities details
    if (response.related_entities && response.related_entities.length > 0) {
      console.log("\n  📊 Related Entities:");
      response.related_entities.forEach((entity: any, idx: number) => {
        console.log(`     ${idx + 1}. ${entity.entity_type} (${entity.id})`);
        if (entity.snapshot) {
          console.log(`        - Has snapshot`);
        }
      });
    } else {
      console.log("\n  ℹ️  No related entities found (this is expected for a new entity with no relationships)");
    }
    
    // Show relationships details
    if (response.related_relationships && response.related_relationships.length > 0) {
      console.log("\n  🔗 Related Relationships:");
      response.related_relationships.forEach((rel: any, idx: number) => {
        console.log(`     ${idx + 1}. ${rel.relationship_type}: ${rel.source_entity_id} → ${rel.target_entity_id}`);
      });
    } else {
      console.log("\n  ℹ️  No relationships found (this is expected for a new entity with no relationships)");
    }

    console.log("\n🎉 Response structure verification passed!\n");
    process.exit(0);
  } catch (error: any) {
    console.error(`\n❌ Test failed: ${error.message}\n`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testStoreResponseStructure();
