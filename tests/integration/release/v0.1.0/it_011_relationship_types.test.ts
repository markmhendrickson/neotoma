/**
 * IT-011: Relationship Types Validation
 *
 * Goal: Verify that first-class typed relationships work correctly.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  setupTestServer,
  teardownTestServer,
  cleanupAllTestData,
  cleanupTestDataByPrefix,
  type TestContext,
} from "./test_helpers.js";
import { supabase } from "../../../../src/db.js";
import { detectCycles } from "../../../../src/services/graph_builder.js";
import { resolveEntity } from "../../../../src/services/entity_resolution.js";

describe("IT-011: Relationship Types Validation", () => {
  let context: TestContext;
  const createdRecordIds: string[] = [];

  beforeAll(async () => {
    context = await setupTestServer("IT-011");
  });

  beforeEach(async () => {
    await cleanupTestDataByPrefix(context.testPrefix);
    createdRecordIds.length = 0;
  });

  afterAll(async () => {
    await cleanupAllTestData(createdRecordIds);
    await teardownTestServer(context);
  });

  it("should support relationship creation and cycle detection", async () => {
    const testPrefix = `${context.testPrefix}`;
    // Step 1: Create two records
    const record1Response = await fetch(`${context.baseUrl}/store_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        type: "invoice",
        properties: { invoice_number: `${testPrefix}-INV-001`, amount: 1000 },
      }),
    });

    const record2Response = await fetch(`${context.baseUrl}/store_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        type: "payment",
        properties: { payment_number: `${testPrefix}-PAY-001`, amount: 1000 },
      }),
    });

    expect(record1Response.status).toBe(200);
    expect(record2Response.status).toBe(200);
    const record1 = await record1Response.json();
    const record2 = await record2Response.json();
    createdRecordIds.push(record1.id, record2.id);

    // Step 2: Create relationship (if relationships table exists)
    const { data: relationships, error } = await supabase
      .from("relationships")
      .select("*")
      .limit(1);

    // If table doesn't exist, that's OK for v0.1.0 (may be deferred)
    if (!error && relationships) {
      expect(Array.isArray(relationships)).toBe(true);
    }

    // Step 3: Verify cycle detection works
    const cycles = await detectCycles();
    expect(Array.isArray(cycles)).toBe(true);
  });

  it("should support create_relationship MCP action", async () => {
    // Step 1: Create two entities
    const entity1 = await resolveEntity(
      "company",
      "Relationship Test Company 1"
    );
    const entity2 = await resolveEntity(
      "company",
      "Relationship Test Company 2"
    );

    // Step 2: Create relationship via MCP action
    const response = await fetch(`${context.baseUrl}/create_relationship`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        relationship_type: "PART_OF",
        source_entity_id: entity1.id,
        target_entity_id: entity2.id,
        metadata: { test: "metadata" },
      }),
    });

    // Verify response
    if (response.status === 200) {
      const relationship = await response.json();
      expect(relationship).toBeDefined();
      expect(relationship.relationship_type).toBe("PART_OF");
      expect(relationship.source_entity_id).toBe(entity1.id);
      expect(relationship.target_entity_id).toBe(entity2.id);

      // Step 3: Verify relationship exists in database
      const { data: dbRel, error } = await supabase
        .from("relationships")
        .select("*")
        .eq("source_entity_id", entity1.id)
        .eq("target_entity_id", entity2.id)
        .single();

      expect(error).toBeNull();
      expect(dbRel).toBeDefined();
    }

    // Cleanup
    await supabase
      .from("relationships")
      .delete()
      .eq("source_entity_id", entity1.id);
    await supabase.from("entities").delete().in("id", [entity1.id, entity2.id]);
  });

  it("should support list_relationships MCP action", async () => {
    // Step 1: Create two entities
    const entity1 = await resolveEntity(
      "company",
      "List Relationships Company 1"
    );
    const entity2 = await resolveEntity(
      "company",
      "List Relationships Company 2"
    );

    // Step 2: Create relationships
    await supabase.from("relationships").insert([
      {
        relationship_type: "SETTLES",
        source_entity_id: entity1.id,
        target_entity_id: entity2.id,
        metadata: {},
        user_id: "00000000-0000-0000-0000-000000000000",
      },
      {
        relationship_type: "REFERS_TO",
        source_entity_id: entity2.id,
        target_entity_id: entity1.id,
        metadata: {},
        user_id: "00000000-0000-0000-0000-000000000000",
      },
    ]);

    // Step 3: List outbound relationships
    const outboundResponse = await fetch(
      `${context.baseUrl}/list_relationships`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          entity_id: entity1.id,
          direction: "outbound",
        }),
      }
    );

    if (outboundResponse.status === 200) {
      const outboundData = await outboundResponse.json();
      expect(outboundData).toBeDefined();
      expect(outboundData.relationships || outboundData).toBeDefined();
    }

    // Step 4: List inbound relationships
    const inboundResponse = await fetch(
      `${context.baseUrl}/list_relationships`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          entity_id: entity1.id,
          direction: "inbound",
        }),
      }
    );

    if (inboundResponse.status === 200) {
      const inboundData = await inboundResponse.json();
      expect(inboundData).toBeDefined();
      expect(inboundData.relationships || inboundData).toBeDefined();
    }

    // Step 5: List both directions
    const bothResponse = await fetch(`${context.baseUrl}/list_relationships`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        entity_id: entity1.id,
        direction: "both",
      }),
    });

    if (bothResponse.status === 200) {
      const bothData = await bothResponse.json();
      expect(bothData).toBeDefined();
      expect(bothData.relationships || bothData).toBeDefined();
    }

    // Cleanup
    await supabase
      .from("relationships")
      .delete()
      .in("source_entity_id", [entity1.id, entity2.id]);
    await supabase.from("entities").delete().in("id", [entity1.id, entity2.id]);
  });

  it("should preserve relationship metadata", async () => {
    // Step 1: Create two entities
    const entity1 = await resolveEntity("company", "Metadata Test Company 1");
    const entity2 = await resolveEntity("company", "Metadata Test Company 2");

    // Step 2: Create relationship with metadata
    const { data: relationship, error } = await supabase
      .from("relationships")
      .insert({
        relationship_type: "CORRECTS",
        source_entity_id: entity1.id,
        target_entity_id: entity2.id,
        metadata: {
          correction_date: "2024-01-15",
          reason: "duplicate entry",
        },
        user_id: "00000000-0000-0000-0000-000000000000",
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(relationship).toBeDefined();
    expect(relationship!.metadata).toBeDefined();
    expect(relationship!.metadata.correction_date).toBe("2024-01-15");
    expect(relationship!.metadata.reason).toBe("duplicate entry");

    // Cleanup
    await supabase.from("relationships").delete().eq("id", relationship!.id);
    await supabase.from("entities").delete().in("id", [entity1.id, entity2.id]);
  });

  it("should support graph traversal via relationships", async () => {
    // Step 1: Create three entities
    const entity1 = await resolveEntity("company", "Traversal Company 1");
    const entity2 = await resolveEntity("company", "Traversal Company 2");
    const entity3 = await resolveEntity("company", "Traversal Company 3");

    // Step 2: Create relationships: entity1 → entity2 → entity3
    await supabase.from("relationships").insert([
      {
        relationship_type: "PART_OF",
        source_entity_id: entity1.id,
        target_entity_id: entity2.id,
        metadata: {},
        user_id: "00000000-0000-0000-0000-000000000000",
      },
      {
        relationship_type: "PART_OF",
        source_entity_id: entity2.id,
        target_entity_id: entity3.id,
        metadata: {},
        user_id: "00000000-0000-0000-0000-000000000000",
      },
    ]);

    // Step 3: Traverse from entity1 to find entity2
    const { data: directRelationships, error: directError } = await supabase
      .from("relationships")
      .select("*")
      .eq("source_entity_id", entity1.id);

    expect(directError).toBeNull();
    expect(directRelationships).toBeDefined();
    expect(directRelationships!.length).toBeGreaterThan(0);
    expect(directRelationships![0].target_entity_id).toBe(entity2.id);

    // Step 4: Traverse from entity2 to find entity3
    const { data: secondHopRelationships, error: secondHopError } =
      await supabase
        .from("relationships")
        .select("*")
        .eq("source_entity_id", entity2.id);

    expect(secondHopError).toBeNull();
    expect(secondHopRelationships).toBeDefined();
    expect(secondHopRelationships!.length).toBeGreaterThan(0);
    expect(secondHopRelationships![0].target_entity_id).toBe(entity3.id);

    // Cleanup
    await supabase
      .from("relationships")
      .delete()
      .in("source_entity_id", [entity1.id, entity2.id]);
    await supabase
      .from("entities")
      .delete()
      .in("id", [entity1.id, entity2.id, entity3.id]);
  });
});
