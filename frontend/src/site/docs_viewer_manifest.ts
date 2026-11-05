/**
 * Whitelist of repository markdown files that neotoma.io renders as thin viewer pages.
 *
 * The files on GitHub stay the single source of truth. At build time
 * (`scripts/build_github_pages_site.tsx`) each `included` entry is read from the same checkout,
 * linted (`scripts/docs_viewer/lint.ts`), rendered to sanitized static HTML and written to
 * `site_pages/<slug>/index.html`. Nothing is fetched from GitHub at runtime and the viewer
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

import { CONNECTIONS } from "../../../src/shared/harness_connections";
import { TOPIC_VISUALS, visualIdForTopic } from "./topic_visuals";
import { SPANISH_VIEWER_VISUAL_TEXT } from "./docs_viewer_visuals_es";

export type DocsViewerStatus = "included" | "pending";

export interface DocsViewerEntry {
  /** Stable identity for hierarchy and related links, independent of the URL. */
  id: string;
  /** Public URL path without leading or trailing slash; may be nested (install guides). */
  slug: string;
  /** Repository-relative path of the markdown file (POSIX). */
  source: string;
  /** Original English source when `source` is a translated sidecar. */
  originalSource?: string;
  /** Display title, used for the page heading and document title. */
  title: string;
  /** Short reader promise used on generated collection and related cards. */
  summary?: string;
  /** Editorial group, retained for manifest compatibility. */
  group: DocsViewerGroup;
  /** Sort order within the whole list (sidebar, previous and next). Lower comes first. */
  order: number;
  status: DocsViewerStatus;
  /** Other repository paths that mean this document. */
  aliases?: readonly string[];
  /** Reader collection; determines top navigation and grouping. */
  collection: DocsViewerCollectionId;
  /** Ancestor entry id. Install guides may use the virtual `install` root. */
  parentId?: string;
  /** Routes that retain inbound links but are never indexed as separate pages. */
  routeAliases?: readonly string[];
  /** Curated entry ids shown after the article; `install` is a virtual destination. */
  relatedIds?: readonly string[];
  /** Registered static visual key, supplied when the illustration is ready. */
  visualId?: string;
  /** Optional static illustration supplied by the visual integration pass. */
  visual?: { src: string; alt: string; caption: string };
  robots?: "index" | "noindex";
}

/** Editorial groups, retained for manifest compatibility. */
export const DOCS_VIEWER_GROUPS = ["Start here", "How the record works"] as const;
export type DocsViewerGroup = (typeof DOCS_VIEWER_GROUPS)[number];

export const DOCS_VIEWER_COLLECTIONS = [
  { id: "start", title: "Home", href: "/" },
  { id: "install", title: "Install", href: "/install/" },
  { id: "interfaces", title: "Interfaces", href: "/interfaces/" },
  { id: "how-it-works", title: "How it works", href: "/architecture/" },
  { id: "reference", title: "Reference", href: "/vocabulary/" },
  { id: "trust", title: "Trust", href: "/trust/" },
] as const;
export type DocsViewerCollectionId = (typeof DOCS_VIEWER_COLLECTIONS)[number]["id"];

/** Static visual assets are added here only after they exist and pass visual review. */
export const DOCS_VIEWER_VISUALS: Readonly<
  Record<string, { src: string; alt: string; caption: string }>
> = Object.fromEntries(
  Object.entries(TOPIC_VISUALS).map(([id, visual]) => [
    id,
    { src: `/brand/october/topic/${id}.webp`, alt: visual.alt, caption: visual.caption },
  ])
);

export function viewerCollection(id: DocsViewerCollectionId) {
  return DOCS_VIEWER_COLLECTIONS.find((c) => c.id === id)!;
}

const DOCS_VIEWER_ENTRIES: readonly DocsViewerEntry[] = [
  {
    slug: "readme",
    id: "readme",
    source: "docs/topics/start.md",
    title: "Start here",
    summary: "Understand the record, check fit, and choose a first step.",
    group: "Start here",
    order: 10,
    status: "included",
    collection: "start",
    routeAliases: ["/docs/readme"],
    relatedIds: ["install", "architecture", "interfaces"],
  },
  {
    slug: "cli",
    id: "cli",
    parentId: "interfaces",
    source: "docs/topics/interfaces/cli.md",
    title: "CLI",
    summary: "Choose a terminal command, then verify the resulting record.",
    group: "Start here",
    order: 20,
    status: "included",
    collection: "interfaces",
    routeAliases: ["/docs/cli"],
    relatedIds: ["read-search", "store-correct", "rest-api"],
  },
  {
    slug: "mcp",
    id: "mcp",
    parentId: "interfaces",
    source: "docs/topics/interfaces/mcp.md",
    aliases: ["docs/topics/mcp.md"],
    title: "MCP",
    summary: "Connect a configured AI host to the same record.",
    group: "Start here",
    order: 30,
    status: "included",
    collection: "interfaces",
    routeAliases: ["/docs/mcp"],
    relatedIds: ["install", "integrations", "cli"],
    visualId: "mcp",
  },
  {
    slug: "rest-api",
    id: "rest-api",
    parentId: "interfaces",
    source: "docs/topics/interfaces/rest-api.md",
    title: "REST API",
    summary: "Use the documented HTTP contract from an application.",
    group: "Start here",
    order: 40,
    status: "included",
    collection: "interfaces",
    routeAliases: ["/api", "/docs/rest-api"],
    relatedIds: ["mcp", "cli", "read-search"],
  },
  {
    slug: "integrations",
    id: "integrations",
    parentId: "interfaces",
    source: "docs/integrations/matrix.md",
    title: "Integrations matrix",
    summary: "Check the current setup path for a specific host.",
    group: "Start here",
    order: 50,
    status: "included",
    collection: "interfaces",
    routeAliases: ["/connect", "/docs/integrations"],
    relatedIds: ["install", "mcp", "cli"],
  },
  {
    slug: "architecture",
    id: "architecture",
    source: "docs/topics/architecture/README.md",
    aliases: ["docs/topics/architecture.md"],
    title: "How the system of record works",
    summary:
      "Understand the architecture: sources, observations, identity, field rules, and shared access.",
    group: "How the record works",
    order: 60,
    status: "included",
    collection: "how-it-works",
    routeAliases: ["/docs/architecture", "/foundations"],
    relatedIds: ["record-model", "provenance", "mcp"],
    visualId: "architecture",
  },
  {
    slug: "vocabulary",
    id: "vocabulary",
    parentId: "architecture",
    source: "docs/topics/architecture/vocabulary.md",
    title: "Vocabulary",
    summary: "Find precise names for records, observations, and entities.",
    group: "How the record works",
    order: 70,
    status: "included",
    collection: "reference",
    routeAliases: ["/terminology", "/docs/vocabulary"],
    relatedIds: ["record-model", "provenance", "trust"],
  },
  {
    slug: "interfaces",
    id: "interfaces",
    source: "docs/topics/interfaces/README.md",
    aliases: ["docs/topics/interfaces.md"],
    title: "Interfaces",
    summary: "Choose MCP, CLI, or REST API for your client.",
    group: "Start here",
    order: 15,
    status: "included",
    collection: "interfaces",
    relatedIds: ["install", "mcp", "rest-api", "cli"],
  },
  {
    id: "read-search",
    slug: "read-search",
    parentId: "interfaces",
    source: "docs/topics/interfaces/read-search.md",
    title: "Find and read a record",
    summary: "Search by type or identifier and verify an empty result.",
    group: "Start here",
    order: 35,
    status: "included",
    collection: "interfaces",
    relatedIds: ["store-correct", "cli", "provenance"],
  },
  {
    id: "store-correct",
    slug: "store-correct",
    parentId: "interfaces",
    source: "docs/topics/interfaces/store-correct.md",
    title: "Store and correct a record",
    summary: "Use declared fields, then read the value and history back.",
    group: "Start here",
    order: 36,
    status: "included",
    collection: "interfaces",
    relatedIds: ["read-search", "history", "schemas"],
  },
  {
    slug: "provenance",
    id: "provenance",
    parentId: "record-model",
    source: "docs/topics/architecture/provenance.md",
    aliases: ["docs/topics/provenance.md"],
    title: "Sources and provenance",
    summary: "Trace a current value back to recorded evidence.",
    group: "How the record works",
    order: 65,
    status: "included",
    collection: "how-it-works",
    relatedIds: ["architecture", "current-snapshot", "vocabulary"],
    visualId: "provenance",
  },
  {
    id: "record-model",
    parentId: "architecture",
    slug: "record-model",
    source: "docs/topics/architecture/record-model.md",
    aliases: ["docs/topics/record-model.md"],
    title: "The record model",
    summary: "Separate sources, observations, identity, and current values.",
    group: "How the record works",
    order: 61,
    status: "included",
    collection: "how-it-works",
    relatedIds: ["observations", "current-snapshot", "schemas"],
  },
  {
    id: "observations",
    parentId: "record-model",
    slug: "observations",
    source: "docs/topics/architecture/observations.md",
    aliases: ["docs/topics/observations.md"],
    title: "Observations",
    summary: "Inspect recorded claims, corrections, and source context.",
    group: "How the record works",
    order: 62,
    status: "included",
    collection: "how-it-works",
    relatedIds: ["record-model", "current-snapshot", "schemas"],
    visualId: "observations",
  },
  {
    id: "current-snapshot",
    parentId: "record-model",
    slug: "current-snapshot",
    source: "docs/topics/architecture/current-snapshot.md",
    aliases: ["docs/topics/current-snapshot.md"],
    title: "Current snapshots",
    summary: "See how an entity's present fields are computed and traced.",
    group: "How the record works",
    order: 63,
    status: "included",
    collection: "how-it-works",
    relatedIds: ["observations", "provenance", "schemas"],
    visualId: "currentSnapshot",
  },
  {
    id: "schemas",
    parentId: "record-model",
    slug: "schemas",
    source: "docs/topics/architecture/schemas.md",
    aliases: ["docs/topics/schemas.md"],
    title: "Schemas and field rules",
    summary: "Check declared fields and the policies that select current values.",
    group: "How the record works",
    order: 64,
    status: "included",
    collection: "how-it-works",
    relatedIds: ["record-model", "observations", "current-snapshot"],
    visualId: "schemas",
  },
  {
    id: "history",
    slug: "history",
    parentId: "record-model",
    source: "docs/topics/architecture/history.md",
    title: "Inspect a change",
    summary: "Compare the current field with its observation history.",
    group: "How the record works",
    order: 66,
    status: "included",
    collection: "how-it-works",
    relatedIds: ["provenance", "observations", "current-snapshot"],
  },
  {
    slug: "trust",
    id: "trust",
    source: "docs/topics/trust/README.md",
    aliases: ["docs/topics/trust.md"],
    title: "Trust and validity",
    summary: "Check what the state guarantees cover and where they stop.",
    group: "How the record works",
    order: 80,
    status: "included",
    collection: "trust",
    relatedIds: ["local-first", "license", "limitations"],
  },
  {
    slug: "local-first",
    id: "local-first",
    parentId: "trust",
    source: "docs/topics/trust/local-first.md",
    aliases: ["docs/topics/local-first.md"],
    title: "Local-first and privacy",
    summary: "Choose what enters the record and where the instance runs.",
    group: "How the record works",
    order: 90,
    status: "included",
    collection: "trust",
    relatedIds: ["trust", "license", "limitations"],
    visualId: "localFirst",
  },
  {
    id: "export-backup",
    slug: "export-backup",
    parentId: "trust",
    source: "docs/topics/trust/export-backup.md",
    title: "Export and back up your record",
    summary: "Choose a portable snapshot or a verified recovery backup.",
    group: "How the record works",
    order: 92,
    status: "included",
    collection: "trust",
    relatedIds: ["local-first", "provenance", "limitations"],
  },
  {
    slug: "license",
    id: "license",
    parentId: "trust",
    source: "docs/topics/trust/license.md",
    aliases: ["docs/topics/license.md"],
    title: "MIT license",
    summary: "Read the governing source license and its conditions.",
    group: "How the record works",
    order: 100,
    status: "included",
    collection: "trust",
    relatedIds: ["local-first", "readme"],
  },
  {
    id: "limitations",
    parentId: "trust",
    slug: "limitations",
    source: "docs/topics/trust/limitations.md",
    aliases: ["docs/topics/limitations.md"],
    title: "Limits to check",
    summary: "Verify effect, host setup, historical scope, and access boundaries.",
    group: "How the record works",
    order: 95,
    status: "included",
    collection: "trust",
    relatedIds: ["trust", "local-first", "current-snapshot"],
  },
  {
    id: "install-system-changes",
    slug: "install/system-changes",
    source: "docs/topics/install/system-changes.md",
    title: "What changes on your system",
    summary: "Review local files, permissions, capture, update checks, and reset limits before connecting.",
    group: "Start here",
    order: 190,
    status: "included",
    collection: "install",
    parentId: "install",
    relatedIds: ["install-claude-code", "install-chatgpt", "local-first"],
  },
  ...CONNECTIONS.map(
    (connection, index): DocsViewerEntry => ({
      id: `install-${connection.id}`,
      slug: connection.guideRoute.replace(/^\//, "").replace(/\/$/, ""),
      source: connection.guide,
      title: `Connect ${connection.host}`,
      summary: `${connection.kind === "setup" ? "CLI setup" : connection.kind === "manual" ? "Manual configuration" : connection.kind === "plugin" ? "Plugin path" : connection.kind === "sdk" ? "SDK integration" : "Registry path"} · ${connection.transport}.`,
      group: "Start here",
      order: 200 + index,
      status: "included",
      collection: "install",
      parentId: "install",
    })
  ),
];

export const DOCS_VIEWER_MANIFEST: readonly DocsViewerEntry[] = DOCS_VIEWER_ENTRIES.map(
  (entry) => ({
    ...entry,
    visualId: entry.visualId ?? visualIdForTopic(entry.id),
  })
);

/** Versioned Spanish sidecars keep the English source path as their provenance base. */
export function spanishViewerSource(source: string): string {
  if (source.startsWith("docs/topics/")) return source.replace("docs/topics/", "docs/topics/es/");
  if (source.startsWith("docs/guides/connections/"))
    return source.replace("docs/guides/connections/", "docs/guides/connections/es/");
  if (source === "docs/integrations/matrix.md") return "docs/integrations/es/matrix.md";
  throw new Error(`No Spanish viewer source location for ${source}`);
}

export const SPANISH_DOCS_VIEWER_MANIFEST: readonly DocsViewerEntry[] = DOCS_VIEWER_MANIFEST.map(
  (entry) => {
    const visual = entry.visualId ? DOCS_VIEWER_VISUALS[entry.visualId] : entry.visual;
    const text = entry.visualId ? SPANISH_VIEWER_VISUAL_TEXT[entry.visualId] : undefined;
    if (visual && !text) throw new Error(`Missing Spanish visual text for ${entry.id}`);
    return {
      ...entry,
      slug: `es/${entry.slug}`,
      originalSource: entry.source,
      source: spanishViewerSource(entry.source),
      aliases: undefined,
      routeAliases: undefined,
      visualId: undefined,
      visual: visual && text ? { src: visual.src, alt: text.alt, caption: text.caption } : undefined,
    };
  }
);

export const SPANISH_DOCS_VIEWER_INDEX: DocsViewerIndex = buildDocsViewerIndex(
  SPANISH_DOCS_VIEWER_MANIFEST.filter((entry) => entry.status === "included")
);

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

/**
 * True for a plain repository-relative POSIX path: no leading slash, no backslash or control
 * character, no empty, "." or ".." segment. A trailing slash (a folder alias such as "docs/") is allowed.
 */
export function isPlainRepoPath(p: string): boolean {
  if (!p || p.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(p)) return false;
  const segments = (p.endsWith("/") ? p.slice(0, -1) : p).split("/");
  return segments.every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

/**
 * Why a path may never be rendered, or null. Matching is on the case-folded path, and a path that
 * is not plain (`./install.md`, `docs//foundation/x`, `docs/x/../foundation/x`) is refused outright,
 * so no spelling of an excluded file gets past the guard. The build also checks the real path on
 * disk (scripts/docs_viewer/build.ts, sourceFileProblems), so a symlink cannot either.
 */
export function excludedReason(source: string): string | null {
  if (!isPlainRepoPath(source)) {
    return "not a plain repository path (no leading slash, backslash, empty, '.' or '..' segment)";
  }
  const folded = source.toLowerCase();
  for (const e of DOCS_VIEWER_EXCLUDED) if (e.match.test(folded)) return e.reason;
  return null;
}

/** Route of a topic page, without the trailing slash. */
export function viewerRoute(slug: string): string {
  return `/${slug}`;
}

/** Public path of a viewer page, with the trailing slash GitHub Pages serves directories at. */
export function viewerHref(slug: string): string {
  return slug ? `${viewerRoute(slug)}/` : "/";
}

export interface DocsViewerIndex {
  entries: readonly DocsViewerEntry[];
  byId: ReadonlyMap<string, DocsViewerEntry>;
  /** Normalized route (no trailing slash) to entry. */
  byRoute: ReadonlyMap<string, DocsViewerEntry>;
  /** Repository path or alias to entry. */
  bySource: ReadonlyMap<string, DocsViewerEntry>;
  /** Normalized legacy route to its canonical entry. */
  byAliasRoute: ReadonlyMap<string, DocsViewerEntry>;
}

export function buildDocsViewerIndex(entries: readonly DocsViewerEntry[]): DocsViewerIndex {
  const sorted = [...entries].sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
  const byRoute = new Map<string, DocsViewerEntry>();
  const byId = new Map<string, DocsViewerEntry>();
  const bySource = new Map<string, DocsViewerEntry>();
  const byAliasRoute = new Map<string, DocsViewerEntry>();
  for (const e of sorted) {
    byId.set(e.id, e);
    byRoute.set(viewerRoute(e.slug), e);
    bySource.set(e.source, e);
    for (const a of e.aliases ?? []) bySource.set(a, e);
    byAliasRoute.set(`/docs/${e.slug}`, e);
    for (const a of e.routeAliases ?? []) byAliasRoute.set(normalizeRoute(a), e);
  }
  return { entries: sorted, byId, byRoute, bySource, byAliasRoute };
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
  const normalized = normalizeRoute(route);
  return index.byRoute.has(normalized) || SPANISH_DOCS_VIEWER_INDEX.byRoute.has(normalized);
}

/** Topic path (`/<slug>/`) for a repository path when that file is published, else null. */
export function viewerHrefForRepoPath(
  repoPath: string,
  index: DocsViewerIndex = DOCS_VIEWER_INDEX
): string | null {
  const e = index.bySource.get(repoPath);
  return e ? viewerHref(e.slug) : null;
}
