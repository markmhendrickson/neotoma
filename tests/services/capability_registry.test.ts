/**
 * Unit tests for Capability Registry
 * 
 * Tests capability lookup, versioning, and intent-based retrieval.
 */

import { describe, it, expect } from "vitest";
import {
  getCapability,
  listCapabilities,
  hasCapability,
  getCapabilitiesByIntent,
  getLatestCapability,
  type Capability,
} from "../../src/services/capability_registry.js";

describe("Capability Registry", () => {
  describe("getCapability", () => {
    it("should return capability by ID", () => {
      const capability = getCapability("neotoma:store_invoice:v1");
      expect(capability).toBeDefined();
      expect(capability?.id).toBe("neotoma:store_invoice:v1");
      expect(capability?.intent).toBe("store_invoice");
      expect(capability?.version).toBe("v1");
      expect(capability?.primary_entity_type).toBe("invoice");
    });

    it("should return null for non-existent capability", () => {
      const capability = getCapability("neotoma:invalid:v1");
      expect(capability).toBeNull();
    });

    it("should return transaction capability", () => {
      const capability = getCapability("neotoma:store_transaction:v1");
      expect(capability).toBeDefined();
      expect(capability?.primary_entity_type).toBe("transaction");
      expect(capability?.entity_extraction_rules).toBeDefined();
      expect(capability?.entity_extraction_rules.length).toBeGreaterThan(0);
    });

    it("should return receipt capability", () => {
      const capability = getCapability("neotoma:store_receipt:v1");
      expect(capability).toBeDefined();
      expect(capability?.primary_entity_type).toBe("receipt");
    });

    it("should return contract capability", () => {
      const capability = getCapability("neotoma:store_contract:v1");
      expect(capability).toBeDefined();
      expect(capability?.primary_entity_type).toBe("contract");
    });

    it("should return note capability", () => {
      const capability = getCapability("neotoma:store_note:v1");
      expect(capability).toBeDefined();
      expect(capability?.primary_entity_type).toBe("note");
    });
  });

  describe("listCapabilities", () => {
    it("should return all capabilities", () => {
      const capabilities = listCapabilities();
      expect(capabilities).toBeDefined();
      expect(Array.isArray(capabilities)).toBe(true);
      expect(capabilities.length).toBeGreaterThan(0);
    });

    it("should return capabilities with required fields", () => {
      const capabilities = listCapabilities();
      
      for (const cap of capabilities) {
        expect(cap.id).toBeDefined();
        expect(cap.intent).toBeDefined();
        expect(cap.version).toBeDefined();
        expect(cap.primary_entity_type).toBeDefined();
        expect(cap.schema_version).toBeDefined();
        expect(cap.canonicalization_rules).toBeDefined();
        expect(cap.entity_extraction_rules).toBeDefined();
      }
    });

    it("should include known capabilities", () => {
      const capabilities = listCapabilities();
      const ids = capabilities.map(c => c.id);
      
      expect(ids).toContain("neotoma:store_invoice:v1");
      expect(ids).toContain("neotoma:store_transaction:v1");
      expect(ids).toContain("neotoma:store_receipt:v1");
      expect(ids).toContain("neotoma:store_contract:v1");
      expect(ids).toContain("neotoma:store_note:v1");
    });
  });

  describe("hasCapability", () => {
    it("should return true for existing capability", () => {
      expect(hasCapability("neotoma:store_invoice:v1")).toBe(true);
      expect(hasCapability("neotoma:store_transaction:v1")).toBe(true);
    });

    it("should return false for non-existent capability", () => {
      expect(hasCapability("neotoma:invalid:v1")).toBe(false);
      expect(hasCapability("neotoma:store_invoice:v999")).toBe(false);
    });
  });

  describe("getCapabilitiesByIntent", () => {
    it("should return capabilities matching intent", () => {
      const capabilities = getCapabilitiesByIntent("store_invoice");
      expect(capabilities.length).toBeGreaterThan(0);
      
      for (const cap of capabilities) {
        expect(cap.intent).toBe("store_invoice");
      }
    });

    it("should return empty array for non-existent intent", () => {
      const capabilities = getCapabilitiesByIntent("invalid_intent");
      expect(capabilities).toEqual([]);
    });

    it("should return transaction capabilities", () => {
      const capabilities = getCapabilitiesByIntent("store_transaction");
      expect(capabilities.length).toBeGreaterThan(0);
      expect(capabilities[0].intent).toBe("store_transaction");
    });
  });

  describe("getLatestCapability", () => {
    it("should return latest version for intent", () => {
      const latest = getLatestCapability("store_invoice");
      expect(latest).toBeDefined();
      expect(latest?.intent).toBe("store_invoice");
      expect(latest?.version).toBe("v1"); // Currently only v1 exists
    });

    it("should return null for non-existent intent", () => {
      const latest = getLatestCapability("invalid_intent");
      expect(latest).toBeNull();
    });

    it("should sort versions correctly", () => {
      // Test with transaction which only has v1
      const latest = getLatestCapability("store_transaction");
      expect(latest).toBeDefined();
      expect(latest?.version).toBe("v1");
    });

    it("should return highest version number", () => {
      // All current capabilities are v1, so latest should be v1
      const invoiceLatest = getLatestCapability("store_invoice");
      const transactionLatest = getLatestCapability("store_transaction");
      const receiptLatest = getLatestCapability("store_receipt");
      
      expect(invoiceLatest?.version).toBe("v1");
      expect(transactionLatest?.version).toBe("v1");
      expect(receiptLatest?.version).toBe("v1");
    });
  });

  describe("Capability Structure", () => {
    it("should have valid canonicalization rules", () => {
      const capability = getCapability("neotoma:store_invoice:v1");
      expect(capability).toBeDefined();
      
      const rules = capability!.canonicalization_rules;
      expect(rules.includedFields).toBeDefined();
      expect(Array.isArray(rules.includedFields)).toBe(true);
      expect(rules.includedFields.length).toBeGreaterThan(0);
      expect(rules.normalizeStrings).toBe(true);
      expect(rules.sortArrays).toBe(true);
    });

    it("should have valid entity extraction rules", () => {
      const capability = getCapability("neotoma:store_invoice:v1");
      expect(capability).toBeDefined();
      
      const rules = capability!.entity_extraction_rules;
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
      
      for (const rule of rules) {
        expect(rule.entity_type).toBeDefined();
        expect(rule.extraction_type).toBeDefined();
        expect(["field_value", "payload_self", "array_items"]).toContain(
          rule.extraction_type
        );
      }
    });

    it("should extract entities from payload self", () => {
      const capability = getCapability("neotoma:store_invoice:v1");
      const selfRule = capability!.entity_extraction_rules.find(
        r => r.extraction_type === "payload_self"
      );
      
      expect(selfRule).toBeDefined();
      expect(selfRule?.entity_type).toBe("invoice");
    });

    it("should extract entities from field values", () => {
      const capability = getCapability("neotoma:store_invoice:v1");
      const fieldRules = capability!.entity_extraction_rules.filter(
        r => r.extraction_type === "field_value"
      );
      
      expect(fieldRules.length).toBeGreaterThan(0);
      
      for (const rule of fieldRules) {
        expect(rule.source_field).toBeDefined();
        expect(rule.entity_type).toBeDefined();
      }
    });

    it("should extract entities from array items", () => {
      const capability = getCapability("neotoma:store_contract:v1");
      const arrayRule = capability!.entity_extraction_rules.find(
        r => r.extraction_type === "array_items"
      );
      
      expect(arrayRule).toBeDefined();
      expect(arrayRule?.source_field).toBe("parties");
      expect(arrayRule?.entity_type).toBe("company");
    });
  });

  describe("Capability Consistency", () => {
    it("should have unique IDs", () => {
      const capabilities = listCapabilities();
      const ids = capabilities.map(c => c.id);
      const uniqueIds = new Set(ids);
      
      expect(ids.length).toBe(uniqueIds.size);
    });

    it("should have consistent ID format", () => {
      const capabilities = listCapabilities();
      
      for (const cap of capabilities) {
        expect(cap.id).toMatch(/^neotoma:\w+:v\d+$/);
        expect(cap.id).toBe(`neotoma:${cap.intent}:${cap.version}`);
      }
    });

    it("should have schema versions", () => {
      const capabilities = listCapabilities();
      
      for (const cap of capabilities) {
        expect(cap.schema_version).toBeDefined();
        expect(typeof cap.schema_version).toBe("string");
        expect(cap.schema_version.length).toBeGreaterThan(0);
      }
    });
  });
});
