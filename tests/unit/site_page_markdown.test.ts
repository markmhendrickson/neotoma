import { describe, expect, it } from "vitest";
import {
  buildAllSitePagesMarkdownBundle,
  buildSitePageMarkdown,
  isIndexableSitePagePath,
  normalizeSiteMarkdownPathParam,
  rawMarkdownTo,
} from "../../frontend/src/site/site_page_markdown";
import { INDEXABLE_SITE_PAGE_PATHS } from "../../frontend/src/site/seo_metadata";

describe("site_page_markdown", () => {
  it("normalizes path param with locale strip and hash removal", () => {
    expect(normalizeSiteMarkdownPathParam("/install")).toBe("/install");
    expect(normalizeSiteMarkdownPathParam("install")).toBe("/install");
    expect(normalizeSiteMarkdownPathParam("/es/install")).toBe("/install");
    expect(normalizeSiteMarkdownPathParam("/install#x")).toBe("/install");
    expect(normalizeSiteMarkdownPathParam("   ")).toBe(null);
    expect(normalizeSiteMarkdownPathParam(null)).toBe(null);
  });

  it("isIndexableSitePagePath matches sitemap default-locale set", () => {
    expect(isIndexableSitePagePath("/")).toBe(true);
    expect(isIndexableSitePagePath("/install")).toBe(true);
    expect(isIndexableSitePagePath("/site-markdown")).toBe(false);
    expect(isIndexableSitePagePath("/not-a-real-route")).toBe(false);
  });

  it("buildSitePageMarkdown includes title, description, and canonical", () => {
    const md = buildSitePageMarkdown("/install");
    expect(md).toContain("# ");
    expect(md).toContain("Install");
    expect(md).toContain("## Meta");
    expect(md).toContain("https://neotoma.io/install");
    expect(md).toContain("Canonical URL:");
  });

  it("buildAllSitePagesMarkdownBundle includes every indexable path section", () => {
    const bundle = buildAllSitePagesMarkdownBundle();
    expect(bundle).toContain("# Neotoma site pages");
    for (const p of INDEXABLE_SITE_PAGE_PATHS) {
      expect(bundle).toContain(`\`${p}\``);
    }
  });

  it("rawMarkdownTo points at localized /raw with path query", () => {
    const to = rawMarkdownTo("/install", "en");
    expect(to.pathname).toBe("/raw");
    expect(to.search).toBe("?path=%2Finstall");
    const toEs = rawMarkdownTo("/", "es");
    expect(toEs.pathname).toBe("/es/raw");
    expect(toEs.search).toBe("?path=%2F");
  });
});
