/**
 * Payload Submission Integration Tests
 *
 * Tests the complete payload submission, deduplication, and compilation pipeline.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { compilePayload } from "../../../src/services/payload_compiler.js";
import { getCapability } from "../../../src/services/capability_registry.js";
import type { PayloadEnvelope } from "../../../src/services/payload_schema.js";
import { supabase } from "../../../src/db.js";

describe("Payload Submission Integration Tests", () => {
  const testUserId = "00000000-0000-0000-0000-000000000000";

  beforeAll(async () => {
    // Clean up test data
    await supabase
      .from("observations")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase
      .from("payload_submissions")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
  });

  afterAll(async () => {
    // Clean up test data
    await supabase
      .from("observations")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase
      .from("payload_submissions")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
  });

  describe("Capability Lookup", () => {
    it("should find invoice capability", () => {
      const capability = getCapability("neotoma:store_invoice:v1");
      expect(capability).toBeDefined();
      expect(capability?.intent).toBe("store_invoice");
      expect(capability?.version).toBe("v1");
      expect(capability?.primary_entity_type).toBe("invoice");
    });

    it("should return null for unknown capability", () => {
      const capability = getCapability("neotoma:unknown:v1");
      expect(capability).toBeNull();
    });
  });

  describe("Payload Submission", () => {
    it("should create payload from envelope", async () => {
      const envelope: PayloadEnvelope = {
        capability_id: "neotoma:store_invoice:v1",
        body: {
          invoice_number: "INV-001",
          amount: 1000,
          vendor_name: "Acme Corp",
          customer_name: "Test Customer",
          date: "2025-01-15",
        },
        provenance: {
          source_refs: [],
          extracted_at: new Date().toISOString(),
          extractor_version: "neotoma-mcp:v0.2.1",
          agent_id: "test-agent",
        },
      };

      const result = await compilePayload(envelope, { userId: testUserId });

      expect(result.payload_id).toBeDefined();
      expect(result.payload_content_id).toBeDefined();
      expect(result.payload_submission_id).toBeDefined();
      expect(result.created).toBe(true);

      // Verify payload in database
      const { data: payload } = await supabase
        .from("payload_submissions")
        .select("*")
        .eq("id", result.payload_id)
        .single();

      expect(payload).toBeDefined();
      expect(payload.capability_id).toBe("neotoma:store_invoice:v1");
      expect(payload.body).toEqual(envelope.body);
    });
  });

  describe("Deduplication", () => {
    it("should return existing payload for duplicate submission", async () => {
      const envelope: PayloadEnvelope = {
        capability_id: "neotoma:store_invoice:v1",
        body: {
          invoice_number: "INV-002",
          amount: 2000,
          vendor_name: "Test Vendor",
          customer_name: "Test Customer",
          date: "2025-01-16",
        },
        provenance: {
          source_refs: [],
          extracted_at: "2025-01-16T10:00:00Z",
          extractor_version: "neotoma-mcp:v0.2.1",
        },
      };

      // First submission
      const result1 = await compilePayload(envelope, { userId: testUserId });
      expect(result1.created).toBe(true);

      // Second submission (duplicate)
      const result2 = await compilePayload(envelope, { userId: testUserId });
      expect(result2.created).toBe(false);
      expect(result2.payload_content_id).toBe(result1.payload_content_id);
      expect(result2.payload_id).toBe(result1.payload_id);
    });

    it("should create new payload for different data", async () => {
      const envelope1: PayloadEnvelope = {
        capability_id: "neotoma:store_invoice:v1",
        body: {
          invoice_number: "INV-003",
          amount: 3000,
          vendor_name: "Vendor A",
          customer_name: "Customer A",
          date: "2025-01-17",
        },
        provenance: {
          source_refs: [],
          extracted_at: new Date().toISOString(),
          extractor_version: "neotoma-mcp:v0.2.1",
        },
      };

      const envelope2: PayloadEnvelope = {
        ...envelope1,
        body: {
          ...envelope1.body,
          amount: 3500, // Different amount
        },
      };

      const result1 = await compilePayload(envelope1, { userId: testUserId });
      const result2 = await compilePayload(envelope2, { userId: testUserId });

      expect(result1.payload_content_id).not.toBe(result2.payload_content_id);
      expect(result1.payload_id).not.toBe(result2.payload_id);
    });
  });

  describe("Entity Extraction", () => {
    it("should extract primary entity (payload itself)", async () => {
      const envelope: PayloadEnvelope = {
        capability_id: "neotoma:store_note:v1",
        body: {
          title: "Test Note",
          content: "This is a test note",
        },
        provenance: {
          source_refs: [],
          extracted_at: new Date().toISOString(),
          extractor_version: "neotoma-mcp:v0.2.1",
        },
      };

      const result = await compilePayload(envelope, { userId: testUserId });

      // Verify observations created
      const { data: observations } = await supabase
        .from("observations")
        .select("*")
        .eq("source_payload_id", result.payload_id);

      expect(observations).toBeDefined();
      expect(observations!.length).toBeGreaterThan(0);

      // Should have note entity
      const noteObs = observations!.find((obs) => obs.entity_type === "note");
      expect(noteObs).toBeDefined();
    });

    it("should extract field value entities", async () => {
      const envelope: PayloadEnvelope = {
        capability_id: "neotoma:store_invoice:v1",
        body: {
          invoice_number: "INV-004",
          amount: 4000,
          vendor_name: "Vendor X",
          customer_name: "Customer Y",
          date: "2025-01-18",
        },
        provenance: {
          source_refs: [],
          extracted_at: new Date().toISOString(),
          extractor_version: "neotoma-mcp:v0.2.1",
        },
      };

      const result = await compilePayload(envelope, { userId: testUserId });

      // Verify observations created
      const { data: observations } = await supabase
        .from("observations")
        .select("*")
        .eq("source_payload_id", result.payload_id);

      expect(observations).toBeDefined();

      // Should have invoice entity and company entities
      const invoiceObs = observations!.find(
        (obs) => obs.entity_type === "invoice"
      );
      const companyObs = observations!.filter(
        (obs) => obs.entity_type === "company"
      );

      expect(invoiceObs).toBeDefined();
      expect(companyObs.length).toBeGreaterThanOrEqual(1); // At least vendor or customer
    });

    it("should extract array item entities", async () => {
      const envelope: PayloadEnvelope = {
        capability_id: "neotoma:store_note:v1",
        body: {
          title: "Project Tasks",
          content: "Project task list",
          tasks: ["Design UI", "Implement API", "Write tests"],
        },
        provenance: {
          source_refs: [],
          extracted_at: new Date().toISOString(),
          extractor_version: "neotoma-mcp:v0.2.1",
        },
      };

      const result = await compilePayload(envelope, { userId: testUserId });

      // Verify observations created
      const { data: observations } = await supabase
        .from("observations")
        .select("*")
        .eq("source_payload_id", result.payload_id);

      expect(observations).toBeDefined();

      // Should have note entity and task entities
      const noteObs = observations!.find((obs) => obs.entity_type === "note");
      const taskObs = observations!.filter((obs) => obs.entity_type === "task");

      expect(noteObs).toBeDefined();
      expect(taskObs.length).toBe(3); // Three tasks
    });
  });

  describe("Normalization", () => {
    it("should normalize strings in hash computation", async () => {
      const envelope1: PayloadEnvelope = {
        capability_id: "neotoma:store_invoice:v1",
        body: {
          invoice_number: "INV-005",
          amount: 5000,
          vendor_name: "Acme Corp",
          customer_name: "Test Customer",
          date: "2025-01-19",
        },
        provenance: {
          source_refs: [],
          extracted_at: new Date().toISOString(),
          extractor_version: "neotoma-mcp:v0.2.1",
        },
      };

      const envelope2: PayloadEnvelope = {
        ...envelope1,
        body: {
          ...envelope1.body,
          vendor_name: "  ACME CORP  ", // Different casing and whitespace
        },
      };

      const result1 = await compilePayload(envelope1, { userId: testUserId });
      const result2 = await compilePayload(envelope2, { userId: testUserId });

      // Should deduplicate (same content after normalization)
      expect(result2.payload_content_id).toBe(result1.payload_content_id);
      expect(result2.created).toBe(false);
    });
  });
});


