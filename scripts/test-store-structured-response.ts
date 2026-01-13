#!/usr/bin/env tsx
/**
 * Test MCP store action response structure with structured entities
 * Verifies that store action includes related_entities and related_relationships
 */

import { NeotomaServer } from "../src/server.js";

const userId = process.argv[2] || "00000000-0000-0000-0000-000000000000";

async function testStoreStructuredResponse() {
  try {
    console.log(`\n📦 Testing MCP store action with structured entities`);
    console.log(`👤 User ID: ${userId}\n`);

    // Create server instance
    const server = new NeotomaServer();
    
    // Access the private storeStructuredInternal method
    const serverAny = server as any;
    const storeMethod = serverAny.store.bind(serverAny);
    
    // Store structured entities
    console.log("📤 Calling MCP store action with entities array...\n");
    
    const result = await storeMethod({
      user_id: userId,
      entities: [
        {
          entity_type: "note",
          title: "Test Note for Response Verification",
          content: "This is a test note to verify the store action response structure includes related_entities and related_relationships.",
          created_at: new Date().toISOString(),
        },
      ],
      source_priority: 100,
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
    const requiredFields = ["source_id", "entities"];
    for (const field of requiredFields) {
      if (!(field in response)) {
        throw new Error(`Missing required field: ${field}`);
      }
      console.log(`  ✅ ${field}: present`);
      if (field === "entities") {
        console.log(`     - Count: ${Array.isArray(response[field]) ? response[field].length : 0}`);
      }
    }

    // Verify related_entities and related_relationships are included
    console.log("\n  ✓ Verifying related entities and related relationships...");
    
    if (!("related_entities" in response)) {
      throw new Error("Missing field: related_entities (should always be included)");
    }
    console.log(`  ✅ related_entities: present (${Array.isArray(response.related_entities) ? response.related_entities.length : 0} entities)`);
    
    if (!("related_relationships" in response)) {
      throw new Error("Missing field: related_relationships (should always be included)");
    }
    console.log(`  ✅ related_relationships: present (${Array.isArray(response.related_relationships) ? response.related_relationships.length : 0} relationships)`);
    
    // Show stored entities details
    if (response.entities && response.entities.length > 0) {
      console.log("\n  📊 Stored Entities:");
      response.entities.forEach((entity: any, idx: number) => {
        console.log(`     ${idx + 1}. ${entity.entity_type} (${entity.entity_id})`);
        console.log(`        - Observation ID: ${entity.observation_id}`);
      });
    }
    
    // Show related entities details
    if (response.related_entities && response.related_entities.length > 0) {
      console.log("\n  📊 Related Entities:");
      response.related_entities.forEach((entity: any, idx: number) => {
        console.log(`     ${idx + 1}. ${entity.entity_type} (${entity.id})`);
        if (entity.snapshot) {
          console.log(`        - Has snapshot`);
          if (entity.snapshot.snapshot) {
            const snapshotKeys = Object.keys(entity.snapshot.snapshot);
            console.log(`        - Snapshot fields: ${snapshotKeys.length}`);
          }
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
        if (rel.metadata) {
          console.log(`        - Metadata: ${JSON.stringify(rel.metadata)}`);
        }
      });
    } else {
      console.log("\n  ℹ️  No relationships found (this is expected for a new entity with no relationships)");
    }

    console.log("\n🎉 Response structure verification passed!");
    console.log("\n✅ The store action correctly includes related_entities and related_relationships in the response!\n");
    process.exit(0);
  } catch (error: any) {
    console.error(`\n❌ Test failed: ${error.message}\n`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testStoreStructuredResponse();
