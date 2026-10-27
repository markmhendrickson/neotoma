import { describe, expect, it } from "vitest";
import { DOCS_VIEWER_INDEX, SPANISH_DOCS_VIEWER_INDEX } from "./docs_viewer_manifest";
import { isSpanishRetainedBaseRoute, SPANISH_RETAINED_BASE_ROUTES } from "./spanish_route_set";

describe("exact public Spanish route inventory", () => {
  it("binds one home, 36 source readers and 19 shells", () => {
    expect(SPANISH_RETAINED_BASE_ROUTES).toHaveLength(56);
    expect(new Set(SPANISH_RETAINED_BASE_ROUTES).size).toBe(56);
    expect(SPANISH_RETAINED_BASE_ROUTES[0]).toBe("/");
    expect(DOCS_VIEWER_INDEX.entries).toHaveLength(36);
    expect(SPANISH_DOCS_VIEWER_INDEX.entries).toHaveLength(36);
    for (const entry of SPANISH_DOCS_VIEWER_INDEX.entries) {
      expect(isSpanishRetainedBaseRoute(`/${entry.slug.replace(/^es\//, "")}`)).toBe(true);
      expect(entry.originalSource).toBeTruthy();
      expect(entry.source).toMatch(/\/es\//);
    }
    expect(SPANISH_RETAINED_BASE_ROUTES.filter((route) => route !== "/" && !SPANISH_DOCS_VIEWER_INDEX.entries.some((entry) => route === `/${entry.slug.replace(/^es\//, "")}`))).toHaveLength(19);
  });

  it("does not admit a language prefix, retired route, or unknown skill", () => {
    for (const route of ["/es/install", "/en/install", "/install/manual", "/skills/unknown", "/docs/mcp", "/integrations/old"]) {
      expect(isSpanishRetainedBaseRoute(route)).toBe(false);
    }
  });
});
