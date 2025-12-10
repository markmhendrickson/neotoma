/**
 * IT-005: Determinism Validation
 *
 * Goal: Verify that same input produces identical output (100% deterministic).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  setupTestServer,
  teardownTestServer,
  cleanupAllTestData,
  cleanupTestDataByPrefix,
  type TestContext,
} from "./test_helpers.js";

describe("IT-005: Determinism Validation", () => {
  let context: TestContext;
  const createdRecordIds: string[] = [];

  beforeAll(async () => {
    context = await setupTestServer("IT-005");
  });

  beforeEach(async () => {
    await cleanupTestDataByPrefix(context.testPrefix);
    createdRecordIds.length = 0;
  });

  afterAll(async () => {
    await cleanupAllTestData(createdRecordIds);
    await teardownTestServer(context);
  });

  it("should produce identical results for same query", async () => {
    const testPrefix = `${context.testPrefix}`;
    // Step 1: Create test records with unique identifiers
    for (let i = 0; i < 5; i++) {
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
      createdRecordIds.push(record.id);
    }

    // Step 2: Query only the records we created (using IDs filter for isolation)
    const query = {
      ids: createdRecordIds,
      limit: 10,
    };

    const results: any[][] = [];
    for (let i = 0; i < 10; i++) {
      const response = await fetch(`${context.baseUrl}/retrieve_records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify(query),
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      results.push(result);
    }

    // Step 3: Verify all results are identical
    expect(results.length).toBe(10);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].length).toBe(results[0].length);
      expect(results[i].length).toBe(5); // Should have exactly 5 records
      for (let j = 0; j < results[0].length; j++) {
        expect(results[i][j].id).toBe(results[0][j].id);
      }
    }
  });
});
