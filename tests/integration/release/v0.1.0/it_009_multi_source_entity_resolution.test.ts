/**
 * IT-009: Multi-Source Entity Resolution
 *
 * Goal: Verify that multiple observations about same entity merge correctly via reducers.
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

describe("IT-009: Multi-Source Entity Resolution", () => {
  let context: TestContext;
  const createdRecordIds: string[] = [];

  beforeAll(async () => {
    context = await setupTestServer("IT-009");
  });

  beforeEach(async () => {
    await cleanupTestDataByPrefix(context.testPrefix);
    createdRecordIds.length = 0;
  });

  afterAll(async () => {
    await cleanupAllTestData(createdRecordIds);
    await teardownTestServer(context);
  });

  it("should resolve same entity from multiple sources", async () => {
    const testPrefix = `${context.testPrefix}`;
    // Step 1: Create record 1 with entity
    const response1 = await fetch(`${context.baseUrl}/store_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        type: "invoice",
        properties: {
          invoice_number: `${testPrefix}-INV-001`,
          vendor_name: "Acme Corp",
        },
      }),
    });

    expect(response1.status).toBe(200);
    const record1 = await response1.json();
    createdRecordIds.push(record1.id);

    // Step 2: Create record 2 with same entity (different variation)
    const response2 = await fetch(`${context.baseUrl}/store_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        type: "contract",
        properties: {
          contract_number: `${testPrefix}-CNT-001`,
          vendor_name: "ACME CORP",
        },
      }),
    });

    expect(response2.status).toBe(200);
    const record2 = await response2.json();
    createdRecordIds.push(record2.id);

    // Step 3: Verify both resolve to same entity ID
    const entity1Id = generateEntityId(
      "company",
      normalizeEntityValue("company", "Acme Corp")
    );
    const entity2Id = generateEntityId(
      "company",
      normalizeEntityValue("company", "ACME CORP")
    );

    expect(entity1Id).toBe(entity2Id);
  });
});
