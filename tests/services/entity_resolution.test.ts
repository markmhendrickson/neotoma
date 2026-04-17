/**
 * Unit tests for Entity Resolution Service
 * 
 * Tests deterministic entity ID generation and canonical name normalization.
 */

import { describe, it, expect } from "vitest";
import {
  deriveCanonicalNameFromFields,
  formatCanonicalNameForStorage,
  generateEntityId,
  normalizeEntityValue,
} from "../../src/services/entity_resolution.js";

describe("Entity Resolution Service", () => {
  describe("generateEntityId", () => {
    it("should generate deterministic IDs for same input", () => {
      const id1 = generateEntityId("company", "Acme Corp");
      const id2 = generateEntityId("company", "Acme Corp");
      
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^ent_[a-f0-9]{24}$/);
    });

    it("should generate different IDs for different entity types", () => {
      const id1 = generateEntityId("company", "Acme");
      const id2 = generateEntityId("person", "Acme");
      
      expect(id1).not.toBe(id2);
    });

    it("should generate same ID for companies with different suffixes", () => {
      // Normalization removes common suffixes, so "Acme Corp" and "Acme Inc" both become "acme"
      const id1 = generateEntityId("company", "Acme Corp");
      const id2 = generateEntityId("company", "Acme Inc");
      
      expect(id1).toBe(id2); // Both normalize to "acme"
    });

    it("should generate same ID regardless of input case", () => {
      const id1 = generateEntityId("company", "acme corp");
      const id2 = generateEntityId("company", "ACME CORP");
      const id3 = generateEntityId("company", "Acme Corp");
      
      expect(id1).toBe(id2);
      expect(id2).toBe(id3);
    });

    it("should generate same ID regardless of whitespace", () => {
      const id1 = generateEntityId("company", "Acme  Corp");
      const id2 = generateEntityId("company", "Acme Corp");
      const id3 = generateEntityId("company", "  Acme Corp  ");
      
      expect(id1).toBe(id2);
      expect(id2).toBe(id3);
    });

    it("should handle empty string", () => {
      const id = generateEntityId("company", "");
      
      expect(id).toMatch(/^ent_[a-f0-9]{24}$/);
    });

    it("should handle special characters", () => {
      const id1 = generateEntityId("company", "Acme & Co.");
      const id2 = generateEntityId("company", "Acme & Co.");
      
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^ent_[a-f0-9]{24}$/);
    });

    it("should generate IDs with correct prefix and length", () => {
      const id = generateEntityId("company", "Test Company");
      
      expect(id).toMatch(/^ent_/);
      expect(id.length).toBe(28); // "ent_" (4) + hash (24)
    });
  });

  describe("normalizeEntityValue", () => {
    describe("Company normalization", () => {
      it("should remove Inc suffix", () => {
        expect(normalizeEntityValue("company", "Acme Inc")).toBe("acme");
        expect(normalizeEntityValue("company", "Acme Inc.")).toBe("acme");
        expect(normalizeEntityValue("company", "Acme INC")).toBe("acme");
      });

      it("should remove LLC suffix", () => {
        expect(normalizeEntityValue("company", "Acme LLC")).toBe("acme");
        expect(normalizeEntityValue("company", "Acme LLC.")).toBe("acme");
        expect(normalizeEntityValue("company", "Acme llc")).toBe("acme");
      });

      it("should remove Ltd suffix", () => {
        expect(normalizeEntityValue("company", "Acme Ltd")).toBe("acme");
        expect(normalizeEntityValue("company", "Acme Ltd.")).toBe("acme");
        expect(normalizeEntityValue("company", "Acme LTD")).toBe("acme");
      });

      it("should remove Corp suffix", () => {
        expect(normalizeEntityValue("company", "Acme Corp")).toBe("acme");
        expect(normalizeEntityValue("company", "Acme Corp.")).toBe("acme");
        expect(normalizeEntityValue("company", "Acme CORP")).toBe("acme");
      });

      it("should remove Corporation suffix", () => {
        expect(normalizeEntityValue("company", "Acme Corporation")).toBe("acme");
        expect(normalizeEntityValue("company", "Acme CORPORATION")).toBe("acme");
      });

      it("should remove Co suffix", () => {
        expect(normalizeEntityValue("company", "Acme Co")).toBe("acme");
        expect(normalizeEntityValue("company", "Acme Co.")).toBe("acme");
        expect(normalizeEntityValue("company", "Acme CO")).toBe("acme");
      });

      it("should remove Company suffix", () => {
        expect(normalizeEntityValue("company", "Acme Company")).toBe("acme");
        expect(normalizeEntityValue("company", "Acme COMPANY")).toBe("acme");
      });

      it("should remove Limited suffix", () => {
        expect(normalizeEntityValue("company", "Acme Limited")).toBe("acme");
        expect(normalizeEntityValue("company", "Acme LIMITED")).toBe("acme");
      });

      it("should handle companies without suffixes", () => {
        expect(normalizeEntityValue("company", "Acme")).toBe("acme");
        expect(normalizeEntityValue("company", "Tesla")).toBe("tesla");
      });

      it("should normalize organization type same as company", () => {
        expect(normalizeEntityValue("organization", "Acme Corp")).toBe("acme");
        expect(normalizeEntityValue("organization", "Acme LLC")).toBe("acme");
      });
    });

    describe("Person/contact normalization", () => {
      it("should remove honorifics for person type", () => {
        expect(normalizeEntityValue("person", "Dr. John Doe")).toBe("john doe");
        expect(normalizeEntityValue("person", "Mr. Smith")).toBe("smith");
        expect(normalizeEntityValue("contact", "Mrs. Jane Doe")).toBe("jane doe");
      });

      it("should remove generational suffixes for person type", () => {
        expect(normalizeEntityValue("person", "John Doe Jr.")).toBe("john doe");
        expect(normalizeEntityValue("person", "John Doe III")).toBe("john doe");
      });
    });

    describe("Non-company normalization", () => {
      it("should not remove company suffixes for non-company types", () => {
        expect(normalizeEntityValue("product", "Widget Corp")).toBe("widget corp");
      });

      it("should still normalize case and whitespace", () => {
        expect(normalizeEntityValue("person", "John  Doe")).toBe("john doe");
        expect(normalizeEntityValue("person", "  John Doe  ")).toBe("john doe");
        expect(normalizeEntityValue("person", "JOHN DOE")).toBe("john doe");
      });
    });

    describe("Edge cases", () => {
      it("should handle empty string", () => {
        expect(normalizeEntityValue("company", "")).toBe("");
        expect(normalizeEntityValue("person", "")).toBe("");
      });

      it("should handle whitespace only", () => {
        expect(normalizeEntityValue("company", "   ")).toBe("");
        expect(normalizeEntityValue("person", "  \n  ")).toBe("");
      });

      it("should handle special characters", () => {
        expect(normalizeEntityValue("company", "Acme & Co.")).toBe("acme &");
        expect(normalizeEntityValue("company", "AT&T Inc")).toBe("at&t");
      });

      it("should handle multiple spaces", () => {
        expect(normalizeEntityValue("company", "Acme    Corp")).toBe("acme");
        expect(normalizeEntityValue("person", "John    Doe")).toBe("john doe");
      });

      it("should handle mixed case suffixes", () => {
        expect(normalizeEntityValue("company", "Acme InC")).toBe("acme");
        expect(normalizeEntityValue("company", "Acme LlC")).toBe("acme");
      });

      it("should handle period after suffix", () => {
        expect(normalizeEntityValue("company", "Acme Inc.")).toBe("acme");
        expect(normalizeEntityValue("company", "Acme LLC.")).toBe("acme");
      });

      it("should handle company with suffix in middle", () => {
        expect(normalizeEntityValue("company", "Inc Acme")).toBe("inc acme");
        expect(normalizeEntityValue("company", "Corp Acme Corp")).toBe("corp acme");
      });

      it("should strip punctuation for consistent matching", () => {
        expect(normalizeEntityValue("company", "Acme, Inc.")).toBe("acme");
        expect(normalizeEntityValue("person", "John-Paul Doe")).toBe("john paul doe");
        expect(normalizeEntityValue("task", "Follow up (urgent)")).toBe("follow up urgent");
        expect(normalizeEntityValue("company", "O'Reilly")).toBe("o reilly");
      });
    });

    describe("Determinism", () => {
      it("should be deterministic across multiple calls", () => {
        const values = Array(100)
          .fill(null)
          .map(() => normalizeEntityValue("company", "Acme Corp"));
        
        const allSame = values.every((v) => v === values[0]);
        expect(allSame).toBe(true);
        expect(values[0]).toBe("acme");
      });

      it("should normalize same input identically", () => {
        const inputs = [
          "Acme Corp",
          "ACME CORP",
          "acme corp",
          "Acme  Corp",
          "  Acme Corp  ",
        ];
        
        const normalized = inputs.map((input) =>
          normalizeEntityValue("company", input)
        );
        
        const allSame = normalized.every((v) => v === normalized[0]);
        expect(allSame).toBe(true);
      });
    });
  });

  describe("formatCanonicalNameForStorage", () => {
    it("preserves email shape for contact identifiers (no hyphen stripping)", () => {
      expect(normalizeEntityValue("contact", "shared-user@example.com")).toBe(
        "shared-user@example.com",
      );
      expect(formatCanonicalNameForStorage("contact", "Shared-User@Example.com")).toBe(
        "shared-user@example.com",
      );
    });

    it("preserves casing while matching normalizeEntityValue for hashing", () => {
      const raw = "Acme Corp";
      const stored = formatCanonicalNameForStorage("company", raw);
      expect(stored).toBe("Acme");
      expect(normalizeEntityValue("company", stored)).toBe(
        normalizeEntityValue("company", raw),
      );
      expect(generateEntityId("company", stored)).toBe(
        generateEntityId("company", raw),
      );
    });

    it("preserves mixed case for non-company types", () => {
      const raw = "Quarterly OKR Review";
      const stored = formatCanonicalNameForStorage("task", raw);
      expect(stored).toBe("Quarterly OKR Review");
      expect(normalizeEntityValue("task", stored)).toBe(
        normalizeEntityValue("task", raw),
      );
    });

    it("strips honorifics without lowercasing person names", () => {
      expect(formatCanonicalNameForStorage("person", "Dr. Jane Doe")).toBe(
        "Jane Doe",
      );
      expect(normalizeEntityValue("person", "Dr. Jane Doe")).toBe(
        normalizeEntityValue("person", "Jane Doe"),
      );
    });
  });

  describe("deriveCanonicalNameFromFields", () => {
    it("should prefer stable IDs over metadata fields (email_message)", () => {
      const canonical = deriveCanonicalNameFromFields("email_message", {
        source: "gmail",
        message_id: "19c7482c87b8e406",
        subject: "Your API usage limits have increased",
      });

      expect(canonical).toContain("19c7482c87b8e406");
      expect(canonical).not.toBe("gmail");

      const entityId = generateEntityId("email_message", canonical);
      expect(entityId).toMatch(/^ent_[a-f0-9]{24}$/);
    });

    it("should produce different IDs for different message IDs (email_message)", () => {
      const c1 = deriveCanonicalNameFromFields("email_message", {
        source: "gmail",
        message_id: "a",
      });
      const c2 = deriveCanonicalNameFromFields("email_message", {
        source: "gmail",
        message_id: "b",
      });

      expect(generateEntityId("email_message", c1)).not.toBe(generateEntityId("email_message", c2));
    });

    it("should prioritize turn_key for agent_message identity", () => {
      const canonical = deriveCanonicalNameFromFields("agent_message", {
        role: "user",
        content: "",
        turn_key: "cursor:chat:turn-7",
      });

      expect(canonical).toContain("turn_key");
      expect(canonical).toContain("cursor:chat:turn-7");
    });

    it("should generate different IDs for empty-content agent messages with different turn_key", () => {
      const c1 = deriveCanonicalNameFromFields("agent_message", {
        role: "user",
        content: "",
        turn_key: "cursor:chat:turn-1",
      });
      const c2 = deriveCanonicalNameFromFields("agent_message", {
        role: "user",
        content: "",
        turn_key: "cursor:chat:turn-2",
      });

      expect(generateEntityId("agent_message", c1)).not.toBe(generateEntityId("agent_message", c2));
    });

    it("preserves source casing for name-based entities", () => {
      const canonical = deriveCanonicalNameFromFields("company", {
        name: "Acme Corporation",
      });
      expect(canonical).toBe("Acme");
      expect(generateEntityId("company", canonical)).toBe(
        generateEntityId("company", "acme corp"),
      );
    });

    // Audit finding #1: two receipts for the same merchant but different
    // totals and dates were collapsing into a single entity because the
    // canonical name was only derived from merchant. With schema-declared
    // canonical_name_fields the composite of (merchant, total_amount,
    // receipt_date) must distinguish them.
    it("produces distinct canonical names for two Ecoveritas receipts with different totals (schema-declared composite)", () => {
      const schema = {
        canonical_name_fields: [
          "merchant",
          "total_amount",
          "receipt_date",
        ],
      };
      const c1 = deriveCanonicalNameFromFields(
        "receipt",
        {
          merchant: "Ecoveritas",
          total_amount: 42.5,
          receipt_date: "2024-05-01",
        },
        schema,
      );
      const c2 = deriveCanonicalNameFromFields(
        "receipt",
        {
          merchant: "Ecoveritas",
          total_amount: 78.9,
          receipt_date: "2024-05-03",
        },
        schema,
      );
      expect(c1).not.toBe(c2);
      expect(generateEntityId("receipt", c1)).not.toBe(
        generateEntityId("receipt", c2),
      );
    });

    // When none of the schema-declared composite fields have values, the
    // canonical derivation must not fall back to a generic enum-like token
    // (currency=EUR) that would collapse every receipt in the system.
    it("rejects enum-like single-value canonical fallback (EUR-only receipt)", () => {
      const schema = {
        canonical_name_fields: [
          "merchant",
          "total_amount",
          "receipt_date",
        ],
      };
      const canonical = deriveCanonicalNameFromFields(
        "receipt",
        { currency: "EUR" },
        schema,
      );
      // No schema-declared field has a value; enum-like tokens must be
      // rejected by isRejectedCanonicalValue, so this must NOT produce
      // a canonical of "EUR".
      expect(canonical).not.toBe("EUR");
      expect(canonical?.toLowerCase()).not.toBe("eur");
    });

    it("still resolves via heuristic for an unseeded type without schema", () => {
      // Without any schema, the heuristic fallback picks a reasonable field.
      const canonical = deriveCanonicalNameFromFields("custom_widget", {
        widget_name: "Blue Widget",
      });
      expect(canonical).toBeTruthy();
      expect(typeof canonical).toBe("string");
    });
  });

  describe("Integration - generateEntityId with normalizeEntityValue", () => {
    it("should generate same ID for variations of company name", () => {
      const variations = [
        "Acme Corp",
        "Acme Corporation",
        "Acme Inc",
        "Acme LLC",
        "ACME CORP",
        "acme corp",
      ];
      
      const ids = variations.map((name) => generateEntityId("company", name));
      
      // All variations should produce the same entity ID
      const allSame = ids.every((id) => id === ids[0]);
      expect(allSame).toBe(true);
    });

    it("should generate different IDs for different companies", () => {
      const companies = ["Acme Corp", "Beta Inc", "Gamma LLC"];
      
      const ids = companies.map((name) => generateEntityId("company", name));
      
      // All IDs should be unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    it("should be fully deterministic end-to-end", () => {
      const runs = Array(100)
        .fill(null)
        .map(() => generateEntityId("company", "Test Corp"));
      
      const allSame = runs.every((id) => id === runs[0]);
      expect(allSame).toBe(true);
    });
  });
});
