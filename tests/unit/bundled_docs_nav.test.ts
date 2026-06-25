import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getBundledDocsIndex } from "../../src/services/docs/index.js";
import {
  BUNDLED_DOCS_FOOTER_COLUMNS,
  BUNDLED_DOCS_QUICK_LINKS,
  buildBundledDocsFooterColumns,
  buildBundledDocsNavCategories,
  resolveBundledDocsQuickLinks,
  resolveExtraKnownFooterSlugs,
} from "../../src/services/docs/bundled_nav.js";
import { buildLandingContext } from "../../src/services/root_landing/index.js";
import type express from "express";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const docsRoot = path.join(repoRoot, "docs");

describe("bundled docs nav", () => {
  const index = getBundledDocsIndex({ repoRoot, envSource: { NODE_ENV: "production" } });
  // site/ is excluded from the browsable index but footer links deep-link into
  // it; these slugs are validated via direct lookup, not index membership.
  const extraKnown = resolveExtraKnownFooterSlugs({
    docsRoot,
    env: { NODE_ENV: "production" },
  });

  it("quick-link slugs exist in the bundled docs index", () => {
    const slugs = new Set<string>();
    for (const doc of index.featured) slugs.add(doc.slug);
    for (const cat of index.categories) {
      for (const doc of cat.uncategorized) slugs.add(doc.slug);
      for (const sub of cat.subcategories) {
        for (const doc of sub.docs) slugs.add(doc.slug);
      }
    }
    for (const link of BUNDLED_DOCS_QUICK_LINKS) {
      if (link.slug === "") continue;
      expect(slugs.has(link.slug), `missing slug: ${link.slug}`).toBe(true);
    }
  });

  it("buildBundledDocsNavCategories only emits /docs hrefs present in the index", () => {
    const nav = buildBundledDocsNavCategories(index);
    const slugs = new Set<string>();
    for (const doc of index.featured) slugs.add(doc.slug);
    for (const cat of index.categories) {
      for (const doc of cat.uncategorized) slugs.add(doc.slug);
      for (const sub of cat.subcategories) {
        for (const doc of sub.docs) slugs.add(doc.slug);
      }
    }
    for (const category of nav) {
      for (const item of category.items) {
        expect(item.href.startsWith("/docs")).toBe(true);
        if (item.href === "/docs") continue;
        const slug = item.href.replace(/^\/docs\//, "");
        expect(slugs.has(slug), `nav href not in index: ${item.href}`).toBe(true);
      }
    }
  });

  it("footer link slugs resolve via the index or direct lookup", () => {
    const slugs = new Set<string>();
    for (const doc of index.featured) slugs.add(doc.slug);
    for (const cat of index.categories) {
      for (const doc of cat.uncategorized) slugs.add(doc.slug);
      for (const sub of cat.subcategories) {
        for (const doc of sub.docs) slugs.add(doc.slug);
      }
    }
    for (const s of extraKnown) slugs.add(s);
    for (const col of BUNDLED_DOCS_FOOTER_COLUMNS) {
      for (const link of col.links) {
        if (link.slug === "" || /^https?:\/\//i.test(link.slug)) continue;
        expect(slugs.has(link.slug), `unresolvable footer slug: ${link.slug}`).toBe(true);
      }
    }
  });

  it("site/ footer slugs are resolvable but NOT in the browsable index", () => {
    const indexSlugs = new Set<string>();
    for (const cat of index.categories) {
      for (const doc of cat.uncategorized) indexSlugs.add(doc.slug);
      for (const sub of cat.subcategories) for (const doc of sub.docs) indexSlugs.add(doc.slug);
    }
    // Marketing site pages must not flood the browsable index...
    expect([...indexSlugs].some((s) => s.startsWith("site/"))).toBe(false);
    // ...but the footer's site deep-links still resolve directly.
    expect(extraKnown.has("site/pages/en/install")).toBe(true);
  });

  it("buildBundledDocsFooterColumns emits /docs hrefs on same origin", () => {
    const footer = buildBundledDocsFooterColumns(index, "http://127.0.0.1:3180", extraKnown);
    expect(footer.some((c) => c.title === "Product")).toBe(true);
    const install = footer.flatMap((c) => c.items).find((i) => i.label === "Install");
    expect(install?.href).toBe("http://127.0.0.1:3180/docs/site/pages/en/install");
  });

  it("resolveBundledDocsQuickLinks drops missing slugs", () => {
    const broken = {
      ...index,
      featured: [],
      categories: [],
      total: 0,
    };
    const links = resolveBundledDocsQuickLinks(broken);
    expect(links).toEqual([{ label: "Documentation", href: "/docs" }]);
  });
});

describe("root landing bundled docs index", () => {
  it("uses bundled docs nav by default when docs/ exists", () => {
    const req = {
      headers: {},
      header: () => undefined,
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as express.Request;
    const ctx = buildLandingContext(req, {
      NEOTOMA_ROOT_LANDING_MODE: "personal",
      NEOTOMA_SANDBOX_MODE: undefined,
    });
    expect(ctx.bundledDocsNav).toBe(true);
    expect(ctx.index.length).toBeGreaterThan(0);
    const firstHref = ctx.index[0]?.items[0]?.href;
    expect(firstHref?.startsWith("/docs")).toBe(true);
    expect(ctx.index.some((c) => c.title === "Getting started")).toBe(false);
    expect(ctx.footerNav?.some((c) => c.title === "Legal")).toBe(true);
  });

  it("restores marketing nav when NEOTOMA_ROOT_LANDING_MARKETING_NAV=1", () => {
    const req = {
      headers: {},
      header: () => undefined,
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as express.Request;
    const ctx = buildLandingContext(req, {
      NEOTOMA_ROOT_LANDING_MODE: "personal",
      NEOTOMA_ROOT_LANDING_MARKETING_NAV: "1",
    });
    expect(ctx.bundledDocsNav).toBe(false);
    expect(ctx.index.some((c) => c.title === "Getting started")).toBe(true);
    expect(ctx.index[0]?.items.some((i) => i.href === "/install")).toBe(true);
  });
});
