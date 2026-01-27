/**
 * Unit tests for Observation Identity
 * 
 * Tests observation ID generation and canonical hashing.
 */

import { describe, it, expect } from "vitest";
import {
  generateObservationId,
  computeCanonicalHash,
} from "../../src/services/observation_identity.js";

describe("Observation Identity", () => {
  describe("generateObservationId", () => {
    it("should generate deterministic IDs", () => {
      const sourceId = "src_abc123";
      const interpretationId = "int_def456";
      const entityId = "ent_ghi789";
      const canonicalFields = {
        company_name: "Acme Corp",
      };
      
      const id1 = generateObservationId(sourceId, interpretationId, entityId, canonicalFields);
      const id2 = generateObservationId(sourceId, interpretationId, entityId, canonicalFields);
      
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it("should generate different IDs for different sources", () => {
      const interpretationId = "int_def456";
      const entityId = "ent_ghi789";
      const canonicalFields = {
        name: "Test",
      };
      
      const id1 = generateObservationId("src_1", interpretationId, entityId, canonicalFields);
      const id2 = generateObservationId("src_2", interpretationId, entityId, canonicalFields);
      
      expect(id1).not.toBe(id2);
    });

    it("should generate different IDs for different interpretations", () => {
      const sourceId = "src_abc123";
      const entityId = "ent_ghi789";
      const canonicalFields = {
        name: "Test",
      };
      
      const id1 = generateObservationId(sourceId, "int_1", entityId, canonicalFields);
      const id2 = generateObservationId(sourceId, "int_2", entityId, canonicalFields);
      
      expect(id1).not.toBe(id2);
    });

    it("should generate different IDs for different entities", () => {
      const sourceId = "src_abc123";
      const interpretationId = "int_def456";
      const canonicalFields = {
        name: "Test",
      };
      
      const id1 = generateObservationId(sourceId, interpretationId, "ent_1", canonicalFields);
      const id2 = generateObservationId(sourceId, interpretationId, "ent_2", canonicalFields);
      
      expect(id1).not.toBe(id2);
    });

    it("should generate different IDs for different canonical fields", () => {
      const sourceId = "src_abc123";
      const interpretationId = "int_def456";
      const entityId = "ent_ghi789";
      
      const id1 = generateObservationId(sourceId, interpretationId, entityId, { name: "A" });
      const id2 = generateObservationId(sourceId, interpretationId, entityId, { name: "B" });
      
      expect(id1).not.toBe(id2);
    });
  });

  describe("computeCanonicalHash", () => {
    it("should compute deterministic hash", () => {
      const fields = {
        name: "test company",
        address: "123 main st",
      };
      
      const hash1 = computeCanonicalHash(fields);
      const hash2 = computeCanonicalHash(fields);
      
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe("string");
      expect(hash1.length).toBe(64); // SHA-256 hex is 64 characters
    });

    it("should compute different hashes for different fields", () => {
      const fields1 = {
        name: "company a",
      };
      
      const fields2 = {
        name: "company b",
      };
      
      const hash1 = computeCanonicalHash(fields1);
      const hash2 = computeCanonicalHash(fields2);
      
      expect(hash1).not.toBe(hash2);
    });

    it("should handle nested objects", () => {
      const fields = {
        address: {
          street: "123 main st",
          city: "new york",
        },
      };
      
      const hash = computeCanonicalHash(fields);
      
      expect(typeof hash).toBe("string");
      expect(hash.length).toBe(64);
    });

    it("should handle arrays", () => {
      const fields = {
        tags: ["alpha", "beta"],
      };
      
      const hash = computeCanonicalHash(fields);
      
      expect(typeof hash).toBe("string");
      expect(hash.length).toBe(64);
    });

    it("should be consistent for complex objects", () => {
      const fields = {
        name: "test",
        address: {
          street: "123 main",
          city: "ny",
        },
        tags: ["a", "b"],
        amount: 100,
        active: true,
      };
      
      const hash1 = computeCanonicalHash(fields);
      const hash2 = computeCanonicalHash(fields);
      
      expect(hash1).toBe(hash2);
    });
  });
});
