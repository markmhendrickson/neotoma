import { describe, expect, it } from "vitest";
import {
  ENTITY_TYPE_KEYWORD_BOOST,
  buildEntityLexicalSearchText,
  buildEntityTypeFilterTokens,
  entityTypeKeywordBoost,
  refineTypeFilterTokens,
  searchTokenMatchesEntityType,
  shouldExcludeBookkeepingFromSearch,
  textTokensForEntityMatch,
} from "../../src/shared/action_handlers/entity_handlers.js";

describe("entity search entity_type keyword boost", () => {
  it("matches entity_type token exactly", () => {
    expect(searchTokenMatchesEntityType("plan", "plan")).toBe(true);
    expect(entityTypeKeywordBoost("plan", ["aibtc", "plan"])).toBe(ENTITY_TYPE_KEYWORD_BOOST);
  });

  it("matches conventional plural tokens to singular entity types", () => {
    expect(searchTokenMatchesEntityType("plans", "plan")).toBe(true);
    expect(entityTypeKeywordBoost("plan", ["aibtc", "plans"])).toBe(ENTITY_TYPE_KEYWORD_BOOST);
  });

  it("does not boost unrelated types", () => {
    expect(entityTypeKeywordBoost("note", ["aibtc", "plan"])).toBe(0);
    expect(searchTokenMatchesEntityType("plan", "note")).toBe(false);
  });

  it("includes raw fragment text in lexical haystack", () => {
    const haystack = buildEntityLexicalSearchText(
      "plan:Agent Swarm Testing Plan",
      { title: "Agent Swarm Testing Plan", status: "planning" },
      "networks AIBTC primary network"
    );
    expect(haystack).toContain("aibtc");
    expect(haystack).toContain("agent swarm testing plan");
  });

  it("excludes bookkeeping from unscoped search but not when type is explicit", () => {
    expect(shouldExcludeBookkeepingFromSearch()).toBe(true);
    expect(shouldExcludeBookkeepingFromSearch("plan")).toBe(true);
    expect(shouldExcludeBookkeepingFromSearch("conversation_message")).toBe(false);
  });

  it("treats entity_type tokens as type filters for matching rows", () => {
    const knownTypes = new Set(["plan", "note"]);
    const typeFilters = buildEntityTypeFilterTokens(["aibtc", "plan"], knownTypes);
    expect([...typeFilters]).toEqual(["plan"]);
    expect(textTokensForEntityMatch(["aibtc", "plan"], "plan", typeFilters)).toEqual(["aibtc"]);
    expect(textTokensForEntityMatch(["aibtc", "plan"], "note", typeFilters)).toEqual([
      "aibtc",
      "plan",
    ]);
  });

  it("does not treat trailing entity type names in multi-word titles as type filters", () => {
    const knownTypes = new Set(["plan", "strategy"]);
    const rawFilters = buildEntityTypeFilterTokens(
      ["schema", "packs", "strategy"],
      knownTypes
    );
    expect([...rawFilters]).toEqual(["strategy"]);
    expect([...refineTypeFilterTokens(["schema", "packs", "strategy"], rawFilters)]).toEqual([]);
  });

  it("keeps type filters for short qualifier queries like aibtc plan", () => {
    const knownTypes = new Set(["plan", "strategy"]);
    const rawFilters = buildEntityTypeFilterTokens(["aibtc", "plan"], knownTypes);
    expect([...refineTypeFilterTokens(["aibtc", "plan"], rawFilters)]).toEqual(["plan"]);
  });
});
