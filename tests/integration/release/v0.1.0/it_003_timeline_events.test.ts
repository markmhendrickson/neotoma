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
import {
  generateEvents,
  generateEventId,
  persistEvents,
  getEventsByRecordId,
} from "../../../../src/services/event_generation.js";

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

  it("should persist events to timeline_events table", async () => {
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
          invoice_number: `${testPrefix}-INV-002`,
          date_issued: "2024-03-01",
          date_due: "2024-04-01",
          vendor_name: "Test Vendor",
        },
      }),
    });

    const record = await recordResponse.json();
    createdRecordIds.push(record.id);

    // Step 2: Generate and persist events
    const events = generateEvents(record.id, record.properties, "invoice");
    const persistedEvents = await persistEvents(events);

    expect(persistedEvents.length).toBe(events.length);

    // Step 3: Verify events exist in database
    const { data: dbEvents, error } = await supabase
      .from("timeline_events")
      .select("*")
      .eq("source_record_id", record.id)
      .order("event_timestamp", { ascending: true });

    expect(error).toBeNull();
    expect(dbEvents).toBeDefined();
    expect(dbEvents!.length).toBe(events.length);

    // Verify event details
    for (const event of events) {
      const dbEvent = dbEvents!.find((e) => e.id === event.id);
      expect(dbEvent).toBeDefined();
      expect(dbEvent!.event_type).toBe(event.event_type);
      // Normalize timestamps for comparison (PostgreSQL may return different timezone formats)
      expect(new Date(dbEvent!.event_timestamp).toISOString()).toBe(new Date(event.event_timestamp).toISOString());
      expect(dbEvent!.source_record_id).toBe(record.id);
      expect(dbEvent!.source_field).toBe(event.source_field);
    }
  });

  it("should link events to records via record_event_edges", async () => {
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
          invoice_number: `${testPrefix}-INV-003`,
          date_issued: "2024-05-01",
          vendor_name: "Another Vendor",
        },
      }),
    });

    const record = await recordResponse.json();
    createdRecordIds.push(record.id);

    // Step 2: Events and edges are now created automatically by store_record
    // Get the events that were created
    const persistedEvents = await getEventsByRecordId(record.id);

    // Step 3: Verify edges exist (created automatically by store_record)
    const { data: edges, error } = await supabase
      .from("record_event_edges")
      .select("*")
      .eq("record_id", record.id);

    expect(error).toBeNull();
    expect(edges).toBeDefined();
    expect(edges!.length).toBeGreaterThanOrEqual(persistedEvents.length);

    // Verify edge details - check that all events have at least one edge
    for (const event of persistedEvents) {
      const eventEdges = edges!.filter((e) => e.event_id === event.id);
      expect(eventEdges.length).toBeGreaterThan(0);
      expect(eventEdges[0].record_id).toBe(record.id);
      expect(eventEdges[0].edge_type).toBe("GENERATED_FROM");
    }
  });

  it("should get events by record ID", async () => {
    const testPrefix = `${context.testPrefix}`;
    // Create record with date fields
    const recordResponse = await fetch(`${context.baseUrl}/store_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        type: "invoice",
        properties: {
          invoice_number: `${testPrefix}-INV-004`,
          date_issued: "2024-06-01",
          date_due: "2024-07-01",
        },
      }),
    });

    const record = await recordResponse.json();
    createdRecordIds.push(record.id);

    // Generate and persist events
    const events = generateEvents(record.id, record.properties, "invoice");
    await persistEvents(events);

    // Get events by record ID
    const retrievedEvents = await getEventsByRecordId(record.id);

    expect(retrievedEvents.length).toBe(events.length);
    expect(
      retrievedEvents[0].event_timestamp <=
        retrievedEvents[retrievedEvents.length - 1].event_timestamp
    ).toBe(true);
  });
});
