import { describe, expect, it } from "vitest";

/** Mirrors scripts/build_github_pages_site.tsx — keep in sync if renamed. */
function normalizeBundledAssetPaths(html: string): string {
  return html.replace(/(\.\.\/)+assets\//g, "/assets/");
}

describe("normalizeBundledAssetPaths", () => {
  it("collapses one or more ../ segments before assets/", () => {
    expect(normalizeBundledAssetPaths('<script src="../assets/x.js"></script>')).toBe(
      '<script src="/assets/x.js"></script>',
    );
    expect(normalizeBundledAssetPaths('<link href="../../assets/y.css" rel="stylesheet" />')).toBe(
      '<link href="/assets/y.css" rel="stylesheet" />',
    );
  });

  it("leaves root-absolute /assets/ unchanged", () => {
    const h = '<script type="module" src="/assets/main-abc.js"></script>';
    expect(normalizeBundledAssetPaths(h)).toBe(h);
  });
});
