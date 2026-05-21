/**
 * Unit tests for the pure search-ranking and bookkeeping helpers added in
 * v0.14.0. These functions drive result ordering for `retrieve_entities` and
 * are easy to regress under future refactor; the integration tests cover the
 * end-to-end search path but do not assert boost magnitude, singular/plural
 * normalization, or token-removal behavior directly.
 *
 * No DB access required — every helper exercised here is pure.
 */

import { describe, it, expect } from "vitest";
import {
  ENTITY_TYPE_KEYWORD_BOOST,
  shouldExcludeBookkeepingFromSearch,
  searchTokenMatchesEntityType,
  entityTypeKeywordBoost,
  buildEntityTypeFilterTokens,
  textTokensForEntityMatch,
  buildEntityLexicalSearchText,
  normalizeSearchText,
  matchesSearchTokens,
} from "./entity_handlers.js";

describe("ENTITY_TYPE_KEYWORD_BOOST", () => {
  it("is the documented constant 280", () => {
    // The exact magnitude is part of the search contract — flag if changed.
    expect(ENTITY_TYPE_KEYWORD_BOOST).toBe(280);
  });
});

describe("shouldExcludeBookkeepingFromSearch", () => {
  it("returns true when no entity_type filter is provided (search across all types)", () => {
    expect(shouldExcludeBookkeepingFromSearch(undefined)).toBe(true);
    expect(shouldExcludeBookkeepingFromSearch("")).toBe(true);
  });

  it("returns false when the caller explicitly filters to a bookkeeping type", () => {
    // Explicit type filter wins — searching for conversations should return conversations.
    expect(shouldExcludeBookkeepingFromSearch("conversation")).toBe(false);
    expect(shouldExcludeBookkeepingFromSearch("conversation_message")).toBe(false);
  });

  it("returns true when filtering to a non-bookkeeping type", () => {
    // Non-bookkeeping types in this branch return true (helper expresses
    // "would excluding bookkeeping be safe here?" — yes, the caller didn't
    // ask for a bookkeeping type).
    expect(shouldExcludeBookkeepingFromSearch("task")).toBe(true);
    expect(shouldExcludeBookkeepingFromSearch("transaction")).toBe(true);
    expect(shouldExcludeBookkeepingFromSearch("note")).toBe(true);
  });
});

describe("searchTokenMatchesEntityType", () => {
  it("matches exact singular tokens", () => {
    expect(searchTokenMatchesEntityType("plan", "plan")).toBe(true);
    expect(searchTokenMatchesEntityType("task", "task")).toBe(true);
  });

  it("matches conventional plural tokens via suggestSingular", () => {
    expect(searchTokenMatchesEntityType("plans", "plan")).toBe(true);
    expect(searchTokenMatchesEntityType("tasks", "task")).toBe(true);
    expect(searchTokenMatchesEntityType("transactions", "transaction")).toBe(true);
  });

  it("does not match unrelated tokens", () => {
    expect(searchTokenMatchesEntityType("project", "plan")).toBe(false);
    expect(searchTokenMatchesEntityType("note", "task")).toBe(false);
  });

  it("returns false for empty inputs", () => {
    expect(searchTokenMatchesEntityType("", "plan")).toBe(false);
    expect(searchTokenMatchesEntityType("plan", "")).toBe(false);
    expect(searchTokenMatchesEntityType("", "")).toBe(false);
  });

  it("normalizes casing and punctuation in both sides", () => {
    expect(searchTokenMatchesEntityType("PLANS", "plan")).toBe(true);
    expect(searchTokenMatchesEntityType("plans!", "plan")).toBe(true);
  });
});

describe("entityTypeKeywordBoost", () => {
  it("returns ENTITY_TYPE_KEYWORD_BOOST when any token matches the entity_type", () => {
    expect(entityTypeKeywordBoost("plan", ["newest", "plans"])).toBe(ENTITY_TYPE_KEYWORD_BOOST);
    expect(entityTypeKeywordBoost("task", ["task"])).toBe(ENTITY_TYPE_KEYWORD_BOOST);
  });

  it("returns 0 when no token matches", () => {
    expect(entityTypeKeywordBoost("plan", ["random", "words"])).toBe(0);
    expect(entityTypeKeywordBoost("plan", [])).toBe(0);
  });

  it("returns the boost (not multiplied) when multiple tokens match", () => {
    // Multiple matching tokens should still yield a single boost — the boost
    // is a type-relevance signal, not a per-token counter.
    expect(entityTypeKeywordBoost("plan", ["plan", "plans"])).toBe(ENTITY_TYPE_KEYWORD_BOOST);
  });
});

describe("buildEntityTypeFilterTokens", () => {
  const known = new Set(["plan", "task", "transaction", "conversation"]);

  it("resolves exact-match tokens to the canonical type", () => {
    const filters = buildEntityTypeFilterTokens(["plan"], known);
    expect([...filters]).toEqual(["plan"]);
  });

  it("resolves plural-form tokens via suggestSingular", () => {
    const filters = buildEntityTypeFilterTokens(["plans", "tasks"], known);
    expect(filters.has("plan")).toBe(true);
    expect(filters.has("task")).toBe(true);
    expect(filters.size).toBe(2);
  });

  it("ignores tokens that do not name any known entity_type", () => {
    const filters = buildEntityTypeFilterTokens(["newest", "stuff"], known);
    expect(filters.size).toBe(0);
  });

  it("returns an empty set for an empty input", () => {
    expect(buildEntityTypeFilterTokens([], known).size).toBe(0);
  });

  it("returns an empty set when knownEntityTypes is empty", () => {
    expect(buildEntityTypeFilterTokens(["plans"], new Set()).size).toBe(0);
  });
});

describe("textTokensForEntityMatch", () => {
  it("returns all tokens when there are no type-filter tokens (no narrowing)", () => {
    const tokens = ["newest", "report"];
    expect(textTokensForEntityMatch(tokens, "report", new Set())).toEqual(tokens);
  });

  it("removes type-filter tokens when the entity satisfies the type filter", () => {
    // "plans" became a type filter and the entity is of that type — drop it
    // from text-matching so a plan entity matches just on "newest".
    expect(textTokensForEntityMatch(["newest", "plans"], "plan", new Set(["plan"]))).toEqual([
      "newest",
    ]);
  });

  it("leaves all tokens intact when the entity does not satisfy the type filter", () => {
    // Type filter was "plan" but this row is a task — keep all tokens so the
    // task is judged on full text including "plans".
    expect(textTokensForEntityMatch(["newest", "plans"], "task", new Set(["plan"]))).toEqual([
      "newest",
      "plans",
    ]);
  });

  it("handles multiple matching type-filter tokens", () => {
    expect(
      textTokensForEntityMatch(["newest", "plans", "tasks"], "plan", new Set(["plan", "task"]))
    ).toEqual(["newest"]);
  });
});

describe("buildEntityLexicalSearchText", () => {
  it("concatenates canonical name + snapshot + fragment text, normalized", () => {
    const result = buildEntityLexicalSearchText("Plan: Ship v0.14.0", { status: "active" });
    expect(result).toContain("plan ship v0140");
    expect(result).toContain("active");
  });

  it("omits raw_fragments text when undefined", () => {
    const result = buildEntityLexicalSearchText("Name", { foo: "bar" });
    expect(result).toContain("name");
    expect(result).toContain("bar");
  });

  it("includes raw_fragments text when provided", () => {
    const result = buildEntityLexicalSearchText("Name", { foo: "bar" }, "extra_key extra_value");
    expect(result).toContain("name");
    expect(result).toContain("bar");
    expect(result).toContain("extra key extra value");
  });

  it("returns an empty string when all inputs are empty", () => {
    expect(buildEntityLexicalSearchText("", null)).toBe("");
  });
});

describe("normalizeSearchText", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeSearchText("Hello, World!")).toBe("hello world");
  });

  it("collapses underscores and hyphens to spaces", () => {
    expect(normalizeSearchText("entity_type-name")).toBe("entity type name");
  });

  it("collapses consecutive whitespace", () => {
    expect(normalizeSearchText("a    b\tc")).toBe("a b c");
  });

  it("trims edges", () => {
    expect(normalizeSearchText("   hello   ")).toBe("hello");
  });
});

describe("matchesSearchTokens", () => {
  it("returns true when every token appears in the normalized haystack", () => {
    expect(matchesSearchTokens("hello world", ["hello", "world"])).toBe(true);
  });

  it("returns false when any token is missing", () => {
    expect(matchesSearchTokens("hello world", ["hello", "missing"])).toBe(false);
  });

  it("returns false for an empty token list", () => {
    // Empty token list cannot match — caller should special-case this.
    expect(matchesSearchTokens("anything", [])).toBe(false);
  });
});
