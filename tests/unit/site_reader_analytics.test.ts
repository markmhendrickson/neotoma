import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { readerAnalyticsTag } from "../../scripts/docs_viewer/page";
import { unsafeMarkup } from "../../scripts/docs_viewer/validate_export";
import { canonicalUmamiBaseUrl } from "../../frontend/src/utils/site_analytics_contract";

const reader = { slug: "mcp" } as Parameters<typeof readerAnalyticsTag>[0];

afterEach(() => vi.unstubAllEnvs());

describe("optional static reader analytics", () => {
  it("emits no bootstrap or network path without existing Umami config", () => {
    vi.stubEnv("VITE_UMAMI_URL", "");
    vi.stubEnv("VITE_UMAMI_WEBSITE_ID", "");
    expect(readerAnalyticsTag(reader)).toBe("");
  });

  it("allows exactly one fixed same-origin bootstrap while rejecting arbitrary scripts", () => {
    vi.stubEnv("VITE_UMAMI_URL", "https://metrics.example");
    vi.stubEnv("VITE_UMAMI_WEBSITE_ID", "11111111-1111-4111-8111-111111111111");
    const tag = readerAnalyticsTag(reader);
    expect(tag).toContain('src="/assets/reader-analytics.js"');
    expect(tag).toContain('data-page-path="/mcp/"');
    expect(unsafeMarkup(`<style></style>${tag}`)).toEqual([]);
    expect(unsafeMarkup(`<style></style>${tag}<script>alert(1)</script>`)).toContain(
      "contains a <script> element"
    );
    expect(unsafeMarkup('<style></style><script src="/assets/evil.js"></script>')).toContain(
      "contains a <script> element"
    );
    for (const extra of [
      '<script src="https://evil.example/x.js"></script >',
      '<script src="https://evil.example/x.js">',
      `<!--${tag}--><script src="https://evil.example/x.js">`,
      tag,
      '<script defer src="/assets/reader-analytics.js" data-neotoma-reader-analytics="1" data-website-id="11111111-1111-4111-8111-111111111111" data-umami-url="https://metrics.example" data-page-path="/mcp/" onclick="steal()"></script>',
    ]) {
      const html = `<style></style>${tag}${extra}`;
      expect(unsafeMarkup(html), extra).toContain("contains a <script> element");
      if (extra.includes("evil.example"))
        expect(new JSDOM(html).window.document.scripts.length, extra).toBeGreaterThan(1);
    }
  });

  it("preserves a validated configured Umami subpath", () => {
    vi.stubEnv("VITE_UMAMI_URL", "https://metrics.example/analytics/");
    vi.stubEnv("VITE_UMAMI_WEBSITE_ID", "11111111-1111-4111-8111-111111111111");
    const tag = readerAnalyticsTag(reader);
    expect(tag).toContain('data-umami-url="https://metrics.example/analytics"');
    expect(unsafeMarkup(`<style></style>${tag}`)).toEqual([]);
  });

  it("shares a fail-closed analytics base URL rule across SPA and reader", () => {
    expect(canonicalUmamiBaseUrl("https://metrics.example/analytics/")).toBe(
      "https://metrics.example/analytics"
    );
    for (const unsafe of [
      "http://metrics.example/analytics",
      "https://user:pass@metrics.example/analytics",
      "https://metrics.example/analytics?token=secret",
      "https://metrics.example/analytics#private",
      "https://metrics.example/analytics/../other",
      "https://metrics.example/analytics%2Fprivate",
    ]) {
      expect(canonicalUmamiBaseUrl(unsafe), unsafe).toBeUndefined();
      vi.stubEnv("VITE_UMAMI_URL", unsafe);
      vi.stubEnv("VITE_UMAMI_WEBSITE_ID", "11111111-1111-4111-8111-111111111111");
      expect(() => readerAnalyticsTag(reader), unsafe).toThrow();
    }
  });
});
