import { describe, expect, it } from "vitest";
import { CONNECTIONS } from "../../../src/shared/harness_connections";
import { DOCS_VIEWER_INDEX, DOCS_VIEWER_MANIFEST, SPANISH_DOCS_VIEWER_INDEX } from "./docs_viewer_manifest";
import { isSpanishRetainedBaseRoute, SPANISH_RETAINED_BASE_ROUTES } from "./spanish_route_set";

describe("exact public Spanish route inventory", () => {
  it("binds one home, every included source reader and 19 shells", () => {
    const includedReaders = DOCS_VIEWER_MANIFEST.filter((entry) => entry.status === "included");
    const hostReaders = includedReaders.filter((entry) => entry.source.startsWith("docs/guides/connections/"));
    expect(hostReaders.map((entry) => entry.source)).toEqual(CONNECTIONS.map((connection) => connection.guide));
    expect(SPANISH_RETAINED_BASE_ROUTES).toHaveLength(1 + includedReaders.length + 19);
    expect(new Set(SPANISH_RETAINED_BASE_ROUTES).size).toBe(SPANISH_RETAINED_BASE_ROUTES.length);
    expect(SPANISH_RETAINED_BASE_ROUTES[0]).toBe("/");
    expect(DOCS_VIEWER_INDEX.entries).toHaveLength(includedReaders.length);
    expect(SPANISH_DOCS_VIEWER_INDEX.entries).toHaveLength(includedReaders.length);
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
