/**
 * Unit tests for the shared search-text normalizer (#1572).
 *
 * This module is the single source of truth for query/synonym normalization,
 * imported by both the lexical-search handler and the schema registry (which
 * previously each held a byte-identical copy). These tests pin the
 * normalization contract so the two consumers stay in lock-step.
 */

import { describe, expect, it } from "vitest";
import { normalizeSearchText } from "../../src/shared/search_normalization.js";
// Re-exported from entity_handlers for back-compat — must resolve to the same fn.
import { normalizeSearchText as normalizeViaHandlers } from "../../src/shared/action_handlers/entity_handlers.js";

describe("normalizeSearchText (#1572 shared normalizer)", () => {
  it("lowercases", () => {
    expect(normalizeSearchText("Bank ACCOUNT")).toBe("bank account");
  });

  it("maps hyphen and underscore to space", () => {
    expect(normalizeSearchText("bank-account_balance")).toBe("bank account balance");
  });

  it("strips non-word punctuation", () => {
    expect(normalizeSearchText("bank, account! (savings)")).toBe("bank account savings");
  });

  it("collapses whitespace and trims", () => {
    expect(normalizeSearchText("  bank   account \n savings  ")).toBe("bank account savings");
  });

  it("returns empty string for all-punctuation input", () => {
    expect(normalizeSearchText("!!! ,. ()")).toBe("");
  });

  it("is re-exported from entity_handlers as the same implementation", () => {
    // Both import paths must resolve to one function — the duplication #1572
    // removed would otherwise let them drift.
    expect(normalizeViaHandlers).toBe(normalizeSearchText);
  });
});
