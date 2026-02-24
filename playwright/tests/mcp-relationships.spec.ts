/**
 * E2E Test: MCP Relationship Creation Flow
 * 
 * Tests relationship creation and querying via MCP actions.
 */

import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";
import {
  clearClientState,
  primeLocalSettings,
  attachBrowserLogging,
  routeChatThroughMock,
} from "./helpers.js";
import { db } from "../../src/db.js";

test.describe("E2E-007: MCP Relationship Creation Flow", () => {
  const testUserId = "test-user-mcp-relationships";
  const createdEntityIds: string[] = [];
  const createdRelationshipIds: string[] = [];

  test.afterEach(async () => {
    // Clean up test data
    if (createdRelationshipIds.length > 0) {
      await db.from("relationships").delete().in("id", createdRelationshipIds);
      createdRelationshipIds.length = 0;
    }
    if (createdEntityIds.length > 0) {
      await db.from("entities").delete().in("id", createdEntityIds);
      createdEntityIds.length = 0;
    }
  });

  test("should create entities and relationships via MCP", async ({ page, uiBaseUrl, mockApi, mcpBaseUrl }) => {
    if (!mcpBaseUrl) {
      test.skip();
      return;
    }

    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // 1. Create entities A and B via MCP
    const storeResponseA = await page.request.post(`${mcpBaseUrl}/store`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        entities: [
          {
            entity_type: "company",
            name: "Company A MCP",
          },
        ],
      },
    });

    expect(storeResponseA.status()).toBe(200);
    const resultA = await storeResponseA.json();
    const entityAId = resultA.entities[0].id;
    createdEntityIds.push(entityAId);

    const storeResponseB = await page.request.post(`${mcpBaseUrl}/store`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        entities: [
          {
            entity_type: "company",
            name: "Company B MCP",
          },
        ],
      },
    });

    expect(storeResponseB.status()).toBe(200);
    const resultB = await storeResponseB.json();
    const entityBId = resultB.entities[0].id;
    createdEntityIds.push(entityBId);

    // 2. Create relationship A→B via MCP
    const relationshipResponse = await page.request.post(`${mcpBaseUrl}/create_relationship`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        relationship_type: "PART_OF",
        source_entity_id: entityAId,
        target_entity_id: entityBId,
      },
    });

    expect(relationshipResponse.status()).toBe(200);
    const relationshipResult = await relationshipResponse.json();
    
    expect(relationshipResult.relationship).toBeDefined();
    expect(relationshipResult.relationship.relationship_type).toBe("PART_OF");
    expect(relationshipResult.relationship.source_entity_id).toBe(entityAId);
    expect(relationshipResult.relationship.target_entity_id).toBe(entityBId);

    // 3. Verify relationship was created in database
    const { data: relationships, error: relError } = await db
      .from("relationships")
      .select("*")
      .eq("source_entity_id", entityAId)
      .eq("target_entity_id", entityBId);
    
    expect(relError).toBeNull();
    expect(relationships).toBeDefined();
    expect(relationships!.length).toBe(1);
    
    if (relationships![0].id) {
      createdRelationshipIds.push(relationships![0].id);
    }

    // 4. Verify relationship snapshot was computed
    const { data: snapshot, error: snapshotError } = await db
      .from("relationship_snapshots")
      .select("*")
      .eq("source_entity_id", entityAId)
      .eq("target_entity_id", entityBId)
      .single();
    
    expect(snapshotError).toBeNull();
    expect(snapshot).toBeDefined();
    expect(snapshot!.relationship_type).toBe("PART_OF");
  });

  test("should query related entities via MCP", async ({ page, uiBaseUrl, mockApi, mcpBaseUrl }) => {
    if (!mcpBaseUrl) {
      test.skip();
      return;
    }

    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create entities and relationships
    const entityA = await db
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "query source company",
      })
      .select()
      .single();
    
    createdEntityIds.push(entityA.data!.id);

    const entityB = await db
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "query target company",
      })
      .select()
      .single();
    
    createdEntityIds.push(entityB.data!.id);

    // Create relationship
    const relationship = await db
      .from("relationships")
      .insert({
        user_id: testUserId,
        relationship_type: "REFERS_TO",
        source_entity_id: entityA.data!.id,
        target_entity_id: entityB.data!.id,
        metadata: {},
      })
      .select()
      .single();
    
    if (relationship.data?.id) {
      createdRelationshipIds.push(relationship.data.id);
    }

    // Create relationship snapshot
    await db
      .from("relationship_snapshots")
      .insert({
        relationship_key: `REFERS_TO:${entityA.data!.id}:${entityB.data!.id}`,
        user_id: testUserId,
        relationship_type: "REFERS_TO",
        source_entity_id: entityA.data!.id,
        target_entity_id: entityB.data!.id,
        snapshot: { metadata: {} },
        observation_count: 1,
        last_observation_at: new Date().toISOString(),
      });

    // Query related entities via MCP
    const queryResponse = await page.request.post(`${mcpBaseUrl}/retrieve_related_entities`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        entity_id: entityA.data!.id,
        direction: "outgoing",
      },
    });

    expect(queryResponse.status()).toBe(200);
    const queryResult = await queryResponse.json();
    
    expect(queryResult.related_entities).toBeDefined();
    
    if (queryResult.related_entities.length > 0) {
      const foundRelated = queryResult.related_entities.find(
        (e: { id: string }) => e.id === entityB.data!.id
      );
      expect(foundRelated).toBeDefined();
    }
  });

  test("should verify bidirectional relationship navigation", async ({ page, uiBaseUrl, mockApi, mcpBaseUrl }) => {
    if (!mcpBaseUrl) {
      test.skip();
      return;
    }

    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create entities
    const entityA = await db
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "invoice",
        canonical_name: "invoice bidirectional",
      })
      .select()
      .single();
    
    createdEntityIds.push(entityA.data!.id);

    const entityB = await db
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "vendor bidirectional",
      })
      .select()
      .single();
    
    createdEntityIds.push(entityB.data!.id);

    // Create relationship via MCP
    const relationshipResponse = await page.request.post(`${mcpBaseUrl}/create_relationship`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        relationship_type: "REFERS_TO",
        source_entity_id: entityA.data!.id,
        target_entity_id: entityB.data!.id,
      },
    });

    expect(relationshipResponse.status()).toBe(200);

    // Query outgoing from A
    const outgoingResponse = await page.request.post(`${mcpBaseUrl}/retrieve_related_entities`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        entity_id: entityA.data!.id,
        direction: "outgoing",
      },
    });

    expect(outgoingResponse.status()).toBe(200);
    const outgoingResult = await outgoingResponse.json();
    
    if (outgoingResult.related_entities) {
      const foundB = outgoingResult.related_entities.find(
        (e: { id: string }) => e.id === entityB.data!.id
      );
      expect(foundB).toBeDefined();
    }

    // Query incoming to B
    const incomingResponse = await page.request.post(`${mcpBaseUrl}/retrieve_related_entities`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        entity_id: entityB.data!.id,
        direction: "incoming",
      },
    });

    expect(incomingResponse.status()).toBe(200);
    const incomingResult = await incomingResponse.json();
    
    if (incomingResult.related_entities) {
      const foundA = incomingResult.related_entities.find(
        (e: { id: string }) => e.id === entityA.data!.id
      );
      expect(foundA).toBeDefined();
    }

    // Clean up relationships
    const { data: rels } = await db
      .from("relationships")
      .select("id")
      .eq("source_entity_id", entityA.data!.id);
    
    if (rels) {
      for (const rel of rels) {
        if (rel.id) createdRelationshipIds.push(rel.id);
      }
    }
  });

  test("should prevent or handle cycles", async ({ page, uiBaseUrl, mockApi, mcpBaseUrl }) => {
    if (!mcpBaseUrl) {
      test.skip();
      return;
    }

    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create three entities
    const entities = [];
    for (let i = 0; i < 3; i++) {
      const response = await page.request.post(`${mcpBaseUrl}/store`, {
        headers: {
          "Content-Type": "application/json",
        },
        data: {
          user_id: testUserId,
          entities: [
            {
              entity_type: "company",
              name: `Cycle Test Company ${i}`,
            },
          ],
        },
      });

      const result = await response.json();
      entities.push(result.entities[0].id);
      createdEntityIds.push(result.entities[0].id);
    }

    // Create A→B
    await page.request.post(`${mcpBaseUrl}/create_relationship`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        relationship_type: "PART_OF",
        source_entity_id: entities[0],
        target_entity_id: entities[1],
      },
    });

    // Create B→C
    await page.request.post(`${mcpBaseUrl}/create_relationship`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        relationship_type: "PART_OF",
        source_entity_id: entities[1],
        target_entity_id: entities[2],
      },
    });

    // Attempt to create C→A (would create cycle)
    const cycleResponse = await page.request.post(`${mcpBaseUrl}/create_relationship`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        relationship_type: "PART_OF",
        source_entity_id: entities[2],
        target_entity_id: entities[0],
      },
    });

    // System should handle gracefully (either reject or allow depending on implementation)
    expect([200, 400, 409]).toContain(cycleResponse.status());

    // Clean up relationships
    const { data: rels } = await db
      .from("relationships")
      .select("id")
      .eq("user_id", testUserId);
    
    if (rels) {
      for (const rel of rels) {
        if (rel.id) createdRelationshipIds.push(rel.id);
      }
    }
  });

  test("should handle self-referential relationships", async ({ page, uiBaseUrl, mockApi, mcpBaseUrl }) => {
    if (!mcpBaseUrl) {
      test.skip();
      return;
    }

    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create entity
    const storeResponse = await page.request.post(`${mcpBaseUrl}/store`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        entities: [
          {
            entity_type: "company",
            name: "Self Ref Company",
          },
        ],
      },
    });

    const result = await storeResponse.json();
    const entityId = result.entities[0].id;
    createdEntityIds.push(entityId);

    // Attempt self-referential relationship
    const selfRefResponse = await page.request.post(`${mcpBaseUrl}/create_relationship`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        relationship_type: "PART_OF",
        source_entity_id: entityId,
        target_entity_id: entityId, // Self-reference
      },
    });

    // System should handle gracefully (reject or allow)
    expect([200, 400, 409]).toContain(selfRefResponse.status());

    // Clean up if created
    const { data: rels } = await db
      .from("relationships")
      .select("id")
      .eq("source_entity_id", entityId)
      .eq("target_entity_id", entityId);
    
    if (rels && rels.length > 0 && rels[0].id) {
      createdRelationshipIds.push(rels[0].id);
    }
  });

  test("should support different relationship types", async ({ page, uiBaseUrl, mockApi, mcpBaseUrl }) => {
    if (!mcpBaseUrl) {
      test.skip();
      return;
    }

    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create two entities
    const entityA = await db
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "invoice",
        canonical_name: "invoice for types test",
      })
      .select()
      .single();
    
    createdEntityIds.push(entityA.data!.id);

    const entityB = await db
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "vendor for types test",
      })
      .select()
      .single();
    
    createdEntityIds.push(entityB.data!.id);

    // Test different relationship types
    const relationshipTypes = ["REFERS_TO", "SETTLES", "DEPENDS_ON"];
    
    for (const relType of relationshipTypes) {
      const response = await page.request.post(`${mcpBaseUrl}/create_relationship`, {
        headers: {
          "Content-Type": "application/json",
        },
        data: {
          user_id: testUserId,
          relationship_type: relType,
          source_entity_id: entityA.data!.id,
          target_entity_id: entityB.data!.id,
          metadata: {
            test_type: relType,
          },
        },
      });

      expect(response.status()).toBe(200);
      const result = await response.json();
      expect(result.relationship.relationship_type).toBe(relType);
    }

    // Clean up relationships
    const { data: rels } = await db
      .from("relationships")
      .select("id")
      .eq("source_entity_id", entityA.data!.id);
    
    if (rels) {
      for (const rel of rels) {
        if (rel.id) createdRelationshipIds.push(rel.id);
      }
    }
  });

  test("should include relationship metadata", async ({ page, uiBaseUrl, mockApi, mcpBaseUrl }) => {
    if (!mcpBaseUrl) {
      test.skip();
      return;
    }

    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create entities
    const entityA = await db
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "metadata source",
      })
      .select()
      .single();
    
    createdEntityIds.push(entityA.data!.id);

    const entityB = await db
      .from("entities")
      .insert({
        user_id: testUserId,
        entity_type: "company",
        canonical_name: "metadata target",
      })
      .select()
      .single();
    
    createdEntityIds.push(entityB.data!.id);

    // Create relationship with metadata
    const metadata = {
      confidence: 0.95,
      source: "user_created",
      notes: "Test relationship",
    };

    const response = await page.request.post(`${mcpBaseUrl}/create_relationship`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        relationship_type: "REFERS_TO",
        source_entity_id: entityA.data!.id,
        target_entity_id: entityB.data!.id,
        metadata,
      },
    });

    expect(response.status()).toBe(200);
    const result = await response.json();
    
    expect(result.relationship.snapshot.metadata).toEqual(metadata);

    // Verify in database
    const { data: relationship } = await db
      .from("relationships")
      .select("*")
      .eq("source_entity_id", entityA.data!.id)
      .eq("target_entity_id", entityB.data!.id)
      .single();
    
    expect(relationship!.metadata).toEqual(metadata);
    
    if (relationship!.id) {
      createdRelationshipIds.push(relationship!.id);
    }
  });
});
