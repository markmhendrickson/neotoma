/**
 * Navigation derived from the bundled `/docs` index. Every href is `/docs/<slug>`
 * for a slug that exists in {@link DocsIndex}; used by the MCP root landing
 * Learn section and quick-link validation.
 */

import type { DocsIndex, DocEntry } from "./index_builder.js";
import type { RootLandingNavCategory, RootLandingNavItem } from "../root_landing/site_nav.js";
import { lookupDoc } from "./render.js";
import type { VisibilityEnv } from "./visibility.js";

export interface BundledDocsQuickLink {
  label: string;
  /** Empty string = docs index; otherwise a bundled doc slug under `/docs/<slug>`. */
  slug: string;
}

export interface BundledDocsFooterColumn {
  title: string;
  links: readonly BundledDocsQuickLink[];
}

/**
 * Site-footer column mirror for the MCP root landing page. Paths are bundled doc
 * slugs (or external URLs), not marketing-site routes.
 */
export const BUNDLED_DOCS_FOOTER_COLUMNS: readonly BundledDocsFooterColumn[] = [
  {
    title: "Product",
    links: [
      { label: "Install", slug: "site/pages/en/install" },
      { label: "Architecture", slug: "architecture/architecture" },
      { label: "Memory guarantees", slug: "site/pages/en/memory-guarantees" },
      { label: "FAQ", slug: "site/pages/en/faq" },
    ],
  },
  {
    title: "Documentation",
    links: [
      { label: "Documentation", slug: "" },
      { label: "API", slug: "site/pages/en/api" },
      { label: "MCP", slug: "site/pages/en/mcp" },
      { label: "CLI", slug: "site/pages/en/cli" },
      { label: "TypeScript SDK", slug: "site/pages/en/sdk-agent" },
      { label: "Python SDK", slug: "site/pages/en/sdk-python" },
    ],
  },
  {
    title: "External",
    links: [
      { label: "GitHub", slug: "https://github.com/markmhendrickson/neotoma" },
      { label: "npm", slug: "https://www.npmjs.com/package/neotoma" },
      { label: "Blog", slug: "https://markmhendrickson.com/posts" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", slug: "site/pages/en/privacy" },
      { label: "Terms", slug: "site/pages/en/terms" },
    ],
  },
] as const;

/** Curated shortcuts surfaced in the Inspector sidebar and home Resources card. */
export const BUNDLED_DOCS_QUICK_LINKS: readonly BundledDocsQuickLink[] = [
  { label: "Documentation", slug: "" },
  { label: "Get started", slug: "getting_started/getting_started" },
  { label: "Architecture", slug: "architecture/architecture" },
  { label: "REST API", slug: "api/rest_api" },
  { label: "MCP Server", slug: "developer/mcp/instructions" },
] as const;

function docNavItem(doc: DocEntry): RootLandingNavItem {
  return {
    label: doc.frontmatter.title,
    href: `/docs/${doc.slug}`,
  };
}

function slugSet(index: DocsIndex): Set<string> {
  const slugs = new Set<string>();
  for (const doc of index.featured) slugs.add(doc.slug);
  for (const cat of index.categories) {
    for (const doc of cat.uncategorized) slugs.add(doc.slug);
    for (const sub of cat.subcategories) {
      for (const doc of sub.docs) slugs.add(doc.slug);
    }
  }
  return slugs;
}

/** Quick links whose slugs exist in the current visibility-filtered docs index. */
export function resolveBundledDocsQuickLinks(index: DocsIndex): RootLandingNavItem[] {
  const known = slugSet(index);
  const items: RootLandingNavItem[] = [];
  for (const link of BUNDLED_DOCS_QUICK_LINKS) {
    if (link.slug !== "" && !known.has(link.slug)) continue;
    items.push({
      label: link.label,
      href: link.slug === "" ? "/docs" : `/docs/${link.slug}`,
    });
  }
  return items;
}

/**
 * Full Learn index from the bundled docs tree: featured docs, then manifest
 * categories (same grouping as `GET /docs?format=json`).
 */
export function buildBundledDocsNavCategories(index: DocsIndex): RootLandingNavCategory[] {
  const categories: RootLandingNavCategory[] = [];

  if (index.featured.length > 0) {
    categories.push({
      title: "Featured",
      items: index.featured.map(docNavItem),
    });
  }

  for (const cat of index.categories) {
    const items: RootLandingNavItem[] = [];
    for (const doc of cat.uncategorized) items.push(docNavItem(doc));
    for (const sub of cat.subcategories) {
      for (const doc of sub.docs) items.push(docNavItem(doc));
    }
    if (items.length === 0) continue;
    categories.push({
      title: cat.display_name,
      items,
    });
  }

  return categories;
}

function footerHref(docsNavBase: string, slug: string): string {
  const base = docsNavBase.replace(/\/+$/, "");
  return slug === "" ? `${base}/docs` : `${base}/docs/${slug}`;
}

/**
 * Footer/quick-link slugs that resolve via DIRECT lookup even though their
 * folder is excluded from the browsable index — i.e. the `site/pages/*`
 * marketing pages. The footer columns deep-link into these, so we validate
 * them against `lookupDoc` rather than index membership: present on from-source
 * hosts (where `docs/site/` exists), absent on npm installs (bundle drops
 * `site/`), matching each deployment's real reachability.
 *
 * Deterministic: a pure function of the static link lists + the docs tree.
 */
export function resolveExtraKnownFooterSlugs(opts: {
  docsRoot: string;
  env: VisibilityEnv;
  manifestEntries?: Map<string, { status?: string }>;
}): Set<string> {
  const candidates = new Set<string>();
  for (const col of BUNDLED_DOCS_FOOTER_COLUMNS) {
    for (const link of col.links) {
      if (link.slug && !/^https?:\/\//i.test(link.slug)) candidates.add(link.slug);
    }
  }
  const known = new Set<string>();
  for (const slug of candidates) {
    const res = lookupDoc(slug, {
      docsRoot: opts.docsRoot,
      env: opts.env,
      manifestEntries: opts.manifestEntries,
    });
    if (res.ok) known.add(slug);
  }
  return known;
}

/**
 * Footer columns for the MCP root landing page when `bundledDocsNav` is active.
 * Drops links whose doc slug is neither in the visibility-filtered index nor in
 * `extraKnownSlugs` (directly-resolvable slugs such as `site/pages/*`, computed
 * via {@link resolveExtraKnownFooterSlugs}).
 */
export function buildBundledDocsFooterColumns(
  index: DocsIndex,
  docsNavBase: string,
  extraKnownSlugs?: ReadonlySet<string>
): RootLandingNavCategory[] {
  const known = slugSet(index);
  if (extraKnownSlugs) for (const s of extraKnownSlugs) known.add(s);
  const columns: RootLandingNavCategory[] = [];

  for (const col of BUNDLED_DOCS_FOOTER_COLUMNS) {
    const items: RootLandingNavItem[] = [];
    for (const link of col.links) {
      if (/^https?:\/\//i.test(link.slug)) {
        items.push({ label: link.label, href: link.slug });
        continue;
      }
      if (link.slug !== "" && !known.has(link.slug)) continue;
      items.push({
        label: link.label,
        href: footerHref(docsNavBase, link.slug),
      });
    }
    if (items.length > 0) columns.push({ title: col.title, items });
  }

  return columns;
}
