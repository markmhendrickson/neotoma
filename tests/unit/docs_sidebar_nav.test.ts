import { describe, expect, it } from "vitest";
import { isPathUnderDocsSidebarNav } from "../../frontend/src/site/docs_sidebar_nav";

describe("isPathUnderDocsSidebarNav", () => {
  it("returns false for root", () => {
    expect(isPathUnderDocsSidebarNav("/")).toBe(false);
  });

  it("matches current doc-nav paths while excluding the retired docs index", () => {
    expect(isPathUnderDocsSidebarNav("/docs")).toBe(false);
    expect(isPathUnderDocsSidebarNav("/readme/")).toBe(true);
    expect(isPathUnderDocsSidebarNav("/install")).toBe(true);
    expect(isPathUnderDocsSidebarNav("/neotoma-with-cursor")).toBe(true);
    expect(isPathUnderDocsSidebarNav("/api")).toBe(true);
  });

  it("matches nested paths under a doc-nav base", () => {
    expect(isPathUnderDocsSidebarNav("/install/deeper")).toBe(true);
    expect(isPathUnderDocsSidebarNav("/neotoma-with-claude-code/setup")).toBe(true);
  });

  it("does not match unrelated prefixes", () => {
    expect(isPathUnderDocsSidebarNav("/api-keys")).toBe(false);
    expect(isPathUnderDocsSidebarNav("/missing-page")).toBe(false);
  });

  it("matches site-markdown hub when listed in doc nav", () => {
    expect(isPathUnderDocsSidebarNav("/site-markdown")).toBe(true);
  });

  it("does not treat sibling integration paths as nested", () => {
    expect(isPathUnderDocsSidebarNav("/neotoma-with-claude-code")).toBe(true);
    expect(isPathUnderDocsSidebarNav("/neotoma-with-claude")).toBe(true);
  });

  it("matches docs shell paths that are not doc-nav links", () => {
    expect(isPathUnderDocsSidebarNav("/neotoma-with-claude-agent-sdk")).toBe(true);
  });
});
