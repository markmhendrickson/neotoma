/**
 * IT-002: Entity Resolution Validation
 *
 * Goal: Verify that entity resolution produces canonical IDs across multiple documents.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  setupTestServer,
  teardownTestServer,
  cleanupAllTestData,
  cleanupTestDataByPrefix,
  type TestContext,
} from "./test_helpers.js";
import {
  generateEntityId,
  normalizeEntityValue,
} from "../../../../src/services/entity_resolution.js";
import { supabase } from "../../../../src/db.js";

describe("IT-002: Entity Resolution Validation", () => {
  let context: TestContext;
  const createdRecordIds: string[] = [];

  beforeAll(async () => {
    context = await setupTestServer("IT-002");
  });

  beforeEach(async () => {
    await cleanupTestDataByPrefix(context.testPrefix);
    createdRecordIds.length = 0;
  });

  afterAll(async () => {
    await cleanupAllTestData(createdRecordIds);
    await teardownTestServer(context);
  });

  it("should produce same entity ID for normalized entity names", async () => {
    const testPrefix = `${context.testPrefix}`;
    // Step 1: Create record with "Acme Corp"
    const record1Response = await fetch(`${context.baseUrl}/store_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        type: "invoice",
        properties: {
          vendor_name: "Acme Corp",
          invoice_number: `${testPrefix}-INV-001`,
        },
      }),
    });

    expect(record1Response.status).toBe(200);
    const record1 = await record1Response.json();
    createdRecordIds.push(record1.id);

    // Step 2: Create record with "ACME CORP"
    const record2Response = await fetch(`${context.baseUrl}/store_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        type: "invoice",
        properties: {
          vendor_name: "ACME CORP",
          invoice_number: `${testPrefix}-INV-002`,
        },
      }),
    });

    expect(record2Response.status).toBe(200);
    const record2 = await record2Response.json();
    createdRecordIds.push(record2.id);

    // Step 3: Verify entity IDs are deterministic and match
    const entity1Id = generateEntityId(
      "company",
      normalizeEntityValue("company", "Acme Corp")
    );
    const entity2Id = generateEntityId(
      "company",
      normalizeEntityValue("company", "ACME CORP")
    );

    expect(entity1Id).toBe(entity2Id);
    expect(entity1Id).toMatch(/^ent_[a-f0-9]{24}$/);
  });

  it("should persist entities to database", async () => {
    const testPrefix = `${context.testPrefix}`;
    // Step 1: Create record with entity
    const recordResponse = await fetch(`${context.baseUrl}/store_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        type: "invoice",
        properties: {
          vendor_name: "Test Vendor Inc",
          invoice_number: `${testPrefix}-INV-003`,
        },
      }),
    });

    expect(recordResponse.status).toBe(200);
    const record = await recordResponse.json();
    createdRecordIds.push(record.id);

    // Step 2: Calculate expected entity ID
    const expectedEntityId = generateEntityId(
      "company",
      normalizeEntityValue("company", "Test Vendor Inc")
    );

    // Step 3: Query database to verify entity was persisted
    const { data: entity, error } = await supabase
      .from("entities")
      .select("*")
      .eq("id", expectedEntityId)
      .single();

    // Verify entity exists in database
    expect(error).toBeNull();
    expect(entity).toBeDefined();
    expect(entity!.id).toBe(expectedEntityId);
    expect(entity!.entity_type).toBe("company");
    expect(entity!.canonical_name).toBe(
      normalizeEntityValue("company", "Test Vendor Inc")
    );

    // Step 4: Verify entity is linked to record via record_entity_edges
    const { data: edges, error: edgesError } = await supabase
      .from("record_entity_edges")
      .select("*")
      .eq("record_id", record.id)
      .eq("entity_id", expectedEntityId);

    expect(edgesError).toBeNull();
    expect(edges).toBeDefined();
    expect(edges!.length).toBeGreaterThan(0);
    expect(edges![0].edge_type).toBe("EXTRACTED_FROM");
  });

  it("should reuse existing entity for duplicate entity names", async () => {
    const testPrefix = `${context.testPrefix}`;
    // Step 1: Create first record with entity
    const record1Response = await fetch(`${context.baseUrl}/store_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        type: "invoice",
        properties: {
          vendor_name: "Unique Test Company",
          invoice_number: `${testPrefix}-INV-004`,
        },
      }),
    });

    const record1 = await record1Response.json();
    createdRecordIds.push(record1.id);

    // Step 2: Create second record with same entity (different case)
    const record2Response = await fetch(`${context.baseUrl}/store_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        type: "invoice",
        properties: {
          vendor_name: "UNIQUE TEST COMPANY",
          invoice_number: `${testPrefix}-INV-005`,
        },
      }),
    });

    const record2 = await record2Response.json();
    createdRecordIds.push(record2.id);

    // Step 3: Calculate expected entity ID
    const expectedEntityId = generateEntityId(
      "company",
      normalizeEntityValue("company", "Unique Test Company")
    );

    // Step 4: Verify only one entity exists in database
    const { data: entities, error } = await supabase
      .from("entities")
      .select("*")
      .eq("id", expectedEntityId);

    expect(error).toBeNull();
    expect(entities).toBeDefined();
    expect(entities!.length).toBe(1);

    // Step 5: Verify both records link to same entity
    const { data: edges1 } = await supabase
      .from("record_entity_edges")
      .select("entity_id")
      .eq("record_id", record1.id);

    const { data: edges2 } = await supabase
      .from("record_entity_edges")
      .select("entity_id")
      .eq("record_id", record2.id);

    expect(edges1).toBeDefined();
    expect(edges2).toBeDefined();
    expect(edges1!.length).toBeGreaterThan(0);
    expect(edges2!.length).toBeGreaterThan(0);
    expect(edges1![0].entity_id).toBe(edges2![0].entity_id);
    expect(edges1![0].entity_id).toBe(expectedEntityId);
  });
});
