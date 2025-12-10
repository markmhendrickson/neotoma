/**
 * IT-003: Timeline Event Validation
 *
 * Goal: Verify that date fields in documents generate timeline events correctly.
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
import { generateEvents } from "../../../../src/services/event_generation.js";

describe("IT-003: Timeline Event Validation", () => {
  let context: TestContext;
  const createdRecordIds: string[] = [];

  beforeAll(async () => {
    context = await setupTestServer("IT-003");
  });

  beforeEach(async () => {
    await cleanupTestDataByPrefix(context.testPrefix);
    createdRecordIds.length = 0;
  });

  afterAll(async () => {
    await cleanupAllTestData(createdRecordIds);
    await teardownTestServer(context);
  });

  it("should generate events from date fields", async () => {
    const testPrefix = `${context.testPrefix}`;
    // Step 1: Create record with date fields
    const recordResponse = await fetch(`${context.baseUrl}/store_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        type: "invoice",
        properties: {
          invoice_number: `${testPrefix}-INV-001`,
          date_issued: "2024-01-15",
          date_due: "2024-02-15",
          amount: 1000,
        },
      }),
    });

    expect(recordResponse.status).toBe(200);
    const record = await recordResponse.json();
    createdRecordIds.push(record.id);

    // Step 2: Generate events from record properties
    const events = generateEvents(record.id, record.properties, "invoice");

    // Step 3: Verify events generated
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.event_type === "InvoiceIssued")).toBe(true);
    expect(events.some((e) => e.event_type === "InvoiceDue")).toBe(true);

    // Step 4: Verify events ordered chronologically
    const sortedEvents = [...events].sort((a, b) =>
      a.event_timestamp.localeCompare(b.event_timestamp)
    );
    expect(events).toEqual(sortedEvents);

    // Step 5: Verify event IDs are deterministic
    const events2 = generateEvents(record.id, record.properties, "invoice");
    expect(events.length).toBe(events2.length);
    for (let i = 0; i < events.length; i++) {
      expect(events[i].id).toBe(events2[i].id);
    }
  });
});
