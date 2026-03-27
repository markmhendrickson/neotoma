import { describe, expect, it } from "vitest";
import {
  buildCanonicalUrl,
  buildDefaultOgImageAlt,
  buildKeywords,
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
    expect(metadata.ogImageAlt.length).toBeGreaterThan(10);
    expect(metadata.keywords).toContain("Neotoma");
    expect(metadata.twitterCard).toBe("summary_large_image");
    const primary = metadata.jsonLd[0] as Record<string, unknown>;
    expect(primary.image).toBeDefined();
  });

  it("buildDefaultOgImageAlt truncates long descriptions", () => {
    const long = "x".repeat(300);
    const alt = buildDefaultOgImageAlt("Title", long);
    expect(alt.length).toBeLessThanOrEqual(203);
    expect(alt.startsWith("Title.")).toBe(true);
  });

  it("buildKeywords merges route keywords with defaults", () => {
    const k = buildKeywords({
      title: "Install | Neotoma",
      description: "Install steps.",
      robots: "index,follow",
      keywords: ["Docker"],
    });
    expect(k).toContain("Neotoma");
    expect(k).toContain("Docker");
    expect(k).toContain("MCP");
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
      '<title>Neotoma | The state layer for persistent AI agent memory</title>',
      '<meta name="description" content="Truth layer for persistent AI agent memory: deterministic, inspectable state. Install with npm, connect MCP, query memory." />',
      '<meta name="robots" content="index,follow" />',
      '<link rel="canonical" href="https://neotoma.io/" />',
      '<meta property="og:type" content="website" />',
      '<meta property="og:title" content="Neotoma | The state layer for persistent AI agent memory" />',
      '<meta property="og:description" content="Truth layer for persistent AI agent memory: deterministic, inspectable state. Install with npm, connect MCP, query memory." />',
      '<meta property="og:url" content="https://neotoma.io/" />',
      '<meta property="og:image" content="https://neotoma.io/neotoma-og-1200x630.png" />',
      '<meta property="og:image:width" content="1200" />',
      '<meta property="og:image:height" content="630" />',
      '<meta property="og:image:alt" content="placeholder" />',
      '<meta name="keywords" content="placeholder" />',
      '<meta name="twitter:card" content="summary_large_image" />',
      '<meta name="twitter:title" content="Neotoma | The state layer for persistent AI agent memory" />',
      '<meta name="twitter:description" content="Truth layer for persistent AI agent memory: deterministic, inspectable state. Install with npm, connect MCP, query memory." />',
      '<meta name="twitter:image" content="https://neotoma.io/neotoma-og-1200x630.png" />',
      '<meta name="twitter:image:width" content="1200" />',
      '<meta name="twitter:image:height" content="630" />',
      '<meta name="twitter:image:alt" content="placeholder" />',
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage"}</script>',
      '</head><body><div id="root"></div></body></html>',
    ].join("\n");

    it("replaces title for a subpage route", () => {
      const result = injectRouteMetaIntoHtml(TEMPLATE, "/architecture");
      expect(result).toContain("<title>Architecture | Neotoma</title>");
      expect(result).not.toContain("The state layer for persistent AI agent memory</title>");
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
      expect(result).toContain('og:image:alt" content="');
      expect(result).toContain('twitter:image:alt" content="');
      expect(result).toContain('name="keywords" content="');
    });

    it("replaces JSON-LD with route-specific structured data", () => {
      const result = injectRouteMetaIntoHtml(TEMPLATE, "/docs");
      expect(result).toContain('"@type":"BreadcrumbList"');
      expect(result).toContain("https://neotoma.io/docs");
    });

    it("leaves homepage template mostly unchanged for root route", () => {
      const result = injectRouteMetaIntoHtml(TEMPLATE, "/");
      expect(result).toContain("<title>Neotoma | Deterministic state layer for long-running agents</title>");
      expect(result).toContain('href="https://neotoma.io/"');
    });
  });
});
