import { describe, expect, it } from "vitest";
import { allowsDocsCaptureRequest } from "../../scripts/docs_viewer/dev";

const origin = "http://127.0.0.1:5301";
const allows = (path: string, method = "GET", base = origin) =>
  allowsDocsCaptureRequest(`${base}${path}`, method, origin);

describe("local docs reader topic-capture requests", () => {
  it("allows Vite 7 optimized dependency assets on the same local origin", () => {
    for (const method of ["GET", "HEAD"]) {
      expect(allows("/.vite/deps/react.js?v=abc123", method)).toBe(true);
      expect(allows("/.vite/deps/chunk-ABC123.js?v=abc123", method)).toBe(true);
    }
  });

  it("retains the bounded same-origin static-asset and method restriction", () => {
    for (const path of [
      "/en/",
      "/@vite/client",
      "/src/main.tsx",
      "/assets/main.js",
      "/brand/n2-nav.svg",
    ])
      expect(allows(path), path).toBe(true);
    for (const path of ["/.vite/private", "/api/records", "/mcp", "/source/.env"])
      expect(allows(path), path).toBe(false);
    expect(allows("/.vite/deps/react.js", "POST")).toBe(false);
    expect(allows("/.vite/deps/react.js", "GET", "https://example.test")).toBe(false);
  });
});
