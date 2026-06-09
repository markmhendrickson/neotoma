/**
 * Unit tests for Field Canonicalization
 * 
 * Tests canonical hashing for deterministic field processing.
 */

import { describe, it, expect } from "vitest";
import {
  canonicalizeFields,
  hashCanonicalFields,
} from "../../src/services/field_canonicalization.js";
import type { SchemaDefinition } from "../../src/services/schema_registry.js";

describe("Field Canonicalization", () => {
  describe("hashCanonicalFields", () => {
    it("should generate deterministic hash", () => {
      const fields = {
        name: "test company",
        address: "123 main st",
      };
      
      const hash1 = hashCanonicalFields(fields);
      const hash2 = hashCanonicalFields(fields);
      
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe("string");
      expect(hash1.length).toBeGreaterThan(0);
    });

    it("should generate different hashes for different fields", () => {
      const fields1 = {
        name: "company a",
      };
      
      const fields2 = {
        name: "company b",
      };
      
      const hash1 = hashCanonicalFields(fields1);
      const hash2 = hashCanonicalFields(fields2);
      
      expect(hash1).not.toBe(hash2);
    });

    it("should handle nested objects deterministically", () => {
      const fields1 = {
        address: {
          street: "123 main st",
          city: "new york",
        },
      };
      
      const fields2 = {
        address: {
          street: "123 main st",
          city: "new york",
        },
      };
      
      const hash1 = hashCanonicalFields(fields1);
      const hash2 = hashCanonicalFields(fields2);
      
      expect(hash1).toBe(hash2);
    });

    it("should handle arrays deterministically", () => {
      const fields = {
        tags: ["alpha", "beta", "gamma"],
      };
      
      const hash1 = hashCanonicalFields(fields);
      const hash2 = hashCanonicalFields(fields);
      
      expect(hash1).toBe(hash2);
    });

    it("should generate consistent hash for complex objects", () => {
      const fields = {
        name: "test company",
        address: {
          street: "123 main",
          city: "ny",
        },
        tags: ["tag1", "tag2"],
        amount: 1234.56,
        active: true,
      };
      
      const hash1 = hashCanonicalFields(fields);
      const hash2 = hashCanonicalFields(fields);
      
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBeGreaterThan(0);
    });

    it("should handle empty objects", () => {
      const fields = {};
      
      const hash = hashCanonicalFields(fields);
      
      expect(typeof hash).toBe("string");
      expect(hash.length).toBeGreaterThan(0);
    });

    it("should handle null values", () => {
      const fields = {
        name: "test",
        optional: null,
      };
      
      const hash = hashCanonicalFields(fields);
      
      expect(typeof hash).toBe("string");
      expect(hash.length).toBeGreaterThan(0);
    });

    it("should handle numeric values", () => {
      const fields = {
        amount: 1234.56,
        count: 10,
        negative: -5.5,
      };
      
      const hash = hashCanonicalFields(fields);
      
      expect(typeof hash).toBe("string");
      expect(hash.length).toBeGreaterThan(0);
    });

    it("should handle boolean values", () => {
      const fields = {
        active: true,
        verified: false,
      };
      
      const hash = hashCanonicalFields(fields);
      
      expect(typeof hash).toBe("string");
      expect(hash.length).toBeGreaterThan(0);
    });

    it("should handle mixed types", () => {
      const fields = {
        string: "value",
        number: 123,
        boolean: true,
        null_value: null,
        array: [1, 2, 3],
        object: { nested: "value" },
      };
      
      const hash = hashCanonicalFields(fields);
      
      expect(typeof hash).toBe("string");
      expect(hash.length).toBeGreaterThan(0);
    });

    it("should produce different hashes for different field structures", () => {
      const fields1 = {
        name: "test",
        amount: 100,
      };
      
      const fields2 = {
        name: "test",
        count: 100, // Different field name
      };
      
      const hash1 = hashCanonicalFields(fields1);
      const hash2 = hashCanonicalFields(fields2);
      
      expect(hash1).not.toBe(hash2);
    });

    it("should handle special characters", () => {
      const fields = {
        name: "Test & Company, LLC.",
        email: "test@example.com",
        url: "https://example.com/path?query=value",
      };
      
      const hash = hashCanonicalFields(fields);
      
      expect(typeof hash).toBe("string");
      expect(hash.length).toBeGreaterThan(0);
    });

    it("should handle unicode characters", () => {
      const fields = {
        name: "Tëst Çömpány 你好",
        description: "Unicode content: émojis 🎉",
      };
      
      const hash = hashCanonicalFields(fields);
      
      expect(typeof hash).toBe("string");
      expect(hash.length).toBeGreaterThan(0);
    });

    it("should be deterministic across multiple calls", () => {
      const fields = {
        name: "deterministic test",
        amount: 999.99,
        tags: ["a", "b", "c"],
      };
      
      const hashes = [];
      for (let i = 0; i < 10; i++) {
        hashes.push(hashCanonicalFields(fields));
      }
      
      // All hashes should be identical
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(1);
    });
  });
});

describe("canonicalizeArray — JSON-array-string recovery (#1595)", () => {
  const schema: SchemaDefinition = {
    fields: { items: { type: "array", required: false } },
  } as unknown as SchemaDefinition;

  it("recovers a JSON-array-shaped string into a real array", () => {
    const out = canonicalizeFields({ items: '["a","b"]' }, schema);
    expect(out.items).toEqual(["a", "b"]);
  });

  it("falls through to [] for a non-JSON string", () => {
    const out = canonicalizeFields({ items: "not an array" }, schema);
    expect(out.items).toEqual([]);
  });

  it("leaves a real array unchanged (no regression)", () => {
    const out = canonicalizeFields({ items: ["a", "b"] }, schema);
    expect(out.items).toEqual(["a", "b"]);
  });
});
