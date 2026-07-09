/**
 * Unit tests for company entity resolution (leads graph join key).
 *
 * Covers:
 *  (a) org-name normalization rules (suffix stripping, case, whitespace)
 *  (b) fuzzy company resolution, including the Contoso8 near-duplicate
 *      variants named in the design ("Contoso8" / "Contoso 8" / "Contoso8 LLC")
 *  (c) get-or-create semantics: repeated resolution of the same org string
 *      (or an exact-normalized variant) reuses the same entity_id
 *
 * Runs against the local SQLite test DB (see vitest.setup.ts) — no mocking of
 * `db`, matching the pattern in tests/unit/duplicate_detection.test.ts.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveCompanyEntity,
  normalizeCompanyName,
  computeExactCompanyEntityId,
  COMPANY_FUZZY_MATCH_THRESHOLD,
} from "../../src/services/company_resolution.js";
import { db } from "../../src/db.js";

const testUserId = "00000000-0000-0000-0000-00000000c091"; // dedicated test tenant

async function cleanup(): Promise<void> {
  await db.from("entity_snapshots").delete().eq("entity_type", "company").eq("user_id", testUserId);
  await db.from("entities").delete().eq("entity_type", "company").eq("user_id", testUserId);
}

describe("company_resolution", () => {
  beforeEach(cleanup);

  describe("normalizeCompanyName (org normalization rules)", () => {
    it("lowercases and trims", () => {
      expect(normalizeCompanyName("  Contoso8  ")).toBe("contoso8");
    });

    it("strips common legal-entity suffixes", () => {
      expect(normalizeCompanyName("Contoso8 Inc")).toBe("contoso8");
      expect(normalizeCompanyName("Contoso8 Inc.")).toBe("contoso8");
      expect(normalizeCompanyName("Contoso8 LLC")).toBe("contoso8");
      expect(normalizeCompanyName("Contoso8 Ltd")).toBe("contoso8");
      expect(normalizeCompanyName("Contoso8 Corp")).toBe("contoso8");
      expect(normalizeCompanyName("Contoso8 GmbH")).toBe("contoso8");
    });

    it("collapses internal whitespace and strips punctuation", () => {
      expect(normalizeCompanyName("Contoso,   Corp.")).toBe("contoso");
      expect(normalizeCompanyName("Contoso -  Widgets")).toBe("contoso widgets");
    });

    it("does not strip a suffix-like token that isn't trailing", () => {
      // "Corp" mid-string (not a trailing legal suffix) must survive normalization.
      expect(normalizeCompanyName("Corp Solutions")).toBe("corp solutions");
    });
  });

  describe("resolveCompanyEntity: exact-normalized match", () => {
    it("creates a new company entity when none exists", async () => {
      const result = await resolveCompanyEntity({
        organizationName: "Contoso8",
        userId: testUserId,
      });
      expect(result.created).toBe(true);
      expect(result.basis).toBe("created");
      expect(result.entityId).toBe(computeExactCompanyEntityId("Contoso8", testUserId));
    });

    it("is idempotent: resolving the same name twice returns the same entity_id and does not create twice", async () => {
      const first = await resolveCompanyEntity({
        organizationName: "Contoso8",
        userId: testUserId,
      });
      const second = await resolveCompanyEntity({
        organizationName: "Contoso8",
        userId: testUserId,
      });

      expect(second.entityId).toBe(first.entityId);
      expect(second.created).toBe(false);
      expect(second.basis).toBe("exact_normalized");

      const { data } = await db
        .from("entities")
        .select("id")
        .eq("entity_type", "company")
        .eq("user_id", testUserId);
      expect((data ?? []).length).toBe(1);
    });

    it("collapses suffix/case/whitespace variants to the same entity via exact-normalized match (no fuzzy pass needed)", async () => {
      const base = await resolveCompanyEntity({ organizationName: "Contoso8", userId: testUserId });

      for (const variant of [
        "contoso8",
        "CONTOSO8",
        "Contoso8 LLC",
        "Contoso8, Inc.",
        "  Contoso8  ",
      ]) {
        const result = await resolveCompanyEntity({
          organizationName: variant,
          userId: testUserId,
        });
        expect(result.entityId).toBe(base.entityId);
        expect(result.created).toBe(false);
        expect(result.basis).toBe("exact_normalized");
      }

      const { data } = await db
        .from("entities")
        .select("id")
        .eq("entity_type", "company")
        .eq("user_id", testUserId);
      expect((data ?? []).length).toBe(1);
    });
  });

  describe("resolveCompanyEntity: fuzzy match (Contoso8 variants)", () => {
    it("collapses 'Contoso 8' (space) onto the existing 'Contoso8' entity via the fuzzy pass", async () => {
      const base = await resolveCompanyEntity({ organizationName: "Contoso8", userId: testUserId });

      const fuzzy = await resolveCompanyEntity({
        organizationName: "Contoso 8",
        userId: testUserId,
      });

      expect(fuzzy.entityId).toBe(base.entityId);
      expect(fuzzy.created).toBe(false);
      expect(fuzzy.basis).toBe("fuzzy_match");
      expect(fuzzy.fuzzyScore).toBeGreaterThanOrEqual(COMPANY_FUZZY_MATCH_THRESHOLD);

      const { data } = await db
        .from("entities")
        .select("id")
        .eq("entity_type", "company")
        .eq("user_id", testUserId);
      expect((data ?? []).length).toBe(1);
    });

    it("does NOT collapse two distinct companies that merely look similar (false-positive guard)", async () => {
      const contoso8 = await resolveCompanyEntity({
        organizationName: "Contoso8",
        userId: testUserId,
      });
      // "Contoso9" is a different company one character off — must NOT collapse
      // (levenshtein similarity ~0.875, below the 0.88 threshold).
      const contoso9 = await resolveCompanyEntity({
        organizationName: "Contoso9",
        userId: testUserId,
      });

      expect(contoso9.entityId).not.toBe(contoso8.entityId);
      expect(contoso9.created).toBe(true);

      const { data } = await db
        .from("entities")
        .select("id")
        .eq("entity_type", "company")
        .eq("user_id", testUserId);
      expect((data ?? []).length).toBe(2);
    });

    it("does not fuzzy-match across unrelated company names", async () => {
      await resolveCompanyEntity({ organizationName: "Stripe", userId: testUserId });
      const result = await resolveCompanyEntity({
        organizationName: "Stride Financial",
        userId: testUserId,
      });

      expect(result.created).toBe(true);
      expect(result.basis).toBe("created");
    });

    it("respects a caller-supplied stricter threshold", async () => {
      const base = await resolveCompanyEntity({ organizationName: "Contoso8", userId: testUserId });
      // With threshold 0.95, "Contoso 8" (score ~0.889) must NOT match and a new entity is created.
      const strict = await resolveCompanyEntity({
        organizationName: "Contoso 8",
        userId: testUserId,
        threshold: 0.95,
      });
      expect(strict.entityId).not.toBe(base.entityId);
      expect(strict.created).toBe(true);
    });

    it("scopes fuzzy matching to the requesting user (tenant isolation)", async () => {
      const otherUserId = "00000000-0000-0000-0000-00000000c092";
      await db.from("entities").delete().eq("entity_type", "company").eq("user_id", otherUserId);

      await resolveCompanyEntity({ organizationName: "Contoso8", userId: otherUserId });
      const result = await resolveCompanyEntity({
        organizationName: "Contoso 8",
        userId: testUserId,
      });

      // No cross-tenant fuzzy match: a new entity is created for testUserId.
      expect(result.created).toBe(true);

      await db.from("entities").delete().eq("entity_type", "company").eq("user_id", otherUserId);
    });
  });

  describe("resolveCompanyEntity: userId is required (cross-tenant leak guard)", () => {
    it("throws when userId is undefined instead of silently scanning/creating across all tenants", async () => {
      await expect(
        resolveCompanyEntity({
          organizationName: "Contoso8",
          // @ts-expect-error — userId is required; this exercises the runtime guard
          // for callers that bypass the type system (e.g. plain JS callers).
          userId: undefined,
        })
      ).rejects.toThrow(/requires a non-empty userId/);
    });

    it("throws when userId is an empty string", async () => {
      await expect(
        resolveCompanyEntity({
          organizationName: "Contoso8",
          userId: "",
        })
      ).rejects.toThrow(/requires a non-empty userId/);
    });
  });
});
