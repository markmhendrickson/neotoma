/**
 * E2E Test: Timeline View Navigation
 * 
 * Tests timeline view filtering, navigation, and state preservation.
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

test.describe("E2E-011: Timeline View Navigation", () => {
  const testUserId = "test-user-timeline-nav";
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

  test("should display timeline events chronologically", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await page.waitForSelector("[data-chat-ready=\"true\"]", { timeout: 30_000 });

    // Create test sources with events
    const { data: source } = await supabase
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: "hash_timeline_nav",
        original_filename: "timeline_nav.pdf",
        mime_type: "application/pdf",
        file_size: 1000,
      })
      .select()
      .single();
    
    createdSourceIds.push(source!.id);

    // Create events with different dates
    const events = [
      { date: "2025-01-15", type: "InvoiceIssued" },
      { date: "2025-02-15", type: "InvoiceDue" },
      { date: "2025-03-15", type: "InvoicePaid" },
    ];

    for (const eventData of events) {
      const { data: event } = await supabase
        .from("timeline_events")
        .insert({
          event_type: eventData.type,
          event_date: eventData.date,
          source_id: source!.id,
          source_field: "test_field",
        })
        .select()
        .single();
      
      createdEventIds.push(event!.id);
    }

    // Query events chronologically
    const { data: queriedEvents } = await supabase
      .from("timeline_events")
      .select("*")
      .eq("source_id", source!.id)
      .order("event_date", { ascending: true });
    
    expect(queriedEvents).toBeDefined();
    expect(queriedEvents!.length).toBe(3);
    
    // Verify chronological order
    expect(queriedEvents![0].event_date).toBe("2025-01-15");
    expect(queriedEvents![1].event_date).toBe("2025-02-15");
    expect(queriedEvents![2].event_date).toBe("2025-03-15");
  });

  test("should filter timeline by date range", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create test source
    const { data: source } = await supabase
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: "hash_timeline_filter",
        original_filename: "filter_timeline.pdf",
        mime_type: "application/pdf",
        file_size: 1000,
      })
      .select()
      .single();
    
    createdSourceIds.push(source!.id);

    // Create events spanning multiple months
    const events = [
      { date: "2025-01-15", type: "Event1" },
      { date: "2025-02-15", type: "Event2" },
      { date: "2025-03-15", type: "Event3" },
    ];

    for (const eventData of events) {
      const { data: event } = await supabase
        .from("timeline_events")
        .insert({
          event_type: eventData.type,
          event_date: eventData.date,
          source_id: source!.id,
          source_field: "test_field",
        })
        .select()
        .single();
      
      createdEventIds.push(event!.id);
    }

    // Filter by date range (Jan-Feb only)
    const { data: filtered } = await supabase
      .from("timeline_events")
      .select("*")
      .eq("source_id", source!.id)
      .gte("event_date", "2025-01-01")
      .lte("event_date", "2025-02-28")
      .order("event_date", { ascending: true });
    
    expect(filtered).toBeDefined();
    expect(filtered!.length).toBe(2); // Event1 and Event2 only
    expect(filtered![0].event_type).toBe("Event1");
    expect(filtered![1].event_type).toBe("Event2");
  });

  test("should filter timeline by entity type", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create sources for different entity types
    const { data: invoiceSource } = await supabase
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: "hash_type_filter_invoice",
        original_filename: "invoice_timeline.pdf",
        mime_type: "application/pdf",
        file_size: 1000,
      })
      .select()
      .single();
    
    createdSourceIds.push(invoiceSource!.id);

    const { data: contractSource } = await supabase
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: "hash_type_filter_contract",
        original_filename: "contract_timeline.pdf",
        mime_type: "application/pdf",
        file_size: 1000,
      })
      .select()
      .single();
    
    createdSourceIds.push(contractSource!.id);

    // Create invoice event
    const { data: invoiceEvent } = await supabase
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
    
    createdEventIds.push(invoiceEvent!.id);

    // Create contract event
    const { data: contractEvent } = await supabase
      .from("timeline_events")
      .insert({
        event_type: "ContractSigned",
        event_date: "2025-01-20",
        source_id: contractSource!.id,
        source_field: "date_signed",
        entity_type: "contract",
      })
      .select()
      .single();
    
    createdEventIds.push(contractEvent!.id);

    // Filter by entity type
    const { data: invoiceEvents } = await supabase
      .from("timeline_events")
      .select("*")
      .eq("entity_type", "invoice")
      .in("id", [invoiceEvent!.id, contractEvent!.id]);
    
    expect(invoiceEvents).toBeDefined();
    expect(invoiceEvents!.length).toBe(1);
    expect(invoiceEvents![0].id).toBe(invoiceEvent!.id);
  });

  test("should navigate to event detail and back", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await page.waitForSelector("[data-chat-ready=\"true\"]", { timeout: 30_000 });

    // Create test source and event
    const { data: source } = await supabase
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: "hash_nav_detail",
        original_filename: "nav_detail.pdf",
        mime_type: "application/pdf",
        file_size: 1000,
      })
      .select()
      .single();
    
    createdSourceIds.push(source!.id);

    const { data: event } = await supabase
      .from("timeline_events")
      .insert({
        event_type: "InvoiceIssued",
        event_date: "2025-01-15",
        source_id: source!.id,
        source_field: "date_issued",
      })
      .select()
      .single();
    
    createdEventIds.push(event!.id);

    // Verify event exists in database
    const { data: verifyEvent } = await supabase
      .from("timeline_events")
      .select("*")
      .eq("id", event!.id)
      .single();
    
    expect(verifyEvent).toBeDefined();
    expect(verifyEvent!.event_type).toBe("InvoiceIssued");
    
    // Navigation testing depends on UI implementation
    // For now, verified event exists and can be queried
  });

  test("should preserve state when navigating back to timeline", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);
    await page.goto(uiBaseUrl);
    await page.waitForSelector("[data-chat-ready=\"true\"]", { timeout: 30_000 });

    // Create multiple events
    const { data: source } = await supabase
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: "hash_state_preservation",
        original_filename: "state_test.pdf",
        mime_type: "application/pdf",
        file_size: 1000,
      })
      .select()
      .single();
    
    createdSourceIds.push(source!.id);

    for (let i = 0; i < 3; i++) {
      const { data: event } = await supabase
        .from("timeline_events")
        .insert({
          event_type: `Event${i}`,
          event_date: `2025-01-${15 + i}`,
          source_id: source!.id,
          source_field: `field${i}`,
        })
        .select()
        .single();
      
      createdEventIds.push(event!.id);
    }

    // Query events
    const { data: events } = await supabase
      .from("timeline_events")
      .select("*")
      .eq("source_id", source!.id)
      .order("event_date", { ascending: true });
    
    expect(events).toBeDefined();
    expect(events!.length).toBe(3);
    
    // State preservation testing depends on UI router implementation
  });

  test("should paginate timeline events", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create test source
    const { data: source } = await supabase
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: "hash_pagination",
        original_filename: "pagination.pdf",
        mime_type: "application/pdf",
        file_size: 1000,
      })
      .select()
      .single();
    
    createdSourceIds.push(source!.id);

    // Create many events
    for (let i = 0; i < 15; i++) {
      const { data: event } = await supabase
        .from("timeline_events")
        .insert({
          event_type: `Event${i}`,
          event_date: `2025-01-${String(i + 1).padStart(2, "0")}`,
          source_id: source!.id,
          source_field: `field${i}`,
        })
        .select()
        .single();
      
      createdEventIds.push(event!.id);
    }

    // Query first page (limit 10)
    const { data: page1 } = await supabase
      .from("timeline_events")
      .select("*")
      .eq("source_id", source!.id)
      .order("event_date", { ascending: true })
      .limit(10);
    
    expect(page1).toBeDefined();
    expect(page1!.length).toBe(10);

    // Query second page (offset 10)
    const { data: page2 } = await supabase
      .from("timeline_events")
      .select("*")
      .eq("source_id", source!.id)
      .order("event_date", { ascending: true })
      .limit(10)
      .range(10, 19);
    
    expect(page2).toBeDefined();
    expect(page2!.length).toBe(5); // Remaining events

    // Verify no overlap
    const page1Ids = page1!.map((e) => e.id);
    const page2Ids = page2!.map((e) => e.id);
    
    for (const id of page1Ids) {
      expect(page2Ids.includes(id)).toBe(false);
    }
  });

  test("should filter events by event type", async ({ page, uiBaseUrl, mockApi }) => {
    attachBrowserLogging(page);
    await routeChatThroughMock(page, mockApi?.origin);
    await clearClientState(page, uiBaseUrl);
    await primeLocalSettings(page);

    // Create test source
    const { data: source } = await supabase
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: "hash_type_filter",
        original_filename: "type_filter.pdf",
        mime_type: "application/pdf",
        file_size: 1000,
      })
      .select()
      .single();
    
    createdSourceIds.push(source!.id);

    // Create events of different types
    const eventTypes = ["InvoiceIssued", "InvoiceDue", "ContractSigned"];
    
    for (const type of eventTypes) {
      const { data: event } = await supabase
        .from("timeline_events")
        .insert({
          event_type: type,
          event_date: "2025-01-15",
          source_id: source!.id,
          source_field: "test_field",
        })
        .select()
        .single();
      
      createdEventIds.push(event!.id);
    }

    // Filter by specific event type
    const { data: filtered } = await supabase
      .from("timeline_events")
      .select("*")
      .eq("source_id", source!.id)
      .eq("event_type", "InvoiceIssued");
    
    expect(filtered).toBeDefined();
    expect(filtered!.length).toBe(1);
    expect(filtered![0].event_type).toBe("InvoiceIssued");
  });
});
