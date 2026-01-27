/**
 * Integration tests for Event Generation Service
 * 
 * Tests timeline event generation from date fields in records.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { supabase } from "../../src/db.js";
import {
  generateEventId,
  generateEventsForRecord,
} from "../../src/services/event_generation.js";

describe("Event Generation Service", () => {
  const testUserId = "00000000-0000-0000-0000-000000000000";
  const testRecordIds: string[] = [];
  const testEventIds: string[] = [];

  beforeEach(async () => {
    // Clean up test data
    if (testEventIds.length > 0) {
      await supabase.from("timeline_events").delete().in("id", testEventIds);
      testEventIds.length = 0;
    }
  });

  afterEach(async () => {
    // Final cleanup
    if (testEventIds.length > 0) {
      await supabase.from("timeline_events").delete().in("id", testEventIds);
    }
  });

  describe("generateEventId", () => {
    it("should generate deterministic event IDs", () => {
      const recordId = "rec_test_123";
      const fieldName = "date_issued";
      const date = "2025-01-15";
      
      const id1 = generateEventId(recordId, fieldName, date);
      const id2 = generateEventId(recordId, fieldName, date);
      
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^evt_/);
    });

    it("should generate different IDs for different records", () => {
      const date = "2025-01-15";
      const fieldName = "date_issued";
      
      const id1 = generateEventId("rec_test_1", fieldName, date);
      const id2 = generateEventId("rec_test_2", fieldName, date);
      
      expect(id1).not.toBe(id2);
    });

    it("should generate different IDs for different fields", () => {
      const recordId = "rec_test_123";
      const date = "2025-01-15";
      
      const id1 = generateEventId(recordId, "date_issued", date);
      const id2 = generateEventId(recordId, "date_due", date);
      
      expect(id1).not.toBe(id2);
    });

    it("should generate different IDs for different dates", () => {
      const recordId = "rec_test_123";
      const fieldName = "date_issued";
      
      const id1 = generateEventId(recordId, fieldName, "2025-01-15");
      const id2 = generateEventId(recordId, fieldName, "2025-01-16");
      
      expect(id1).not.toBe(id2);
    });
  });

  describe("generateEventsForRecord", () => {
    it("should generate events for invoice dates", async () => {
      const record = {
        id: "rec_test_invoice_events",
        type: "invoice",
        properties: {
          date_issued: "2025-01-15",
          date_due: "2025-02-15",
          invoice_number: "INV-001",
        },
        source_id: "src_test_123",
      };

      const events = await generateEventsForRecord(
        record.id,
        record.type,
        record.properties,
        record.source_id
      );
      
      expect(events).toBeDefined();
      expect(events.length).toBeGreaterThan(0);
      
      // Should generate events for date_issued and date_due
      const issuedEvent = events.find(e => e.source_field === "date_issued");
      const dueEvent = events.find(e => e.source_field === "date_due");
      
      expect(issuedEvent).toBeDefined();
      expect(issuedEvent!.event_type).toBe("InvoiceIssued");
      expect(issuedEvent!.event_timestamp).toContain("2025-01-15");
      
      expect(dueEvent).toBeDefined();
      expect(dueEvent!.event_type).toBe("InvoiceDue");
      expect(dueEvent!.event_timestamp).toContain("2025-02-15");
      
      // Track for cleanup
      for (const event of events) {
        testEventIds.push(event.id);
      }
    });

    it("should generate events for transaction dates", async () => {
      const record = {
        id: "rec_test_transaction_events",
        type: "transaction",
        properties: {
          date: "2025-01-20",
          amount: 100,
        },
        source_id: "src_test_456",
      };

      const events = await generateEventsForRecord(
        record.id,
        record.type,
        record.properties,
        record.source_id
      );
      
      expect(events).toBeDefined();
      expect(events.length).toBeGreaterThan(0);
      
      const transactionEvent = events.find(e => e.source_field === "date");
      expect(transactionEvent).toBeDefined();
      expect(transactionEvent!.event_type).toBe("TransactionOccurred");
      
      for (const event of events) {
        testEventIds.push(event.id);
      }
    });

    it("should generate events for travel document dates", async () => {
      const record = {
        id: "rec_test_travel_events",
        type: "travel_document",
        properties: {
          departure_datetime: "2025-03-15T10:00:00Z",
          arrival_datetime: "2025-03-15T14:00:00Z",
        },
        source_id: "src_test_789",
      };

      const events = await generateEventsForRecord(
        record.id,
        record.type,
        record.properties,
        record.source_id
      );
      
      expect(events.length).toBeGreaterThan(0);
      
      const departureEvent = events.find(e => e.source_field === "departure_datetime");
      const arrivalEvent = events.find(e => e.source_field === "arrival_datetime");
      
      expect(departureEvent).toBeDefined();
      expect(departureEvent!.event_type).toBe("FlightDeparture");
      
      expect(arrivalEvent).toBeDefined();
      expect(arrivalEvent!.event_type).toBe("FlightArrival");
      
      for (const event of events) {
        testEventIds.push(event.id);
      }
    });

    it("should handle records with no date fields", async () => {
      const record = {
        id: "rec_test_no_dates",
        type: "note",
        properties: {
          title: "Test Note",
          content: "No dates here",
        },
        source_id: "src_test_000",
      };

      const events = await generateEventsForRecord(
        record.id,
        record.type,
        record.properties,
        record.source_id
      );
      
      expect(events).toBeDefined();
      expect(events.length).toBe(0); // No date fields, no events
    });

    it("should skip invalid date fields", async () => {
      const record = {
        id: "rec_test_invalid_dates",
        type: "invoice",
        properties: {
          date_issued: "invalid-date",
          date_due: "2025-02-15", // Valid
        },
        source_id: "src_test_invalid",
      };

      const events = await generateEventsForRecord(
        record.id,
        record.type,
        record.properties,
        record.source_id
      );
      
      // Should generate event for valid date only
      expect(events.length).toBe(1);
      expect(events[0].source_field).toBe("date_due");
      
      for (const event of events) {
        testEventIds.push(event.id);
      }
    });

    it("should handle missing date fields gracefully", async () => {
      const record = {
        id: "rec_test_missing_dates",
        type: "invoice",
        properties: {
          invoice_number: "INV-002",
          amount: 1000,
          // No date fields
        },
        source_id: "src_test_missing",
      };

      const events = await generateEventsForRecord(
        record.id,
        record.type,
        record.properties,
        record.source_id
      );
      
      expect(events).toBeDefined();
      expect(events.length).toBe(0);
    });

    it("should store events in database", async () => {
      const record = {
        id: "rec_test_store_events",
        type: "invoice",
        properties: {
          date_issued: "2025-01-25",
          invoice_number: "INV-003",
        },
        source_id: "src_test_store",
      };

      const events = await generateEventsForRecord(
        record.id,
        record.type,
        record.properties,
        record.source_id
      );
      
      expect(events.length).toBeGreaterThan(0);
      
      const eventId = events[0].id;
      testEventIds.push(eventId);

      // Verify event was stored in database
      const { data: storedEvent, error } = await supabase
        .from("timeline_events")
        .select("*")
        .eq("id", eventId)
        .single();
      
      expect(error).toBeNull();
      expect(storedEvent).toBeDefined();
      expect(storedEvent!.event_type).toBe("InvoiceIssued");
      expect(storedEvent!.source_field).toBe("date_issued");
    });

    it("should deduplicate events for same record+field+date", async () => {
      const record = {
        id: "rec_test_dedup_events",
        type: "invoice",
        properties: {
          date_issued: "2025-01-26",
        },
        source_id: "src_test_dedup",
      };

      // Generate events twice
      const events1 = await generateEventsForRecord(
        record.id,
        record.type,
        record.properties,
        record.source_id
      );
      
      const events2 = await generateEventsForRecord(
        record.id,
        record.type,
        record.properties,
        record.source_id
      );
      
      expect(events1.length).toBeGreaterThan(0);
      expect(events1[0].id).toBe(events2[0].id); // Same ID (deterministic)
      
      for (const event of events1) {
        testEventIds.push(event.id);
      }
    });
  });

  describe("Event Type Mapping", () => {
    it("should map invoice date fields to correct event types", async () => {
      const record = {
        id: "rec_test_invoice_mapping",
        type: "invoice",
        properties: {
          date_issued: "2025-01-15",
          date_due: "2025-02-15",
          date_paid: "2025-02-10",
        },
        source_id: "src_test_mapping",
      };

      const events = await generateEventsForRecord(
        record.id,
        record.type,
        record.properties,
        record.source_id
      );
      
      expect(events.length).toBe(3);
      
      const eventTypes = events.map(e => e.event_type);
      expect(eventTypes).toContain("InvoiceIssued");
      expect(eventTypes).toContain("InvoiceDue");
      expect(eventTypes).toContain("InvoicePaid");
      
      for (const event of events) {
        testEventIds.push(event.id);
      }
    });

    it("should map contract date fields correctly", async () => {
      const record = {
        id: "rec_test_contract_mapping",
        type: "contract",
        properties: {
          date_signed: "2025-01-01",
          effective_date: "2025-01-15",
          expiration_date: "2026-01-15",
        },
        source_id: "src_test_contract",
      };

      const events = await generateEventsForRecord(
        record.id,
        record.type,
        record.properties,
        record.source_id
      );
      
      expect(events.length).toBe(3);
      
      const eventTypes = events.map(e => e.event_type);
      expect(eventTypes).toContain("ContractSigned");
      expect(eventTypes).toContain("ContractEffective");
      expect(eventTypes).toContain("ContractExpired");
      
      for (const event of events) {
        testEventIds.push(event.id);
      }
    });
  });

  describe("Date Parsing", () => {
    it("should handle various date formats", async () => {
      const dateFormats = [
        "2025-01-15",
        "2025-01-15T10:00:00Z",
        "2025-01-15T10:00:00.000Z",
      ];
      
      let idx = 0;
      for (const dateFormat of dateFormats) {
        const record = {
          id: `rec_test_date_format_${idx}`,
          type: "invoice",
          properties: {
            date_issued: dateFormat,
          },
          source_id: `src_test_format_${idx}`,
        };

        const events = await generateEventsForRecord(
          record.id,
          record.type,
          record.properties,
          record.source_id
        );
        
        expect(events.length).toBe(1);
        expect(events[0].event_timestamp).toBeDefined();
        
        testEventIds.push(events[0].id);
        idx++;
      }
    });
  });
});
