/**
 * Unit tests for Payload Schema
 * 
 * Tests payload envelope validation and schema enforcement.
 */

import { describe, it, expect } from "vitest";
import {
  validatePayloadEnvelope,
  validateProvenance,
  type PayloadEnvelope,
  type Provenance,
} from "../../src/services/payload_schema.js";

describe("Payload Schema", () => {
  describe("validateProvenance", () => {
    it("should validate valid provenance", () => {
      const provenance = {
        source_refs: ["src_abc123"],
        extracted_at: "2025-01-15T10:00:00Z",
        extractor_version: "neotoma-mcp:v0.2.1",
      };
      
      const validated = validateProvenance(provenance);
      
      expect(validated.source_refs).toEqual(["src_abc123"]);
      expect(validated.extracted_at).toBe("2025-01-15T10:00:00Z");
      expect(validated.extractor_version).toBe("neotoma-mcp:v0.2.1");
    });

    it("should validate provenance with agent_id", () => {
      const provenance = {
        source_refs: ["src_abc123"],
        extracted_at: "2025-01-15T10:00:00Z",
        extractor_version: "neotoma-mcp:v0.2.1",
        agent_id: "cursor-agent-1",
      };
      
      const validated = validateProvenance(provenance);
      
      expect(validated.agent_id).toBe("cursor-agent-1");
    });

    it("should reject provenance without source_refs", () => {
      const invalid = {
        extracted_at: "2025-01-15T10:00:00Z",
        extractor_version: "v1.0",
      };
      
      expect(() => validateProvenance(invalid)).toThrow();
    });

    it("should reject provenance without extracted_at", () => {
      const invalid = {
        source_refs: ["src_abc123"],
        extractor_version: "v1.0",
      };
      
      expect(() => validateProvenance(invalid)).toThrow();
    });

    it("should reject provenance without extractor_version", () => {
      const invalid = {
        source_refs: ["src_abc123"],
        extracted_at: "2025-01-15T10:00:00Z",
      };
      
      expect(() => validateProvenance(invalid)).toThrow();
    });

    it("should reject invalid datetime format", () => {
      const invalid = {
        source_refs: ["src_abc123"],
        extracted_at: "2025-01-15", // Not datetime
        extractor_version: "v1.0",
      };
      
      expect(() => validateProvenance(invalid)).toThrow();
    });

    it("should validate empty source_refs array", () => {
      const provenance = {
        source_refs: [],
        extracted_at: "2025-01-15T10:00:00Z",
        extractor_version: "v1.0",
      };
      
      const validated = validateProvenance(provenance);
      
      expect(validated.source_refs).toEqual([]);
    });

    it("should validate multiple source_refs", () => {
      const provenance = {
        source_refs: ["src_abc", "src_def", "src_ghi"],
        extracted_at: "2025-01-15T10:00:00Z",
        extractor_version: "v1.0",
      };
      
      const validated = validateProvenance(provenance);
      
      expect(validated.source_refs).toEqual(["src_abc", "src_def", "src_ghi"]);
    });
  });

  describe("validatePayloadEnvelope", () => {
    it("should validate valid payload envelope", () => {
      const envelope = {
        capability_id: "neotoma:store_invoice:v1",
        body: {
          invoice_number: "INV-001",
          amount: 1000,
        },
        provenance: {
          source_refs: ["src_abc123"],
          extracted_at: "2025-01-15T10:00:00Z",
          extractor_version: "neotoma-mcp:v0.2.1",
        },
      };
      
      const validated = validatePayloadEnvelope(envelope);
      
      expect(validated.capability_id).toBe("neotoma:store_invoice:v1");
      expect(validated.body).toEqual({
        invoice_number: "INV-001",
        amount: 1000,
      });
      expect(validated.provenance).toBeDefined();
    });

    it("should validate envelope with client_request_id", () => {
      const envelope = {
        capability_id: "neotoma:store_transaction:v1",
        body: {
          amount: 500,
        },
        provenance: {
          source_refs: ["src_def456"],
          extracted_at: "2025-01-15T10:00:00Z",
          extractor_version: "v1.0",
        },
        client_request_id: "req_abc123",
      };
      
      const validated = validatePayloadEnvelope(envelope);
      
      expect(validated.client_request_id).toBe("req_abc123");
    });

    it("should reject envelope without capability_id", () => {
      const invalid = {
        body: {
          amount: 1000,
        },
        provenance: {
          source_refs: ["src_abc123"],
          extracted_at: "2025-01-15T10:00:00Z",
          extractor_version: "v1.0",
        },
      };
      
      expect(() => validatePayloadEnvelope(invalid)).toThrow();
    });

    it("should reject envelope without body", () => {
      const invalid = {
        capability_id: "neotoma:store_invoice:v1",
        provenance: {
          source_refs: ["src_abc123"],
          extracted_at: "2025-01-15T10:00:00Z",
          extractor_version: "v1.0",
        },
      };
      
      expect(() => validatePayloadEnvelope(invalid)).toThrow();
    });

    it("should reject envelope without provenance", () => {
      const invalid = {
        capability_id: "neotoma:store_invoice:v1",
        body: {
          amount: 1000,
        },
      };
      
      expect(() => validatePayloadEnvelope(invalid)).toThrow();
    });

    it("should reject envelope with invalid provenance", () => {
      const invalid = {
        capability_id: "neotoma:store_invoice:v1",
        body: {
          amount: 1000,
        },
        provenance: {
          source_refs: ["src_abc123"],
          // Missing extracted_at and extractor_version
        },
      };
      
      expect(() => validatePayloadEnvelope(invalid)).toThrow();
    });

    it("should allow any fields in body", () => {
      const envelope = {
        capability_id: "neotoma:store_invoice:v1",
        body: {
          invoice_number: "INV-001",
          custom_field_1: "value1",
          custom_field_2: 123,
          nested: {
            field: "value",
          },
          array: [1, 2, 3],
        },
        provenance: {
          source_refs: ["src_abc123"],
          extracted_at: "2025-01-15T10:00:00Z",
          extractor_version: "v1.0",
        },
      };
      
      const validated = validatePayloadEnvelope(envelope);
      
      expect(validated.body.invoice_number).toBe("INV-001");
      expect(validated.body.custom_field_1).toBe("value1");
      expect(validated.body.custom_field_2).toBe(123);
      expect(validated.body.nested).toEqual({ field: "value" });
      expect(validated.body.array).toEqual([1, 2, 3]);
    });

    it("should allow empty body object", () => {
      const envelope = {
        capability_id: "neotoma:store_note:v1",
        body: {},
        provenance: {
          source_refs: ["src_abc123"],
          extracted_at: "2025-01-15T10:00:00Z",
          extractor_version: "v1.0",
        },
      };
      
      const validated = validatePayloadEnvelope(envelope);
      
      expect(validated.body).toEqual({});
    });
  });

  describe("Schema Types", () => {
    it("should infer correct types from validation", () => {
      const envelope: PayloadEnvelope = {
        capability_id: "neotoma:store_invoice:v1",
        body: {
          invoice_number: "INV-001",
        },
        provenance: {
          source_refs: ["src_abc123"],
          extracted_at: "2025-01-15T10:00:00Z",
          extractor_version: "v1.0",
        },
      };
      
      expect(envelope.capability_id).toBe("neotoma:store_invoice:v1");
      expect(envelope.body).toBeDefined();
      expect(envelope.provenance).toBeDefined();
    });

    it("should infer correct Provenance type", () => {
      const provenance: Provenance = {
        source_refs: ["src_abc123"],
        extracted_at: "2025-01-15T10:00:00Z",
        extractor_version: "v1.0",
        agent_id: "test-agent",
      };
      
      expect(provenance.source_refs).toBeDefined();
      expect(provenance.extracted_at).toBeDefined();
      expect(provenance.extractor_version).toBeDefined();
      expect(provenance.agent_id).toBe("test-agent");
    });
  });
});
