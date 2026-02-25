import { describe, expect, it } from "vitest";
import {
  buildCanonicalUrl,
  buildRobotsTxt,
  buildSitemapXml,
  getSeoMetadataForPath,
  resolveSeoMetadata,
} from "../../frontend/src/site/seo_metadata";

describe("seo_metadata", () => {
  it("resolves home route metadata with canonical URL", () => {
    const metadata = resolveSeoMetadata("/");

    expect(metadata.title).toContain("Neotoma");
    expect(metadata.canonicalUrl).toBe("https://neotoma.io/");
    expect(metadata.robots).toBe("index,follow");
  });

  it("maps docs child routes to docs metadata", () => {
    const metadata = getSeoMetadataForPath("/docs/developer/getting_started.md");

    expect(metadata.title).toBe("Neotoma Documentation");
    expect(metadata.robots).toBe("index,follow");
  });

  it("uses noindex metadata for unknown routes", () => {
    const metadata = resolveSeoMetadata("/this-route-does-not-exist");

    expect(metadata.title).toBe("Page Not Found | Neotoma");
    expect(metadata.robots).toBe("noindex,follow");
  });

  it("builds robots file with sitemap reference", () => {
    const robots = buildRobotsTxt();

    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Sitemap: https://neotoma.io/sitemap.xml");
  });

  it("builds sitemap with expected canonical URLs", () => {
    const sitemap = buildSitemapXml(["/", "/docs"]);

    expect(sitemap).toContain("<loc>https://neotoma.io/</loc>");
    expect(sitemap).toContain("<loc>https://neotoma.io/docs</loc>");
  });

  it("normalizes canonical URLs with query and trailing slash", () => {
    expect(buildCanonicalUrl("/docs/?q=test")).toBe("https://neotoma.io/docs");
  });
});
