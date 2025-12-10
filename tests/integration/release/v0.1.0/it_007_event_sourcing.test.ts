/**
 * IT-007: Event-Sourcing Validation
 *
 * Goal: Verify that event-sourcing foundation is operational (events emitted, reducers applied, historical replay functional).
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
import { getEventsByRecordId } from "../../../../src/events/event_log.js";
import { getRecordAtTimestamp } from "../../../../src/events/replay.js";

describe("IT-007: Event-Sourcing Validation", () => {
  let context: TestContext;
  const createdRecordIds: string[] = [];

  beforeAll(async () => {
    context = await setupTestServer("IT-007");
  });

  beforeEach(async () => {
    await cleanupTestDataByPrefix(context.testPrefix);
    createdRecordIds.length = 0;
  });

  afterAll(async () => {
    await cleanupAllTestData(createdRecordIds);
    await teardownTestServer(context);
  });

  it("should emit events for state changes", async () => {
    const testPrefix = `${context.testPrefix}`;
    // Step 1: Create record
    const createResponse = await fetch(`${context.baseUrl}/store_record`, {
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

    expect(createResponse.status).toBe(200);
    const record = await createResponse.json();
    createdRecordIds.push(record.id);

    // Step 2: Verify RecordCreated event emitted
    const events = await getEventsByRecordId(record.id);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].event_type).toBe("RecordCreated");
    expect(events[0].reducer_version).toBeDefined();

    // Step 3: Update record
    const updateResponse = await fetch(`${context.baseUrl}/update_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        id: record.id,
        properties: { invoice_number: `${testPrefix}-INV-001`, amount: 2000 },
      }),
    });

    expect(updateResponse.status).toBe(200);

    // Step 4: Verify RecordUpdated event emitted
    const eventsAfterUpdate = await getEventsByRecordId(record.id);
    expect(eventsAfterUpdate.length).toBeGreaterThan(events.length);
    const updateEvent = eventsAfterUpdate.find(
      (e) => e.event_type === "RecordUpdated"
    );
    expect(updateEvent).toBeDefined();

    // Step 5: Delete record
    const deleteResponse = await fetch(`${context.baseUrl}/delete_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        id: record.id,
      }),
    });

    expect(deleteResponse.status).toBe(200);

    // Step 6: Verify RecordDeleted event emitted
    const eventsAfterDelete = await getEventsByRecordId(record.id);
    const deleteEvent = eventsAfterDelete.find(
      (e) => e.event_type === "RecordDeleted"
    );
    expect(deleteEvent).toBeDefined();
  });
});
