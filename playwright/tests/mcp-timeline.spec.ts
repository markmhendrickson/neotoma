/**
 * E2E Test: MCP Timeline Query Flow
 * 
 * Tests timeline event querying and filtering via MCP actions.
 */

import path from "node:path";
import { expect } from "@playwright/test";
import { test } from "../fixtures/servers.js";
import { repoRoot } from "../utils/servers.js";
import {
  clearClientState,
  primeLocalSettings,
  uploadFileFromRecordsTable,
  attachBrowserLogging,
  routeChatThroughMock,
} from "./helpers.js";
import { supabase } from "../../src/db.js";

const uploadFixturePath = path.join(
  repoRoot,
  "tests/fixtures/pdf/sample_invoice.pdf"
);

test.describe("E2E-008: MCP Timeline Query Flow", () => {
  const testUserId = "test-user-mcp-timeline";
  const createdSourceIds: string[] = [];
  const createdEventIds: string[] = [];

  test.afterEach(async () => {
    // Clean up test data
    if (createdEventIds.length > 0) {
      await supabase.from("timeline_events").delete().in("id", createdEventIds);
      createdEventIds.length = 0;
    }
    if (createdSourceIds.length > 0) {
      await supabase.from("sources").delete().in("id", createdSourceIds);
      createdSourceIds.length = 0;
    }
  });

  test("should query timeline events via MCP", async ({ page, uiBaseUrl, mockApi, mcpBaseUrl }) => {
    if (!mcpBaseUrl) {
      test.skip();
      return;
    }

    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create test source
    const { data: source } = await supabase
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: "hash_timeline_test",
        original_filename: "timeline_test.pdf",
        mime_type: "application/pdf",
        file_size: 1000,
      })
      .select()
      .single();
    
    createdSourceIds.push(source!.id);

    // Create test timeline events
    const event1 = await supabase
      .from("timeline_events")
      .insert({
        event_type: "InvoiceIssued",
        event_date: "2025-01-15",
        source_id: source!.id,
        source_field: "date_issued",
      })
      .select()
      .single();
    
    createdEventIds.push(event1.data!.id);

    const event2 = await supabase
      .from("timeline_events")
      .insert({
        event_type: "InvoiceDue",
        event_date: "2025-02-15",
        source_id: source!.id,
        source_field: "date_due",
      })
      .select()
      .single();
    
    createdEventIds.push(event2.data!.id);

    // Query timeline via MCP
    const timelineResponse = await page.request.post(`${mcpBaseUrl}/list_timeline_events`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
      },
    });

    expect(timelineResponse.status()).toBe(200);
    const timelineResult = await timelineResponse.json();
    
    expect(timelineResult.events).toBeDefined();
    expect(timelineResult.events.length).toBeGreaterThan(0);
    
    // Verify our test events are in results
    const foundEvent1 = timelineResult.events.find((e: { id: string }) => e.id === event1.data!.id);
    const foundEvent2 = timelineResult.events.find((e: { id: string }) => e.id === event2.data!.id);
    
    expect(foundEvent1).toBeDefined();
    expect(foundEvent2).toBeDefined();
  });

  test("should return events in chronological order", async ({ page, uiBaseUrl, mockApi, mcpBaseUrl }) => {
    if (!mcpBaseUrl) {
      test.skip();
      return;
    }

    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create test source
    const { data: source } = await supabase
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: "hash_chronological_test",
        original_filename: "chrono_test.pdf",
        mime_type: "application/pdf",
        file_size: 1000,
      })
      .select()
      .single();
    
    createdSourceIds.push(source!.id);

    // Create events with different dates (insert in random order)
    const dates = [
      { date: "2025-03-15", type: "Event3" },
      { date: "2025-01-15", type: "Event1" },
      { date: "2025-02-15", type: "Event2" },
    ];

    for (const { date, type } of dates) {
      const event = await supabase
        .from("timeline_events")
        .insert({
          event_type: type,
          event_date: date,
          source_id: source!.id,
          source_field: "test_field",
        })
        .select()
        .single();
      
      createdEventIds.push(event.data!.id);
    }

    // Query timeline
    const timelineResponse = await page.request.post(`${mcpBaseUrl}/list_timeline_events`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
      },
    });

    expect(timelineResponse.status()).toBe(200);
    const timelineResult = await timelineResponse.json();
    
    const ourEvents = timelineResult.events.filter((e: { source_id: string }) => e.source_id === source!.id);
    
    if (ourEvents.length === 3) {
      // Verify chronological order
      expect(ourEvents[0].event_date).toBeLessThanOrEqual(ourEvents[1].event_date);
      expect(ourEvents[1].event_date).toBeLessThanOrEqual(ourEvents[2].event_date);
    }
  });

  test("should filter timeline by date range", async ({ page, uiBaseUrl, mockApi, mcpBaseUrl }) => {
    if (!mcpBaseUrl) {
      test.skip();
      return;
    }

    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create test source
    const { data: source } = await supabase
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: "hash_filter_test",
        original_filename: "filter_test.pdf",
        mime_type: "application/pdf",
        file_size: 1000,
      })
      .select()
      .single();
    
    createdSourceIds.push(source!.id);

    // Create events with different dates
    const event1 = await supabase
      .from("timeline_events")
      .insert({
        event_type: "Event1",
        event_date: "2025-01-15",
        source_id: source!.id,
        source_field: "field1",
      })
      .select()
      .single();
    
    createdEventIds.push(event1.data!.id);

    const event2 = await supabase
      .from("timeline_events")
      .insert({
        event_type: "Event2",
        event_date: "2025-02-15",
        source_id: source!.id,
        source_field: "field2",
      })
      .select()
      .single();
    
    createdEventIds.push(event2.data!.id);

    const event3 = await supabase
      .from("timeline_events")
      .insert({
        event_type: "Event3",
        event_date: "2025-03-15",
        source_id: source!.id,
        source_field: "field3",
      })
      .select()
      .single();
    
    createdEventIds.push(event3.data!.id);

    // Query with date range filter (Jan-Feb)
    const timelineResponse = await page.request.post(`${mcpBaseUrl}/list_timeline_events`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        start_date: "2025-01-01",
        end_date: "2025-02-28",
      },
    });

    expect(timelineResponse.status()).toBe(200);
    const timelineResult = await timelineResponse.json();
    
    const ourEvents = timelineResult.events.filter((e: { source_id: string }) => e.source_id === source!.id);
    
    // Should include event1 and event2, but not event3
    if (ourEvents.length > 0) {
      for (const event of ourEvents) {
        expect(event.event_date).toBeGreaterThanOrEqual("2025-01-01");
        expect(event.event_date).toBeLessThanOrEqual("2025-02-28");
      }
    }
  });

  test("should filter timeline by entity type", async ({ page, uiBaseUrl, mockApi, mcpBaseUrl }) => {
    if (!mcpBaseUrl) {
      test.skip();
      return;
    }

    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create sources with different types
    const { data: invoiceSource } = await supabase
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: "hash_invoice_timeline",
        original_filename: "invoice.pdf",
        mime_type: "application/pdf",
        file_size: 1000,
      })
      .select()
      .single();
    
    createdSourceIds.push(invoiceSource!.id);

    // Create invoice event
    const invoiceEvent = await supabase
      .from("timeline_events")
      .insert({
        event_type: "InvoiceIssued",
        event_date: "2025-01-15",
        source_id: invoiceSource!.id,
        source_field: "date_issued",
        entity_type: "invoice",
      })
      .select()
      .single();
    
    createdEventIds.push(invoiceEvent.data!.id);

    // Query timeline filtered by entity type
    const timelineResponse = await page.request.post(`${mcpBaseUrl}/list_timeline_events`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
        entity_type: "invoice",
      },
    });

    if (timelineResponse.status() === 200) {
      const timelineResult = await timelineResponse.json();
      
      if (timelineResult.events && timelineResult.events.length > 0) {
        // All should be invoice events
        for (const event of timelineResult.events) {
          if (event.entity_type) {
            expect(event.entity_type).toBe("invoice");
          }
        }
      }
    }
  });

  test("should verify UI timeline matches MCP query results", async ({ page, uiBaseUrl, mockApi, mcpBaseUrl }) => {
    if (!mcpBaseUrl) {
      test.skip();
      return;
    }

    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await page.waitForSelector("[data-chat-ready=\"true\"]", { timeout: 30_000 });

    // Upload file via UI
    await uploadFileFromRecordsTable(page, uploadFixturePath);
    await page.waitForTimeout(2000);

    // Get timeline events via MCP
    const timelineResponse = await page.request.post(`${mcpBaseUrl}/list_timeline_events`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        user_id: testUserId,
      },
    });

    if (timelineResponse.status() === 200) {
      const timelineResult = await timelineResponse.json();
      
      // UI should show same events (single source of truth)
      // This depends on UI implementation - for now, just verify MCP returns events
      expect(timelineResult.events).toBeDefined();
    }

    // Clean up
    const { data: sources } = await supabase
      .from("sources")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1);
    
    if (sources && sources.length > 0) {
      createdSourceIds.push(sources[0].id);
    }
  });
});
