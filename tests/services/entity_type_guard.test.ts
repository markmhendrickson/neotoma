/**
 * Tests for entity-type guards (forbidden-pattern + plural-form).
 *
 * Both guards are schema-agnostic: they operate only on the type name string
 * and a set of environment-driven allow/deny lists. They warn in development
 * and throw in production unless `force: true`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  checkForbiddenTestArtifactType,
  checkPluralEntityType,
  enforceEntityTypeGuards,
  lintEntityTypeName,
  suggestSingular,
} from "../../src/services/entity_type_guard.js";

describe("entity_type_guard", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.NEOTOMA_FORBIDDEN_TYPE_PATTERNS;
    delete process.env.NEOTOMA_ALLOWED_TEST_TYPES;
    delete process.env.NEOTOMA_ALLOWED_PLURAL_TYPES;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("checkForbiddenTestArtifactType", () => {
    it("rejects numeric-suffixed test types", () => {
      expect(checkForbiddenTestArtifactType("test_type_001").reason).toBe(
        "forbidden_test_artifact",
      );
      expect(checkForbiddenTestArtifactType("test_entity_42").reason).toBe(
        "forbidden_test_artifact",
      );
      expect(checkForbiddenTestArtifactType("test_foo_99").reason).toBe(
        "forbidden_test_artifact",
      );
    });

    it("rejects auto_test variants", () => {
      expect(checkForbiddenTestArtifactType("auto_test_foo").reason).toBe(
        "forbidden_test_artifact",
      );
      expect(checkForbiddenTestArtifactType("foo_auto_test").reason).toBe(
        "forbidden_test_artifact",
      );
    });

    it("rejects __tmp__ and __scratch__ sentinels", () => {
      expect(checkForbiddenTestArtifactType("__tmp__thing").reason).toBe(
        "forbidden_test_artifact",
      );
      expect(checkForbiddenTestArtifactType("__scratch__").reason).toBe(
        "forbidden_test_artifact",
      );
    });

    it("does not block legitimate types that merely contain 'test'", () => {
      expect(checkForbiddenTestArtifactType("test_case").reason).toBe(null);
      expect(checkForbiddenTestArtifactType("ab_test").reason).toBe(null);
      expect(checkForbiddenTestArtifactType("user").reason).toBe(null);
      expect(checkForbiddenTestArtifactType("contact").reason).toBe(null);
    });

    it("honours NEOTOMA_ALLOWED_TEST_TYPES allowlist", () => {
      expect(checkForbiddenTestArtifactType("test_type_001").reason).toBe(
        "forbidden_test_artifact",
      );
      process.env.NEOTOMA_ALLOWED_TEST_TYPES = "test_type_001,other_allowed";
      expect(checkForbiddenTestArtifactType("test_type_001").reason).toBe(null);
      expect(checkForbiddenTestArtifactType("other_allowed").reason).toBe(null);
    });

    it("honours NEOTOMA_FORBIDDEN_TYPE_PATTERNS override", () => {
      expect(checkForbiddenTestArtifactType("custom_bad_type").reason).toBe(
        null,
      );
      process.env.NEOTOMA_FORBIDDEN_TYPE_PATTERNS = "^custom_bad_";
      expect(checkForbiddenTestArtifactType("custom_bad_type").reason).toBe(
        "forbidden_test_artifact",
      );
    });
  });

  describe("suggestSingular", () => {
    it("strips trailing s for regular plurals", () => {
      expect(suggestSingular("contacts")).toBe("contact");
      expect(suggestSingular("posts")).toBe("post");
      expect(suggestSingular("songs")).toBe("song");
      expect(suggestSingular("meeting_notes")).toBe("meeting_note");
    });

    it("handles y-plurals (categories → category)", () => {
      expect(suggestSingular("categories")).toBe("category");
      expect(suggestSingular("companies")).toBe("company");
    });

    it("handles sibilant-es plurals", () => {
      expect(suggestSingular("boxes")).toBe("box");
      expect(suggestSingular("dishes")).toBe("dish");
      expect(suggestSingular("benches")).toBe("bench");
    });

    it("returns null for already-singular names", () => {
      expect(suggestSingular("contact")).toBe(null);
      expect(suggestSingular("post")).toBe(null);
      expect(suggestSingular("address")).toBe(null);
    });

    it("returns null for irregular singulars ending in s", () => {
      expect(suggestSingular("news")).toBe(null);
      expect(suggestSingular("analytics")).toBe(null);
      expect(suggestSingular("analysis")).toBe(null);
      expect(suggestSingular("species")).toBe(null);
      expect(suggestSingular("data")).toBe(null);
    });
  });

  describe("checkPluralEntityType", () => {
    it("flags obvious plurals", () => {
      expect(checkPluralEntityType("contacts").reason).toBe("looks_plural");
      expect(checkPluralEntityType("posts").reason).toBe("looks_plural");
      expect(checkPluralEntityType("meeting_notes").reason).toBe(
        "looks_plural",
      );
    });

    it("allows singular forms", () => {
      expect(checkPluralEntityType("contact").reason).toBe(null);
      expect(checkPluralEntityType("post").reason).toBe(null);
      expect(checkPluralEntityType("transaction").reason).toBe(null);
    });

    it("allows irregular singulars ending in s", () => {
      expect(checkPluralEntityType("news").reason).toBe(null);
      expect(checkPluralEntityType("analytics").reason).toBe(null);
      expect(checkPluralEntityType("analysis").reason).toBe(null);
    });

    it("honours NEOTOMA_ALLOWED_PLURAL_TYPES allowlist", () => {
      expect(checkPluralEntityType("songs").reason).toBe("looks_plural");
      process.env.NEOTOMA_ALLOWED_PLURAL_TYPES = "songs,books";
      expect(checkPluralEntityType("songs").reason).toBe(null);
      expect(checkPluralEntityType("books").reason).toBe(null);
    });

    it("suggests the singular form in the message", () => {
      const result = checkPluralEntityType("contacts");
      expect(result.suggestion).toMatch(/contact/);
    });
  });

  describe("enforceEntityTypeGuards", () => {
    beforeEach(() => {
      delete process.env.NODE_ENV;
    });

    it("warns (does not throw) in development for forbidden types", () => {
      process.env.NODE_ENV = "development";
      expect(() =>
        enforceEntityTypeGuards("test_type_001"),
      ).not.toThrow();
    });

    it("throws in production for forbidden types", () => {
      process.env.NODE_ENV = "production";
      expect(() => enforceEntityTypeGuards("test_type_001")).toThrow(
        /forbidden test-artifact pattern/,
      );
    });

    it("throws in production for plural types", () => {
      process.env.NODE_ENV = "production";
      expect(() => enforceEntityTypeGuards("contacts")).toThrow(
        /appears to be plural/,
      );
    });

    it("does not throw when force: true", () => {
      process.env.NODE_ENV = "production";
      expect(() =>
        enforceEntityTypeGuards("test_type_001", { force: true }),
      ).not.toThrow();
      expect(() =>
        enforceEntityTypeGuards("contacts", { force: true }),
      ).not.toThrow();
    });

    it("attaches a code to the error for programmatic handling", () => {
      process.env.NODE_ENV = "production";
      try {
        enforceEntityTypeGuards("test_type_001");
        throw new Error("expected throw");
      } catch (err) {
        expect((err as { code?: string }).code).toBe(
          "ERR_FORBIDDEN_ENTITY_TYPE",
        );
      }
      try {
        enforceEntityTypeGuards("contacts");
        throw new Error("expected throw");
      } catch (err) {
        expect((err as { code?: string }).code).toBe("ERR_PLURAL_ENTITY_TYPE");
      }
    });
  });

  describe("lintEntityTypeName", () => {
    it("returns empty array for clean snake_case names", () => {
      expect(lintEntityTypeName("contact")).toEqual([]);
      expect(lintEntityTypeName("invoice")).toEqual([]);
      expect(lintEntityTypeName("bank_transaction")).toEqual([]);
      expect(lintEntityTypeName("meeting_note")).toEqual([]);
    });

    it("warns on names containing uppercase letters", () => {
      const warnings = lintEntityTypeName("UserProfile");
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/uppercase/i);
      expect(warnings[0]).toMatch(/snake_case/i);
    });

    it("warns on names containing hyphens", () => {
      const warnings = lintEntityTypeName("bank-transaction");
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/hyphen/i);
      expect(warnings[0]).toMatch(/bank_transaction/);
    });

    it("warns on _entity suffix", () => {
      const warnings = lintEntityTypeName("user_entity");
      expect(warnings.length).toBeGreaterThanOrEqual(1);
      const text = warnings.join(" ");
      expect(text).toMatch(/_entity/);
      expect(text).toMatch(/redundant/i);
    });

    it("warns on _record suffix", () => {
      const warnings = lintEntityTypeName("payment_record");
      expect(warnings.length).toBeGreaterThanOrEqual(1);
      expect(warnings.join(" ")).toMatch(/_record/);
    });

    it("warns on _data suffix", () => {
      const warnings = lintEntityTypeName("user_data");
      expect(warnings.length).toBeGreaterThanOrEqual(1);
      expect(warnings.join(" ")).toMatch(/_data/);
    });

    it("warns on _object suffix", () => {
      const warnings = lintEntityTypeName("task_object");
      expect(warnings.length).toBeGreaterThanOrEqual(1);
      expect(warnings.join(" ")).toMatch(/_object/);
    });

    it("warns on _item suffix", () => {
      const warnings = lintEntityTypeName("line_item");
      expect(warnings.length).toBeGreaterThanOrEqual(1);
      expect(warnings.join(" ")).toMatch(/_item/);
    });

    it("warns on _entry suffix", () => {
      const warnings = lintEntityTypeName("journal_entry");
      expect(warnings.length).toBeGreaterThanOrEqual(1);
      expect(warnings.join(" ")).toMatch(/_entry/);
    });

    it("warns on generic names", () => {
      for (const name of ["item", "thing", "object", "record", "data", "entry", "entity"]) {
        const warnings = lintEntityTypeName(name);
        expect(warnings.length).toBeGreaterThanOrEqual(1);
        expect(warnings.join(" ")).toMatch(/generic/i);
      }
    });

    it("warns on names shorter than 3 characters", () => {
      expect(lintEntityTypeName("ab").join(" ")).toMatch(/too short/i);
      expect(lintEntityTypeName("x").join(" ")).toMatch(/too short/i);
    });

    it("does not warn on 3+ character clean names", () => {
      const warnings = lintEntityTypeName("abc");
      expect(warnings.every((w) => !/too short/i.test(w))).toBe(true);
    });

    it("returns multiple warnings when multiple issues exist", () => {
      // "UserRecord" — uppercase + redundant _record suffix (after lowercasing)
      const warnings = lintEntityTypeName("UserRecord");
      const text = warnings.join(" ");
      expect(text).toMatch(/uppercase/i);
      expect(text).toMatch(/_record/);
    });

    it("returns empty array for empty string", () => {
      expect(lintEntityTypeName("")).toEqual([]);
    });

    it("does not emit redundant-suffix warning when suffix is the whole name", () => {
      // "entity" itself is a generic name — flagged as generic, not as a suffix
      const warnings = lintEntityTypeName("entity");
      expect(warnings.join(" ")).toMatch(/generic/i);
      expect(warnings.every((w) => !/redundant/i.test(w))).toBe(true);
    });
  });
});
