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
});
