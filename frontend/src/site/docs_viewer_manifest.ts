/**
 * Whitelist of repository markdown files that neotoma.io renders as thin viewer pages.
 *
 * The files on GitHub stay the single source of truth. At build time
 * (`scripts/build_github_pages_site.tsx`) each `included` entry is read from the same checkout,
 * linted (`scripts/docs_viewer/lint.ts`), rendered to sanitized static HTML and written to
 * `site_pages/docs/<slug>/index.html`. Nothing is fetched from GitHub at runtime and the viewer
 * pages carry no script.
 *
 * Status:
 * - `included`: rendered and published. The build FAILS if the file is missing or fails the lint.
 * - `pending`: a candidate. Linted and reported on every build (`npm run lint:docs-viewer`), never
 *   rendered or published. Promote it to `included` once the lint passes.
 *
 * Pure data and pure functions: imported by the static build, the export validator, the copy lint,
 * the route-retirement module (so redirect stubs can point at viewer pages) and the tests.
 */

export type DocsViewerStatus = "included" | "pending";

export interface DocsViewerEntry {
  /** URL slug under /docs/. The empty string is the docs index at /docs/. */
  slug: string;
  /** Repository-relative path of the markdown file (POSIX). */
  source: string;
  /** Display title, used for the page heading, the sidebar and the document title. */
  title: string;
  /** Sidebar group, in the order of DOCS_VIEWER_GROUPS. */
  group: DocsViewerGroup;
  /** Sort order within the whole list (sidebar, previous and next). Lower comes first. */
  order: number;
  status: DocsViewerStatus;
  /**
   * Other repository paths that mean this document, for example the `docs/` folder for the docs
   * index. A link to an alias, and a retired route whose destination is an alias, lead to the viewer.
   */
  aliases?: readonly string[];
}

/** Sidebar groups, named and ordered as the docs index (docs/README.md) groups its links. */
export const DOCS_VIEWER_GROUPS = ["Start here", "How the record works"] as const;
export type DocsViewerGroup = (typeof DOCS_VIEWER_GROUPS)[number];

export const DOCS_VIEWER_MANIFEST: readonly DocsViewerEntry[] = [
  {
    slug: "",
    source: "docs/README.md",
    aliases: ["docs/"],
    title: "Documentation",
    group: "Start here",
    order: 0,
    status: "included",
  },
  {
    slug: "readme",
    source: "README.md",
    title: "README",
    group: "Start here",
    order: 10,
    status: "pending",
  },
  {
    slug: "cli",
    source: "docs/developer/cli_reference.md",
    title: "CLI reference",
    group: "Start here",
    order: 20,
    status: "pending",
  },
  {
    slug: "mcp",
    source: "docs/developer/mcp_overview.md",
    title: "MCP overview",
    group: "Start here",
    order: 30,
    status: "pending",
  },
  {
    slug: "rest-api",
    source: "docs/api/rest_api.md",
    title: "REST API",
    group: "Start here",
    order: 40,
    status: "pending",
  },
  {
    slug: "integrations",
    source: "docs/integrations/matrix.md",
    title: "Integrations matrix",
    group: "Start here",
    order: 50,
    status: "pending",
  },
  {
    slug: "architecture",
    source: "docs/architecture/architecture.md",
    title: "Architecture",
    group: "How the record works",
    order: 60,
    status: "pending",
  },
  {
    slug: "vocabulary",
    source: "docs/vocabulary/canonical_terms.md",
    title: "Vocabulary",
    group: "How the record works",
    order: 70,
    status: "pending",
  },
];

/**
 * Paths that are never rendered, whatever the manifest says. Links to them always go to GitHub.
 * The build and the tests refuse a manifest entry that matches one of these.
 */
export const DOCS_VIEWER_EXCLUDED: readonly { match: RegExp; reason: string }[] = [
  {
    match: /^install\.md$/,
    reason:
      "install.md is the agent installation protocol, not a reader page; neotoma.io/install is the human page. Linked on GitHub.",
  },
  {
    match: /^docs\/foundation\//,
    reason:
      "docs/foundation states the design and changes through the foundation process; it is linked on GitHub, never rendered.",
  },
  {
    match: /^foundation\//,
    reason: "The foundation submodule is linked on GitHub, never rendered.",
  },
];

export function excludedReason(source: string): string | null {
  for (const e of DOCS_VIEWER_EXCLUDED) if (e.match.test(source)) return e.reason;
  return null;
}

/** Route of a viewer page, without the trailing slash (`/docs` for the index). */
export function viewerRoute(slug: string): string {
  return slug ? `/docs/${slug}` : "/docs";
}

/** Public path of a viewer page, with the trailing slash GitHub Pages serves directories at. */
export function viewerHref(slug: string): string {
  return `${viewerRoute(slug)}/`;
}

export interface DocsViewerIndex {
  entries: readonly DocsViewerEntry[];
  /** Normalized route (no trailing slash) to entry. */
  byRoute: ReadonlyMap<string, DocsViewerEntry>;
  /** Repository path or alias to entry. */
  bySource: ReadonlyMap<string, DocsViewerEntry>;
}

export function buildDocsViewerIndex(entries: readonly DocsViewerEntry[]): DocsViewerIndex {
  const sorted = [...entries].sort((a, b) => a.order - b.order);
  const byRoute = new Map<string, DocsViewerEntry>();
  const bySource = new Map<string, DocsViewerEntry>();
  for (const e of sorted) {
    byRoute.set(viewerRoute(e.slug), e);
    bySource.set(e.source, e);
    for (const a of e.aliases ?? []) bySource.set(a, e);
  }
  return { entries: sorted, byRoute, bySource };
}

/** Index of the published (included) viewer pages. */
export const DOCS_VIEWER_INDEX: DocsViewerIndex = buildDocsViewerIndex(
  DOCS_VIEWER_MANIFEST.filter((e) => e.status === "included")
);

function normalizeRoute(route: string): string {
  const r = route.split(/[?#]/)[0] || "/";
  return r.length > 1 ? r.replace(/\/+$/, "") : r;
}

/** True when the route is served by a published viewer page. */
export function isDocsViewerRoute(
  route: string,
  index: DocsViewerIndex = DOCS_VIEWER_INDEX
): boolean {
  return index.byRoute.has(normalizeRoute(route));
}

/** Viewer path (`/docs/<slug>/`) for a repository path when that file is published, else null. */
export function viewerHrefForRepoPath(
  repoPath: string,
  index: DocsViewerIndex = DOCS_VIEWER_INDEX
): string | null {
  const e = index.bySource.get(repoPath);
  return e ? viewerHref(e.slug) : null;
}
