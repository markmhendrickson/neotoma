/**
 * Unit tests for Payload Identity
 * 
 * Tests payload ID generation, normalization, and deduplication.
 */

import { describe, it, expect } from "vitest";
import {
  normalizePayloadBody,
  computePayloadContentId,
  generatePayloadSubmissionId,
  computePayloadIdentity,
} from "../../src/services/payload_identity.js";
import { getCapability } from "../../src/services/capability_registry.js";
import type { Provenance } from "../../src/services/payload_schema.js";

describe("Payload Identity", () => {
  describe("normalizePayloadBody", () => {
    it("should normalize payload body per capability rules", () => {
      const capability = getCapability("neotoma:store_invoice:v1");
      expect(capability).toBeDefined();
      
      const body = {
        invoice_number: "  INV-001  ",
        amount: 1000,
        vendor_name: "  ACME CORP  ",
        customer_name: "John Doe",
        date: "2025-01-15",
        extra_field: "ignored",
      };
      
      const normalized = normalizePayloadBody(body, capability!);
      
      // Should include fields from body that are in includedFields
      const normalizedKeys = Object.keys(normalized).sort();
      const expectedKeys = capability!.canonicalization_rules.includedFields
        .filter(f => f in body)
        .sort();
      
      expect(normalizedKeys).toEqual(expectedKeys);
      
      // Should normalize strings
      expect(normalized.invoice_number).toBe("inv-001");
      expect(normalized.vendor_name).toBe("acme corp");
      expect(normalized.customer_name).toBe("john doe");
      
      // Should preserve numbers
      expect(normalized.amount).toBe(1000);
      
      // Should not include extra fields
      expect(normalized).not.toHaveProperty("extra_field");
    });

    it("should handle arrays in payload", () => {
      const capability = getCapability("neotoma:store_contract:v1");
      expect(capability).toBeDefined();
      
      const body = {
        contract_number: "CTR-001",
        parties: ["Company B", "Company A"],
        start_date: "2025-01-01",
        end_date: "2026-01-01",
      };
      
      const normalized = normalizePayloadBody(body, capability!);
      
      // Should sort arrays if sortArrays is true
      expect(Array.isArray(normalized.parties)).toBe(true);
      expect(normalized.parties).toEqual(["company a", "company b"]);
    });

    it("should be deterministic for same input", () => {
      const capability = getCapability("neotoma:store_invoice:v1");
      expect(capability).toBeDefined();
      
      const body = {
        invoice_number: "INV-001",
        amount: 1000,
        vendor_name: "Acme",
      };
      
      const normalized1 = normalizePayloadBody(body, capability!);
      const normalized2 = normalizePayloadBody(body, capability!);
      
      expect(normalized1).toEqual(normalized2);
    });
  });

  describe("computePayloadContentId", () => {
    it("should generate deterministic content ID", () => {
      const capabilityId = "neotoma:store_invoice:v1";
      const normalizedBody = {
        invoice_number: "inv-001",
        amount: 1000,
        vendor_name: "acme",
      };
      const provenance: Provenance = {
        source_refs: ["src_abc123"],
        extractor_version: "1.0",
      };
      
      const id1 = computePayloadContentId(capabilityId, normalizedBody, provenance);
      const id2 = computePayloadContentId(capabilityId, normalizedBody, provenance);
      
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^payload_/);
    });

    it("should generate different IDs for different bodies", () => {
      const capabilityId = "neotoma:store_invoice:v1";
      const provenance: Provenance = {
        source_refs: ["src_abc123"],
        extractor_version: "1.0",
      };
      
      const body1 = { invoice_number: "inv-001", amount: 1000 };
      const body2 = { invoice_number: "inv-002", amount: 1000 };
      
      const id1 = computePayloadContentId(capabilityId, body1, provenance);
      const id2 = computePayloadContentId(capabilityId, body2, provenance);
      
      expect(id1).not.toBe(id2);
    });

    it("should generate different IDs for different capabilities", () => {
      const normalizedBody = { amount: 1000 };
      const provenance: Provenance = {
        source_refs: ["src_abc123"],
        extractor_version: "1.0",
      };
      
      const id1 = computePayloadContentId("neotoma:store_invoice:v1", normalizedBody, provenance);
      const id2 = computePayloadContentId("neotoma:store_receipt:v1", normalizedBody, provenance);
      
      expect(id1).not.toBe(id2);
    });

    it("should generate different IDs for different source refs", () => {
      const capabilityId = "neotoma:store_invoice:v1";
      const normalizedBody = { invoice_number: "inv-001" };
      
      const provenance1: Provenance = {
        source_refs: ["src_abc123"],
        extractor_version: "1.0",
      };
      
      const provenance2: Provenance = {
        source_refs: ["src_def456"],
        extractor_version: "1.0",
      };
      
      const id1 = computePayloadContentId(capabilityId, normalizedBody, provenance1);
      const id2 = computePayloadContentId(capabilityId, normalizedBody, provenance2);
      
      expect(id1).not.toBe(id2);
    });

    it("should generate same ID regardless of source ref order", () => {
      const capabilityId = "neotoma:store_invoice:v1";
      const normalizedBody = { invoice_number: "inv-001" };
      
      const provenance1: Provenance = {
        source_refs: ["src_abc", "src_def", "src_ghi"],
        extractor_version: "1.0",
      };
      
      const provenance2: Provenance = {
        source_refs: ["src_ghi", "src_abc", "src_def"], // Different order
        extractor_version: "1.0",
      };
      
      const id1 = computePayloadContentId(capabilityId, normalizedBody, provenance1);
      const id2 = computePayloadContentId(capabilityId, normalizedBody, provenance2);
      
      expect(id1).toBe(id2);
    });

    it("should generate different IDs for different extractor versions", () => {
      const capabilityId = "neotoma:store_invoice:v1";
      const normalizedBody = { invoice_number: "inv-001" };
      
      const provenance1: Provenance = {
        source_refs: ["src_abc123"],
        extractor_version: "1.0",
      };
      
      const provenance2: Provenance = {
        source_refs: ["src_abc123"],
        extractor_version: "2.0",
      };
      
      const id1 = computePayloadContentId(capabilityId, normalizedBody, provenance1);
      const id2 = computePayloadContentId(capabilityId, normalizedBody, provenance2);
      
      expect(id1).not.toBe(id2);
    });
  });

  describe("generatePayloadSubmissionId", () => {
    it("should generate valid submission ID", () => {
      const id = generatePayloadSubmissionId();
      
      expect(id).toMatch(/^sub_/);
      expect(id).toMatch(/^sub_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it("should generate unique IDs", () => {
      const id1 = generatePayloadSubmissionId();
      const id2 = generatePayloadSubmissionId();
      const id3 = generatePayloadSubmissionId();
      
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it("should generate 100 unique IDs", () => {
      const ids = new Set<string>();
      
      for (let i = 0; i < 100; i++) {
        ids.add(generatePayloadSubmissionId());
      }
      
      expect(ids.size).toBe(100);
    });
  });

  describe("computePayloadIdentity", () => {
    it("should compute both IDs", () => {
      const capabilityId = "neotoma:store_invoice:v1";
      const normalizedBody = {
        invoice_number: "inv-001",
        amount: 1000,
      };
      const provenance: Provenance = {
        source_refs: ["src_abc123"],
        extractor_version: "1.0",
      };
      
      const identity = computePayloadIdentity(capabilityId, normalizedBody, provenance);
      
      expect(identity.payload_content_id).toMatch(/^payload_/);
      expect(identity.payload_submission_id).toMatch(/^sub_/);
    });

    it("should generate deterministic content ID but unique submission ID", () => {
      const capabilityId = "neotoma:store_invoice:v1";
      const normalizedBody = {
        invoice_number: "inv-001",
        amount: 1000,
      };
      const provenance: Provenance = {
        source_refs: ["src_abc123"],
        extractor_version: "1.0",
      };
      
      const identity1 = computePayloadIdentity(capabilityId, normalizedBody, provenance);
      const identity2 = computePayloadIdentity(capabilityId, normalizedBody, provenance);
      
      // Content ID should be same (deterministic)
      expect(identity1.payload_content_id).toBe(identity2.payload_content_id);
      
      // Submission ID should be different (unique per submission)
      expect(identity1.payload_submission_id).not.toBe(identity2.payload_submission_id);
    });
  });

  describe("Integration: Full Workflow", () => {
    it("should normalize, then compute content ID deterministically", () => {
      const capability = getCapability("neotoma:store_invoice:v1");
      expect(capability).toBeDefined();
      
      const body1 = {
        invoice_number: "  INV-001  ",
        amount: 1000,
        vendor_name: "  ACME  ",
        customer_name: "John",
      };
      
      const body2 = {
        invoice_number: "inv-001",
        amount: 1000,
        vendor_name: "acme",
        customer_name: "john",
      };
      
      const normalized1 = normalizePayloadBody(body1, capability!);
      const normalized2 = normalizePayloadBody(body2, capability!);
      
      const provenance: Provenance = {
        source_refs: ["src_abc123"],
        extractor_version: "1.0",
      };
      
      const contentId1 = computePayloadContentId(capability!.id, normalized1, provenance);
      const contentId2 = computePayloadContentId(capability!.id, normalized2, provenance);
      
      expect(contentId1).toBe(contentId2);
    });

    it("should compute complete identity with both IDs", () => {
      const capability = getCapability("neotoma:store_transaction:v1");
      expect(capability).toBeDefined();
      
      const body = {
        transaction_id: "TXN-001",
        amount: 500,
        merchant_name: "Store",
      };
      
      const normalized = normalizePayloadBody(body, capability!);
      
      const provenance: Provenance = {
        source_refs: ["src_xyz789"],
        extractor_version: "1.0",
      };
      
      const identity = computePayloadIdentity(capability!.id, normalized, provenance);
      
      expect(identity.payload_content_id).toMatch(/^payload_/);
      expect(identity.payload_submission_id).toMatch(/^sub_/);
      expect(identity.payload_content_id).not.toBe(identity.payload_submission_id);
    });
  });
});
