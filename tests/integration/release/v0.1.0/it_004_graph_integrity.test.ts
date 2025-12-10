/**
 * IT-004: Graph Integrity Validation
 *
 * Goal: Verify that graph insertion maintains integrity (no orphans, no cycles).
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
  validateGraphIntegrity,
  detectCycles,
} from "../../../../src/services/graph_builder.js";

describe("IT-004: Graph Integrity Validation", () => {
  let context: TestContext;
  const createdRecordIds: string[] = [];

  beforeAll(async () => {
    context = await setupTestServer("IT-004");
  });

  beforeEach(async () => {
    await cleanupTestDataByPrefix(context.testPrefix);
    createdRecordIds.length = 0;
  });

  afterAll(async () => {
    await cleanupAllTestData(createdRecordIds);
    await teardownTestServer(context);
  });

  it("should maintain graph integrity with no orphans or cycles", async () => {
    const testPrefix = `${context.testPrefix}`;
    // Step 1: Create multiple records
    const records = [];
    for (let i = 0; i < 3; i++) {
      const response = await fetch(`${context.baseUrl}/store_record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          type: "invoice",
          properties: {
            invoice_number: `${testPrefix}-INV-00${i + 1}`,
            amount: 100 * (i + 1),
          },
        }),
      });

      expect(response.status).toBe(200);
      const record = await response.json();
      records.push(record);
      createdRecordIds.push(record.id);
    }

    // Step 2: Validate graph integrity
    const integrity = await validateGraphIntegrity();

    // Step 3: Verify no cycles
    expect(integrity.cycleCount).toBe(0);
    expect(integrity.valid).toBe(true);
  });
});
