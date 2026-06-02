import { describe, expect, it } from "vitest";
import {
  buildSearchLocation,
  buildSearchPathname,
  parseSearchQueryFromPathname,
  resolveSearchQuery,
} from "./search_route";

describe("search_route", () => {
  it("parses query from path segment", () => {
    expect(parseSearchQueryFromPathname("/search/neotoma")).toBe("neotoma");
    expect(parseSearchQueryFromPathname("/search/hello%20world")).toBe("hello world");
    expect(parseSearchQueryFromPathname("/search")).toBe("");
    expect(parseSearchQueryFromPathname("/entities")).toBe("");
  });

  it("prefers path segment over legacy search param", () => {
    const params = new URLSearchParams("search=legacy");
    expect(resolveSearchQuery("/search/neotoma", params)).toBe("neotoma");
  });

  it("falls back to legacy search param on bare /search", () => {
    const params = new URLSearchParams("search=neotoma");
    expect(resolveSearchQuery("/search", params)).toBe("neotoma");
  });

  it("builds pathname with encoded query", () => {
    expect(buildSearchPathname("neotoma")).toBe("/search/neotoma");
    expect(buildSearchPathname("hello world")).toBe("/search/hello%20world");
    expect(buildSearchPathname("")).toBe("/search");
    expect(buildSearchPathname("   ")).toBe("/search");
  });

  it("builds location without search query param", () => {
    const { pathname, search } = buildSearchLocation({
      query: "neotoma",
      kind: "entities",
      entityType: "task",
    });
    expect(pathname).toBe("/search/neotoma");
    expect(search).toBe("?kind=entities&type=task");
    expect(search.includes("search=")).toBe(false);
  });
});
