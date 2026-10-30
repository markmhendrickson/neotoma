import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { JSDOM } from "jsdom";
import { socialCardSourceProblems, socialImageProblems, socialImageReferences } from "../../scripts/social_image_validation";
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
  "/integrations",
  "/terminology",
  "/agent-instructions",
  "/api",
  "/mcp",
  "/cli",
  "/architecture",
  "/operating",
  "/building-pipelines",
  "/debugging-infrastructure",
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
    expect(metadata.title).toBe("Neotoma: the system of record for AI agents");
    expect(metadata.ogImageAlt).toContain("system of record for AI agents");
    expect(metadata.ogImageAlt).toMatch(/paper archive.*retained records/i);
    expect(metadata.ogImageAlt).not.toMatch(/drafting|blueprint/i);
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

  it("buildDefaultOgImageAlt avoids double punctuation when title already ends with a period", () => {
    const alt = buildDefaultOgImageAlt(
      "Your agents forget. Neotoma makes them remember.",
      "Short desc."
    );
    expect(alt).toBe("Your agents forget. Neotoma makes them remember. Short desc.");
    expect(alt).not.toMatch(/\.\./);
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

  it("keeps retired docs routes noindex", () => {
    const metadata = getSeoMetadataForPath("/docs/developer/getting_started.md");

    expect(metadata.title).toBe("References moved | Neotoma");
    expect(metadata.robots).toBe("noindex,follow");
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

  it("keeps a preview out of robots and its sitemap", () => {
    expect(buildRobotsTxt(true)).toBe("User-agent: *\nDisallow: /\n");
    expect(buildSitemapXml(["/", "/install"], true)).not.toContain("<loc>");
  });

  it("advertises the published package version in SoftwareApplication data", () => {
    const app = resolveSeoMetadata("/").jsonLd.find(
      (entry) => entry["@type"] === "SoftwareApplication"
    );
    expect(app?.softwareVersion).toBe("0.26.0");
  });

  it("builds sitemap with expected canonical URLs", () => {
    const sitemap = buildSitemapXml(["/", "/cli"]);

    expect(sitemap).toContain("<loc>https://neotoma.io/</loc>");
    expect(sitemap).toContain("<loc>https://neotoma.io/cli</loc>");
    expect(sitemap).not.toContain("<loc>https://neotoma.io/docs</loc>");
  });

  it("normalizes canonical URLs with query and trailing slash", () => {
    expect(buildCanonicalUrl("/arbitrary/path/?q=test")).toBe("https://neotoma.io/arbitrary/path");
  });

  it("builds localized canonical URLs for locale-prefixed routes", () => {
    expect(buildCanonicalUrl("/es/arbitrary/path")).toBe("https://neotoma.io/es/arbitrary/path");
    expect(buildCanonicalUrl("/de/arbitrary/path")).toBe("https://neotoma.io/de/arbitrary/path");
  });

  it("resolves locale-specific OG locale and alternates for a localized legal route", () => {
    const metadata = resolveSeoMetadata("/es/privacy");
    expect(metadata.ogLocale).toBe("es_ES");
    expect(metadata.alternates.find((entry) => entry.hrefLang === "x-default")?.href).toBe(
      "https://neotoma.io/privacy"
    );
    expect(metadata.alternates.find((entry) => entry.hrefLang === "es")?.href).toBe(
      "https://neotoma.io/es/privacy"
    );
    expect(metadata.alternates.find((entry) => entry.hrefLang === "en")?.href).toBe(
      "https://neotoma.io/privacy"
    );
  });

  it("emits hreflang alternates only for locales that serve a real page", () => {
    // Spanish retained pages are real localized routes; other content locales remain retired.
    for (const path of ["/", "/install", "/evaluate"]) {
      const locales = resolveSeoMetadata(path).alternates.map((entry) => entry.hrefLang);
      expect(locales, path).toContain("es");
      expect(locales, path).not.toContain("de");
    }
    expect(resolveSeoMetadata("/").alternates.map((entry) => entry.hrefLang)).toEqual([
      "x-default",
      "en",
      "es",
    ]);
    expect(resolveSeoMetadata("/terms").alternates.map((entry) => entry.hrefLang)).toContain("de");
  });

  it("markdown mirror routes reuse install metadata with noindex", () => {
    const meta = getSeoMetadataForPath("/markdown/install");
    expect(meta.robots).toBe("noindex,nofollow");
    expect(meta.title).toContain("Markdown");
    expect(meta.description).toContain("/install");
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
      expect(SITEMAP_PATHS).not.toContain("/docs");
      expect(SITEMAP_PATHS).not.toContain("/es/docs");
      expect(SITEMAP_PATHS).toContain("/es/privacy");
      expect(SITEMAP_PATHS).toContain("/de/architecture");
    });

    it("SITEMAP_PATHS does not include noindex routes", () => {
      expect(SITEMAP_PATHS).not.toContain("/404");
    });

    it("default buildSitemapXml lists live and held routes and no retired route", () => {
      const sitemap = buildSitemapXml();
      for (const route of ["/", "/es", "/install", "/evaluate", "/privacy", "/terms", "/meet"]) {
        expect(sitemap, route).toContain(`<loc>${buildCanonicalUrl(route)}</loc>`);
      }
      for (const route of ["/docs", "/architecture", "/faq", "/de/install"]) {
        expect(sitemap, route).not.toContain(`<loc>${buildCanonicalUrl(route)}</loc>`);
      }
      expect(INDEXABLE_ROUTES.length).toBeGreaterThan(10);
    });
  });

  describe("structured data", () => {
    it("homepage uses WebSite type", () => {
      const metadata = resolveSeoMetadata("/");
      expect(metadata.jsonLd[0]["@type"]).toBe("WebSite");
    });

    it("root reader page includes BreadcrumbList", () => {
      const metadata = resolveSeoMetadata("/cli");
      const breadcrumb = metadata.jsonLd.find((entry) => entry["@type"] === "BreadcrumbList");
      expect(breadcrumb).toBeDefined();
      expect((breadcrumb!["itemListElement"] as unknown[]).length).toBeGreaterThanOrEqual(2);
    });

    it("subpages include BreadcrumbList", () => {
      const metadata = resolveSeoMetadata("/architecture");
      const breadcrumb = metadata.jsonLd.find((entry) => entry["@type"] === "BreadcrumbList");
      expect(breadcrumb).toBeDefined();
    });
  });

  describe("injectRouteMetaIntoHtml", () => {
    const TEMPLATE = [
      '<!doctype html><html lang="en"><head>',
      "<title>Neotoma | The state layer for persistent AI agent memory</title>",
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
      expect(result).toContain("<title>Neotoma: the system of record for AI agents</title>");
      expect(result).not.toContain("Your agents forget");
      expect(result).toContain('href="https://neotoma.io/"');
    });
  });
});

describe("live page metadata carries no retired claim", () => {
  const RETIRED = [
    "append-only",
    "detect conflicts",
    "deterministic memory",
    "ships those guarantees",
    "5 minutes",
    "5-minute",
    "no cloud sync",
    "agent memory",
    "deterministic state",
    "SearchAction",
    "speakable",
    "docs?q=",
    "FAQPage",
    "Windows",
  ];
  for (const route of ["/", "/install"]) {
    it(`${route}: JSON-LD, keywords, description and image alt are clean`, () => {
      const meta = resolveSeoMetadata(route);
      const haystack =
        JSON.stringify(meta.jsonLd) +
        " " +
        meta.keywords +
        " " +
        meta.description +
        " " +
        meta.ogImageAlt;
      for (const phrase of RETIRED) {
        expect(haystack.toLowerCase(), `${route}: ${phrase}`).not.toContain(phrase.toLowerCase());
      }
      expect(meta.keywords).toContain("system of record");
    });
  }

  it("uses the category keyword list on the home page", () => {
    expect(
      resolveSeoMetadata("/").keywords.endsWith(
        "Neotoma, system of record, AI agents, MCP, Model Context Protocol, provenance, local-first"
      )
    ).toBe(true);
  });

  it("points the install page at an image that exists in the build", () => {
    const meta = resolveSeoMetadata("/install");
    expect(fs.existsSync(path.join(process.cwd(), "frontend/public", new URL(meta.ogImageUrl).pathname))).toBe(true);
  });
});


describe("crawlable archive social cards", () => {
  const template = fs.readFileSync("frontend/index.html", "utf8");
  const publicDir = path.resolve("frontend/public");
  for (const route of ["/", "/en/", "/es/", "/install", "/es/install", "/evaluate", "/es/evaluate", "/neotoma-with-cursor", "/vs-platform-memory", "/memory-guarantees"]) {
    it(`serves consistent route copy and a real card before JavaScript: ${route}`, async () => {
      const html = injectRouteMetaIntoHtml(template, route);
      const doc = new JSDOM(html).window.document;
      const meta = resolveSeoMetadata(route);
      const content = (selector: string) => doc.querySelector(selector)?.getAttribute("content");
      expect(doc.title).toBe(meta.title);
      expect(content('meta[property="og:title"]')).toBe(meta.title);
      expect(content('meta[name="twitter:title"]')).toBe(meta.title);
      expect(content('meta[name="description"]')).toBe(meta.description);
      expect(content('meta[property="og:description"]')).toBe(meta.description);
      expect(content('meta[name="twitter:description"]')).toBe(meta.description);
      expect(content('meta[property="og:image"]')).toBe(meta.ogImageUrl);
      expect(content('meta[name="twitter:image"]')).toBe(meta.ogImageUrl);
      expect(new Set(socialImageReferences(html))).toEqual(new Set([meta.ogImageUrl]));
      expect(content('meta[property="og:image:type"]')).toBe("image/png");
      expect(content('meta[property="og:image:width"]')).toBe("1200");
      expect(content('meta[property="og:image:height"]')).toBe("630");
      expect(content('meta[property="og:image:alt"]')).toBe(meta.ogImageAlt);
      expect(content('meta[name="twitter:image:alt"]')).toBe(meta.ogImageAlt);
      expect(await socialImageProblems(html, publicDir)).toEqual([]);
      expect(content('meta[name="theme-color"]')).toBe("#172b39");
      if (route.startsWith("/es")) {
        expect(meta.ogImageUrl).toMatch(/archive-es-/);
        expect(meta.ogImageAlt).toMatch(/archivo de registros conservados/);
        expect(meta.ogImageAlt.match(/Neotoma/g)).toHaveLength(1);
      }
    });
  }
  it("preserves route-specific evaluation and installation descriptions", () => {
    expect(resolveSeoMetadata("/evaluate").description).toMatch(/judge whether it fits your workflow.*assessment prompt/i);
    expect(resolveSeoMetadata("/install").description).toMatch(/Agent-assisted and manual install.*MCP configuration/i);
    expect(resolveSeoMetadata("/es/install").description).toMatch(/ruta de conexión.*perfil de datos/i);
  });
  it("binds generated cards to the exact current archive, material, font and composition inputs", () => {
    expect(socialCardSourceProblems(process.cwd())).toEqual([]);
  });
  it("rejects missing evaluation images, nested JSON-LD images, unsafe URLs and wrong raster bytes/dimensions", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "social-image-"));
    const html = (url: string) => `<meta property="og:image" content="${url}"><script type="application/ld+json">{"@graph":[{"image":[{"url":"${url}"}]}]}</script>`;
    try {
      const url = "https://neotoma.io/card.png";
      expect((await socialImageProblems(html("https://neotoma.io/og/neotoma-evaluate-1200x630.png"), dir)).join()).toMatch(/missing/);
      expect((await socialImageProblems(html("/card.png"), dir)).join()).toMatch(/Invalid URL/);
      expect((await socialImageProblems(html("https://elsewhere.test/card.png"), dir)).join()).toMatch(/absolute HTTPS public-site/);
      await sharp({ create: { width: 1200, height: 630, channels: 3, background: "white" } }).png().toFile(path.join(dir, "card.png"));
      expect(await socialImageProblems(html(url), dir)).toEqual([]);
      expect((await socialImageProblems(html(url) + '<meta property="og:image:type" content="image/jpeg">', dir)).join()).toMatch(/og:image:type: expected image\/png/);
      await sharp({ create: { width: 12, height: 6, channels: 3, background: "white" } }).png().toFile(path.join(dir, "card.png"));
      expect((await socialImageProblems(html(url), dir)).join()).toMatch(/1200×630.*12×6/);
      await sharp({ create: { width: 1200, height: 630, channels: 3, background: "white" } }).jpeg().toFile(path.join(dir, "card.png"));
      expect((await socialImageProblems(html(url), dir)).join()).toMatch(/actual image\/png bytes/);
      fs.writeFileSync(path.join(dir, "card.png"), "not an image");
      expect(await socialImageProblems(html(url), dir)).not.toEqual([]);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
