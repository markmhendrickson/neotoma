import { describe, expect, it } from "vitest";
import {
  buildCanonicalUrl,
  buildRobotsTxt,
  buildSitemapXml,
  getSeoMetadataForPath,
  injectRouteMetaIntoHtml,
  resolveSeoMetadata,
  SITEMAP_PATHS,
} from "../../frontend/src/site/seo_metadata";

const INDEXABLE_ROUTES = [
  "/",
  "/install",
  "/docs",
  "/terminology",
  "/agent-instructions",
  "/api",
  "/mcp",
  "/cli",
  "/architecture",
  "/ai-infrastructure-engineers",
  "/ai-native-operators",
  "/agentic-systems-builders",
  "/neotoma-with-cursor",
  "/neotoma-with-claude",
  "/neotoma-with-claude-code",
  "/neotoma-with-chatgpt",
  "/neotoma-with-codex",
  "/neotoma-with-openclaw",
  "/deterministic-state-evolution",
  "/versioned-history",
  "/replayable-timeline",
  "/auditable-change-log",
  "/schema-constraints",
  "/silent-mutation-risk",
  "/conflicting-facts-risk",
  "/reproducible-state-reconstruction",
  "/human-inspectability",
  "/zero-setup-onboarding",
  "/semantic-similarity-search",
  "/direct-human-editability",
  "/platform-memory",
  "/retrieval-memory",
  "/file-based-memory",
  "/deterministic-memory",
  "/memory-guarantees",
  "/foundations",
  "/memory-vendors",
  "/privacy-first",
  "/cross-platform",
];

describe("seo_metadata", () => {
  it("resolves home route metadata with canonical URL", () => {
    const metadata = resolveSeoMetadata("/");

    expect(metadata.title).toContain("Neotoma");
    expect(metadata.canonicalUrl).toBe("https://neotoma.io/");
    expect(metadata.robots).toBe("index,follow");
  });

  it("maps docs child routes to docs metadata", () => {
    const metadata = getSeoMetadataForPath("/docs/developer/getting_started.md");

    expect(metadata.title).toContain("Neotoma Documentation");
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
    expect(buildCanonicalUrl("/docs/?q=test")).toBe(
      "https://neotoma.io/docs"
    );
  });

  it("builds localized canonical URLs for locale-prefixed routes", () => {
    expect(buildCanonicalUrl("/es/docs")).toBe("https://neotoma.io/es/docs");
    expect(buildCanonicalUrl("/de/architecture")).toBe("https://neotoma.io/de/architecture");
  });

  it("resolves locale-specific OG locale and alternates", () => {
    const metadata = resolveSeoMetadata("/es/docs");
    expect(metadata.ogLocale).toBe("es_ES");
    expect(metadata.alternates.find((entry) => entry.hrefLang === "x-default")?.href).toBe("https://neotoma.io/docs");
    expect(metadata.alternates.find((entry) => entry.hrefLang === "es")?.href).toBe("https://neotoma.io/es/docs");
    expect(metadata.alternates.find((entry) => entry.hrefLang === "en")?.href).toBe("https://neotoma.io/docs");
  });

  describe("all indexable routes", () => {
    it.each(INDEXABLE_ROUTES)("resolves metadata for %s", (route) => {
      const metadata = resolveSeoMetadata(route);
      expect(metadata.title).toBeTruthy();
      expect(metadata.title).toContain("Neotoma");
      expect(metadata.description.length).toBeGreaterThan(20);
      expect(metadata.robots).toBe("index,follow");
      expect(metadata.canonicalUrl).toMatch(/^https:\/\/neotoma\.io/);
    });

    it.each(INDEXABLE_ROUTES)("generates valid JSON-LD for %s", (route) => {
      const metadata = resolveSeoMetadata(route);
      expect(metadata.jsonLd.length).toBeGreaterThanOrEqual(1);
      const primary = metadata.jsonLd[0];
      expect(primary["@context"]).toBe("https://schema.org");
      expect(primary["@type"]).toBeTruthy();
      expect(primary["url"]).toBe(buildCanonicalUrl(route));
    });
  });

  describe("sitemap completeness", () => {
    it("SITEMAP_PATHS includes all indexable routes", () => {
      for (const route of INDEXABLE_ROUTES) {
        expect(SITEMAP_PATHS).toContain(route);
      }
      expect(SITEMAP_PATHS).toContain("/es/docs");
      expect(SITEMAP_PATHS).toContain("/de/architecture");
    });

    it("SITEMAP_PATHS does not include noindex routes", () => {
      expect(SITEMAP_PATHS).not.toContain("/404");
    });

    it("default buildSitemapXml includes all indexable routes", () => {
      const sitemap = buildSitemapXml();
      for (const route of INDEXABLE_ROUTES) {
        expect(sitemap).toContain(`<loc>${buildCanonicalUrl(route)}</loc>`);
      }
    });
  });

  describe("structured data", () => {
    it("homepage uses WebSite type", () => {
      const metadata = resolveSeoMetadata("/");
      expect(metadata.jsonLd[0]["@type"]).toBe("WebSite");
    });

    it("docs page includes BreadcrumbList", () => {
      const metadata = resolveSeoMetadata("/docs");
      const breadcrumb = metadata.jsonLd.find(
        (entry) => entry["@type"] === "BreadcrumbList"
      );
      expect(breadcrumb).toBeDefined();
      expect(
        (breadcrumb!["itemListElement"] as unknown[]).length
      ).toBeGreaterThanOrEqual(2);
    });

    it("subpages include BreadcrumbList", () => {
      const metadata = resolveSeoMetadata("/architecture");
      const breadcrumb = metadata.jsonLd.find(
        (entry) => entry["@type"] === "BreadcrumbList"
      );
      expect(breadcrumb).toBeDefined();
    });
  });

  describe("injectRouteMetaIntoHtml", () => {
    const TEMPLATE = [
      '<!doctype html><html lang="en"><head>',
      '<title>Neotoma | The truth layer for persistent AI agent memory</title>',
      '<meta name="description" content="Truth layer for persistent AI agent memory: deterministic, inspectable state. Install with npm, connect MCP, query memory." />',
      '<meta name="robots" content="index,follow" />',
      '<link rel="canonical" href="https://neotoma.io/" />',
      '<meta property="og:title" content="Neotoma | The truth layer for persistent AI agent memory" />',
      '<meta property="og:description" content="Truth layer for persistent AI agent memory: deterministic, inspectable state. Install with npm, connect MCP, query memory." />',
      '<meta property="og:url" content="https://neotoma.io/" />',
      '<meta name="twitter:title" content="Neotoma | The truth layer for persistent AI agent memory" />',
      '<meta name="twitter:description" content="Truth layer for persistent AI agent memory: deterministic, inspectable state. Install with npm, connect MCP, query memory." />',
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage"}</script>',
      '</head><body><div id="root"></div></body></html>',
    ].join("\n");

    it("replaces title for a subpage route", () => {
      const result = injectRouteMetaIntoHtml(TEMPLATE, "/architecture");
      expect(result).toContain("<title>Architecture | Neotoma</title>");
      expect(result).not.toContain("The truth layer for persistent AI agent memory</title>");
    });

    it("replaces canonical URL for a subpage route", () => {
      const result = injectRouteMetaIntoHtml(TEMPLATE, "/docs");
      expect(result).toContain('href="https://neotoma.io/docs"');
    });

    it("sets html lang for localized routes", () => {
      const result = injectRouteMetaIntoHtml(TEMPLATE, "/fr/docs");
      expect(result).toContain('<html lang="fr">');
      expect(result).toContain('property="og:locale" content="fr_FR"');
    });

    it("replaces OG and Twitter meta for a subpage route", () => {
      const result = injectRouteMetaIntoHtml(TEMPLATE, "/cli");
      expect(result).toContain('og:title" content="CLI Reference | Neotoma"');
      expect(result).toContain('twitter:title" content="CLI Reference | Neotoma"');
      expect(result).toContain('og:url" content="https://neotoma.io/cli"');
    });

    it("replaces JSON-LD with route-specific structured data", () => {
      const result = injectRouteMetaIntoHtml(TEMPLATE, "/docs");
      expect(result).toContain('"@type":"BreadcrumbList"');
      expect(result).toContain("https://neotoma.io/docs");
    });

    it("leaves homepage template mostly unchanged for root route", () => {
      const result = injectRouteMetaIntoHtml(TEMPLATE, "/");
      expect(result).toContain("<title>Neotoma | The truth layer for persistent AI agent memory</title>");
      expect(result).toContain('href="https://neotoma.io/"');
    });
  });
});
