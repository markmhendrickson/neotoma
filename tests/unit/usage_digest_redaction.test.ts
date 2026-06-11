/**
 * Unit tests for the usage_digest store-seam redaction helper (#1569 PR review).
 *
 * Tests the pure `redactUsageDigestEntity` function which is the extracted
 * successor to the inline join/split approach that had an array-length
 * corruption bug (BLOCKING #2).
 *
 * Coverage:
 * - friction_notes: per-element redaction preserves array length and order
 * - friction_notes: element containing a newline does NOT expand array length
 * - notes: plain string token is redacted
 * - redaction_salt is set on the entity after any hit
 * - no-PII entity passes through unchanged (no salt written when no hits)
 * - existing redaction_salt is reused, not regenerated
 */

import { describe, it, expect } from "vitest";
import { redactUsageDigestEntity } from "../../src/services/feedback/usage_digest_redaction.js";

describe("redactUsageDigestEntity", () => {
  describe("friction_notes per-element redaction", () => {
    it("replaces email in a friction_notes element with a placeholder", () => {
      const entity = {
        entity_type: "usage_digest",
        friction_notes: ["No issues.", "Contact me at user@example.com if broken."],
      };
      const { applied } = redactUsageDigestEntity(entity);
      expect(applied).toBe(true);
      expect(entity.friction_notes).toHaveLength(2);
      const second = (entity.friction_notes as string[])[1];
      expect(second).not.toContain("user@example.com");
      expect(second).toMatch(/<EMAIL:[0-9a-f]{4}>/);
    });

    it("preserves array length when an element contains a newline (regression: join/split bug)", () => {
      // An element with an embedded newline would be silently split into two
      // elements by the old join("\n")/split("\n") approach. Verify the
      // per-element approach keeps the array length constant.
      const withNewline = "line one\nline two no-pii";
      const entity = {
        entity_type: "usage_digest",
        friction_notes: ["first element user@example.com", withNewline, "third element"],
      };
      const { applied } = redactUsageDigestEntity(entity);
      expect(applied).toBe(true);
      // Length must be exactly 3 — same as input.
      expect(entity.friction_notes).toHaveLength(3);
      // The element with the newline must still contain the newline (pass-through).
      expect((entity.friction_notes as string[])[1]).toContain("\n");
      // The first element with the email is redacted.
      expect((entity.friction_notes as string[])[0]).not.toContain("user@example.com");
      expect((entity.friction_notes as string[])[0]).toMatch(/<EMAIL:[0-9a-f]{4}>/);
    });

    it("preserves order of elements", () => {
      const entity = {
        entity_type: "usage_digest",
        friction_notes: ["alpha", "beta@x.com", "gamma"],
      };
      redactUsageDigestEntity(entity);
      const arr = entity.friction_notes as string[];
      expect(arr[0]).toBe("alpha");
      expect(arr[1]).toMatch(/<EMAIL:[0-9a-f]{4}>/);
      expect(arr[2]).toBe("gamma");
    });

    it("passes through elements with no PII unchanged", () => {
      const entity = {
        entity_type: "usage_digest",
        friction_notes: ["no issues here", "all good"],
      };
      const { applied } = redactUsageDigestEntity(entity);
      expect(applied).toBe(false);
      expect(entity.friction_notes).toEqual(["no issues here", "all good"]);
    });
  });

  describe("notes field redaction", () => {
    it("redacts a token in notes", () => {
      const entity = {
        entity_type: "usage_digest",
        notes: "Used token sk-abc1234567890abcdef12345 during session.",
      };
      const { applied } = redactUsageDigestEntity(entity);
      expect(applied).toBe(true);
      expect(entity.notes as string).not.toContain("sk-abc1234567890abcdef12345");
      expect(entity.notes as string).toMatch(/<TOKEN:[0-9a-f]{4}>/);
    });

    it("redacts an email in notes", () => {
      const entity = {
        entity_type: "usage_digest",
        notes: "Error reported by admin@corp.example.org",
      };
      const { applied } = redactUsageDigestEntity(entity);
      expect(applied).toBe(true);
      expect(entity.notes as string).not.toContain("admin@corp.example.org");
      expect(entity.notes as string).toMatch(/<EMAIL:[0-9a-f]{4}>/);
    });
  });

  describe("redaction_salt handling", () => {
    it("sets redaction_salt on entity when PII is found", () => {
      const entity = {
        entity_type: "usage_digest",
        notes: "contact: hit@example.com",
      };
      expect(entity.redaction_salt).toBeUndefined();
      redactUsageDigestEntity(entity);
      expect(typeof entity.redaction_salt).toBe("string");
      expect((entity.redaction_salt as string).length).toBeGreaterThan(0);
    });

    it("does NOT set redaction_salt when no PII is found", () => {
      const entity = {
        entity_type: "usage_digest",
        notes: "All clean, no PII here.",
        friction_notes: ["nothing sensitive"],
      };
      redactUsageDigestEntity(entity);
      expect(entity.redaction_salt).toBeUndefined();
    });

    it("reuses an existing redaction_salt so placeholders correlate", () => {
      const existingSalt = "preexistingsalt1234";
      const entity = {
        entity_type: "usage_digest",
        redaction_salt: existingSalt,
        notes: "token ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        friction_notes: ["email: user@example.com"],
      };
      redactUsageDigestEntity(entity);
      // Salt must be the same value the caller provided.
      expect(entity.redaction_salt).toBe(existingSalt);
    });

    it("placeholders in notes and friction_notes share the same salt (correlation)", () => {
      // When the same email appears in both fields it should produce the
      // same placeholder hash (same salt used for both).
      const entity = {
        entity_type: "usage_digest",
        notes: "see user@example.com",
        friction_notes: ["also user@example.com"],
      };
      redactUsageDigestEntity(entity);
      const notesPlaceholder = ((entity.notes as string).match(/<EMAIL:[0-9a-f]{4}>/) ?? [])[0];
      const frictionPlaceholder = ((entity.friction_notes as string[])[0].match(
        /<EMAIL:[0-9a-f]{4}>/
      ) ?? [])[0];
      expect(notesPlaceholder).toBeDefined();
      expect(frictionPlaceholder).toBeDefined();
      // Same email + same salt → same hash.
      expect(notesPlaceholder).toBe(frictionPlaceholder);
    });
  });
});
