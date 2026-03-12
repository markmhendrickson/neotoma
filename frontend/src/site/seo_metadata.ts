import { SITE_METADATA } from "./site_data";
import {
  DEFAULT_LOCALE,
  LOCALE_TO_OG,
  NON_DEFAULT_LOCALES,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/i18n/config";
import { getLocaleFromPath, localizePath, stripLocaleFromPath } from "@/i18n/routing";

export interface SeoRouteMetadata {
  title: string;
  description: string;
  robots: string;
  ogType?: "website" | "article";
  jsonLdType?: "WebPage" | "WebSite" | "SoftwareApplication";
  breadcrumb?: { name: string; path: string }[];
}

export const SEO_DEFAULTS = {
  siteName: "Neotoma",
  baseUrl: "https://neotoma.io",
  locale: LOCALE_TO_OG[DEFAULT_LOCALE],
  ogImageUrl: SITE_METADATA.ogImageUrl,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  twitterCard: "summary_large_image",
  twitterSite: "@markmhendrickson",
  author: "Neotoma",
};

const ROUTE_METADATA: Record<string, SeoRouteMetadata> = {
  "/": {
    title: "Neotoma | Deterministic state layer for long-running agents",
    description:
      "Deterministic agent state layer for long-running agents: deterministic state evolution, versioned, schema-bound, replayable, auditable. No silent mutation. Install with npm, connect MCP.",
    robots: "index,follow",
    ogType: "website",
    jsonLdType: "WebSite",
  },
  "/install": {
    title: "Install | Neotoma",
    description:
      "Install Neotoma in 5 minutes. Agent-assisted and manual install, Docker setup, API server startup, and MCP configuration.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Install", path: "/install" },
    ],
  },
  "/docs": {
    title: "Neotoma Documentation | Setup, API, MCP, CLI References",
    description:
      "Documentation for Neotoma: setup, architecture, API references, and operational guides.",
    robots: "index,follow",
    ogType: "website",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
    ],
  },
  "/terminology": {
    title: "Core Terminology | Neotoma",
    description:
      "Glossary of key concepts in Neotoma: observations, entities, snapshots, timelines, and deterministic state.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Terminology", path: "/terminology" },
    ],
  },
  "/agent-instructions": {
    title: "Agent Instructions | Neotoma",
    description:
      "Mandatory behavioral rules for AI agents using Neotoma: persistence, entity extraction, and conventions.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Agent Instructions", path: "/agent-instructions" },
    ],
  },
  "/api": {
    title: "REST API Reference | Neotoma",
    description:
      "OpenAPI endpoints and parameters for Neotoma: store, retrieve, search, and manage entities via HTTP.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "API", path: "/api" },
    ],
  },
  "/mcp": {
    title: "MCP Server Reference | Neotoma",
    description:
      "Model Context Protocol actions for Neotoma: store, retrieve, and query structured memory from any MCP client.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "MCP", path: "/mcp" },
    ],
  },
  "/cli": {
    title: "CLI Reference | Neotoma",
    description:
      "Neotoma command-line interface: commands, flags, REPL, and offline-first data operations.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "CLI", path: "/cli" },
    ],
  },
  "/architecture": {
    title: "Architecture | Neotoma",
    description:
      "Neotoma system architecture: state flow, three foundations, entity resolution pipeline, and deterministic guarantees.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Architecture", path: "/architecture" },
    ],
  },
  "/ai-infrastructure-engineers": {
    title: "For AI infrastructure engineers | Neotoma",
    description:
      "How Neotoma solves agent memory drift for AI infrastructure engineers building stateful agent systems.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "AI infrastructure engineers", path: "/ai-infrastructure-engineers" },
    ],
  },
  "/ai-native-operators": {
    title: "For AI-native operators | Neotoma",
    description:
      "Persistent, cross-session memory for AI-native operators who run agents across tools and platforms daily.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "AI-native operators", path: "/ai-native-operators" },
    ],
  },
  "/agentic-systems-builders": {
    title: "For builders of agentic systems | Neotoma",
    description:
      "Deterministic memory and provenance layer for builders of multi-agent systems and AI toolchains.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Builders of agentic systems", path: "/agentic-systems-builders" },
    ],
  },
  "/neotoma-with-cursor": {
    title: "Neotoma with Cursor | Integration Guide",
    description:
      "Use Neotoma as persistent structured memory alongside Cursor context for cross-session AI development.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Cursor", path: "/neotoma-with-cursor" },
    ],
  },
  "/neotoma-with-claude": {
    title: "Neotoma with Claude (Web / Mobile / Desktop) | Integration Guide",
    description:
      "Pair Neotoma's deterministic structured state with Claude's platform apps for reliable cross-session context via MCP.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Claude", path: "/neotoma-with-claude" },
    ],
  },
  "/neotoma-with-claude-code": {
    title: "Neotoma with Claude Code | Integration Guide",
    description:
      "Persistent structured memory for Claude Code's local CLI agent. Cross-session state via MCP or CLI fallback.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Claude Code", path: "/neotoma-with-claude-code" },
    ],
  },
  "/neotoma-with-chatgpt": {
    title: "Neotoma with ChatGPT | Integration Guide",
    description:
      "Structured deterministic memory for ChatGPT conversations. Cross-tool continuity via MCP and CLI.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "ChatGPT", path: "/neotoma-with-chatgpt" },
    ],
  },
  "/neotoma-with-codex": {
    title: "Neotoma with Codex | Integration Guide",
    description:
      "Cross-task memory and CLI fallback for OpenAI Codex agents using Neotoma as their state layer.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Codex", path: "/neotoma-with-codex" },
    ],
  },
  "/neotoma-with-openclaw": {
    title: "Neotoma with OpenClaw | Integration Guide",
    description:
      "User-owned structured memory for OpenClaw agents. Neotoma provides the persistent state layer beneath OpenClaw execution.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "OpenClaw", path: "/neotoma-with-openclaw" },
    ],
  },
  "/deterministic-state-evolution": {
    title: "Deterministic State Evolution | Neotoma",
    description:
      "How Neotoma guarantees the same observations always produce the same entity state, eliminating ordering bugs.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Deterministic State", path: "/deterministic-state-evolution" },
    ],
  },
  "/versioned-history": {
    title: "Versioned History | Neotoma",
    description:
      "Every entity change creates a new version. Earlier states are preserved and accessible at any point in time.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Versioned History", path: "/versioned-history" },
    ],
  },
  "/replayable-timeline": {
    title: "Replayable Timeline | Neotoma",
    description:
      "Replay the full sequence of observations and state changes to reconstruct any historical entity state.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Replayable Timeline", path: "/replayable-timeline" },
    ],
  },
  "/auditable-change-log": {
    title: "Auditable Change Log | Neotoma",
    description:
      "Every modification records who made it, when, and from what source for a complete audit trail.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Auditable Change Log", path: "/auditable-change-log" },
    ],
  },
  "/schema-constraints": {
    title: "Schema Constraints | Neotoma",
    description:
      "Entities conform to defined types and validation rules, preventing garbage-in-garbage-out failures across agents.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Schema Constraints", path: "/schema-constraints" },
    ],
  },
  "/silent-mutation-risk": {
    title: "Silent Mutation Risk | Neotoma",
    description:
      "How Neotoma prevents data changes without explicit user awareness — no overwrites, merges, or drops without a trace.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Silent Mutation Risk", path: "/silent-mutation-risk" },
    ],
  },
  "/conflicting-facts-risk": {
    title: "Conflicting Facts Risk | Neotoma",
    description:
      "How Neotoma detects and resolves contradictory statements in memory using deterministic merge rules.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Conflicting Facts Risk", path: "/conflicting-facts-risk" },
    ],
  },
  "/reproducible-state-reconstruction": {
    title: "Reproducible State Reconstruction | Neotoma",
    description:
      "Rebuild complete current state from raw inputs alone — like a ledger that balances to zero from its entries.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Reproducible State", path: "/reproducible-state-reconstruction" },
    ],
  },
  "/human-inspectability": {
    title: "Human Inspectability | Neotoma",
    description:
      "Examine exactly what changed between any two entity versions and trace where each fact originated.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Human Inspectability", path: "/human-inspectability" },
    ],
  },
  "/zero-setup-onboarding": {
    title: "Zero-Setup Onboarding | Neotoma",
    description:
      "How zero-setup memory works in platform products and what you trade for the convenience of no installation.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Zero-Setup Onboarding", path: "/zero-setup-onboarding" },
    ],
  },
  "/semantic-similarity-search": {
    title: "Semantic Similarity Search | Neotoma",
    description:
      "Find relevant prior context by meaning, not exact match — applied to structured entity snapshots with type and relationship scoping.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Semantic Similarity Search", path: "/semantic-similarity-search" },
    ],
  },
  "/direct-human-editability": {
    title: "Direct Human Editability | Neotoma",
    description:
      "How file-based memory enables direct editing in any text editor and the trade-offs versus structured, schema-validated systems.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Direct Human Editability", path: "/direct-human-editability" },
    ],
  },
  "/platform-memory": {
    title: "Platform Memory | Neotoma",
    description:
      "How platform memory (Claude, ChatGPT, Gemini) works and what guarantees it does and does not provide.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Memory Models", path: "/#memory-guarantees" },
      { name: "Platform Memory", path: "/platform-memory" },
    ],
  },
  "/retrieval-memory": {
    title: "Retrieval Memory | Neotoma",
    description:
      "How retrieval memory (Mem0, Zep, LangChain) works and where it falls short on deterministic guarantees.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Memory Models", path: "/#memory-guarantees" },
      { name: "Retrieval Memory", path: "/retrieval-memory" },
    ],
  },
  "/file-based-memory": {
    title: "File-Based Memory | Neotoma",
    description:
      "How file-based memory (Markdown, JSON, CRDT docs) works and what guarantees it provides and lacks.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Memory Models", path: "/#memory-guarantees" },
      { name: "File-Based Memory", path: "/file-based-memory" },
    ],
  },
  "/deterministic-memory": {
    title: "Deterministic Memory | Neotoma",
    description:
      "How Neotoma's deterministic memory model enforces versioned, schema-bound, replayable, and auditable state.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Memory Models", path: "/#memory-guarantees" },
      { name: "Deterministic Memory", path: "/deterministic-memory" },
    ],
  },
  "/memory-guarantees": {
    title: "Memory Guarantees | Neotoma",
    description:
      "Memory properties that determine reliability under production load: deterministic state evolution, versioned history, replayable timeline, auditable change log, schema constraints, and more.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Memory Guarantees", path: "/memory-guarantees" },
    ],
  },
  "/foundations": {
    title: "Foundations | Neotoma",
    description:
      "Neotoma's architectural foundations: privacy-first local data with no cloud sync, and cross-platform memory across all AI tools via MCP.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Foundations", path: "/foundations" },
    ],
  },
  "/privacy-first": {
    title: "Privacy-First Memory | Neotoma",
    description:
      "Your data stays local. User-controlled storage, encryption at rest, full export and deletion. Never used for training.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Architecture", path: "/architecture" },
      { name: "Privacy-First", path: "/privacy-first" },
    ],
  },
  "/cross-platform": {
    title: "Cross-Platform Memory | Neotoma",
    description:
      "One memory system across Claude, ChatGPT, Cursor, Codex, and CLI. MCP-based access with no platform lock-in.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Architecture", path: "/architecture" },
      { name: "Cross-Platform", path: "/cross-platform" },
    ],
  },
  "/memory-vendors": {
    title: "Memory Vendor Comparison | Neotoma",
    description:
      "Compare memory model vendors across guarantee properties: platform, retrieval, file-based, and deterministic.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Memory Vendors", path: "/memory-vendors" },
    ],
  },
  "/404": {
    title: "Page Not Found | Neotoma",
    description: "The requested page could not be found.",
    robots: "noindex,follow",
    ogType: "website",
    jsonLdType: "WebPage",
  },
};

/** All indexable paths derived from the route registry (excludes noindex routes). */
const INDEXABLE_DEFAULT_LOCALE_PATHS: readonly string[] = Object.entries(ROUTE_METADATA)
  .filter(([, meta]) => meta.robots === "index,follow")
  .map(([path]) => path);

/** Includes default locale paths and prefixed paths for non-default locales. */
export const SITEMAP_PATHS: readonly string[] = [
  ...INDEXABLE_DEFAULT_LOCALE_PATHS,
  ...NON_DEFAULT_LOCALES.flatMap((locale) =>
    INDEXABLE_DEFAULT_LOCALE_PATHS.map((path) => localizePath(path, locale)),
  ),
];

function stripQueryAndHash(pathname: string): string {
  const [withoutQuery] = pathname.split("?");
  const [withoutHash] = withoutQuery.split("#");
  return withoutHash || "/";
}

function normalizePath(pathname: string): string {
  const value = stripQueryAndHash(pathname).trim();
  if (!value) return "/";
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  if (withLeadingSlash !== "/" && withLeadingSlash.endsWith("/")) {
    return withLeadingSlash.slice(0, -1);
  }
  return withLeadingSlash;
}

export function buildCanonicalUrl(pathname: string): string {
  const locale = getLocaleFromPath(pathname) ?? DEFAULT_LOCALE;
  const normalizedPath = normalizePath(localizePath(stripLocaleFromPath(pathname), locale));
  const base = SEO_DEFAULTS.baseUrl.replace(/\/$/, "");
  if (normalizedPath === "/") {
    return `${base}/`;
  }
  return `${base}${normalizedPath}`;
}

export function getSeoMetadataForPath(pathname: string): SeoRouteMetadata {
  const normalizedPath = normalizePath(stripLocaleFromPath(pathname));
  if (ROUTE_METADATA[normalizedPath]) {
    return ROUTE_METADATA[normalizedPath];
  }
  if (normalizedPath.startsWith("/docs/")) {
    return ROUTE_METADATA["/docs"];
  }
  return ROUTE_METADATA["/404"];
}

function buildJsonLd(pathname: string, metadata: SeoRouteMetadata): Record<string, unknown>[] {
  const canonicalUrl = buildCanonicalUrl(pathname);
  const type = metadata.jsonLdType ?? "WebPage";
  const publisher = { "@type": "Organization", name: SEO_DEFAULTS.siteName };

  const primary: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": type,
    name: metadata.title,
    description: metadata.description,
    url: canonicalUrl,
    publisher,
  };

  if (type === "WebSite") {
    primary.potentialAction = {
      "@type": "SearchAction",
      target: `${SEO_DEFAULTS.baseUrl}/docs?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    };
  }

  const items: Record<string, unknown>[] = [primary];

  if (metadata.breadcrumb && metadata.breadcrumb.length > 0) {
    items.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: metadata.breadcrumb.map((crumb, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        name: crumb.name,
        item: buildCanonicalUrl(crumb.path),
      })),
    });
  }

  return items;
}

export interface ResolvedSeoMetadata {
  title: string;
  description: string;
  robots: string;
  canonicalUrl: string;
  ogType: "website" | "article";
  ogLocale: string;
  locale: SupportedLocale;
  alternates: { hrefLang: string; href: string }[];
  ogImageUrl: string;
  jsonLd: Record<string, unknown>[];
}

function buildAlternates(pathname: string): { hrefLang: string; href: string }[] {
  const basePath = stripLocaleFromPath(pathname);
  const alternates = SUPPORTED_LOCALES.map((locale) => ({
    hrefLang: locale,
    href: buildCanonicalUrl(localizePath(basePath, locale)),
  }));
  return [{ hrefLang: "x-default", href: buildCanonicalUrl(basePath) }, ...alternates];
}

export function resolveSeoMetadata(pathname: string): ResolvedSeoMetadata {
  const locale = getLocaleFromPath(pathname) ?? DEFAULT_LOCALE;
  const routeMetadata = getSeoMetadataForPath(pathname);
  const robots =
    typeof process !== "undefined" && process.env?.SITE_PREVIEW === "1"
      ? "noindex,follow"
      : routeMetadata.robots;
  return {
    title: routeMetadata.title,
    description: routeMetadata.description,
    robots,
    canonicalUrl: buildCanonicalUrl(pathname),
    ogType: routeMetadata.ogType ?? "website",
    locale,
    ogLocale: LOCALE_TO_OG[locale],
    alternates: buildAlternates(pathname),
    ogImageUrl: SEO_DEFAULTS.ogImageUrl,
    jsonLd: buildJsonLd(pathname, routeMetadata),
  };
}

export function buildSitemapXml(paths: readonly string[] = SITEMAP_PATHS): string {
  const urlEntries = paths
    .map((path) => `  <url><loc>${buildCanonicalUrl(path)}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>\n`;
}

export function buildRobotsTxt(): string {
  const base = SEO_DEFAULTS.baseUrl.replace(/\/$/, "");
  const sitemapUrl = `${base}/sitemap.xml`;
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;
}

// ---------------------------------------------------------------------------
// Static HTML pre-rendering for bot-friendly meta tags
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Replace homepage meta tags in an HTML template with route-specific values.
 * Designed to run at build time so static HTML files serve correct metadata
 * to crawlers that don't execute JavaScript.
 */
export function injectRouteMetaIntoHtml(html: string, routePath: string): string {
  const meta = resolveSeoMetadata(routePath);
  let out = html;

  out = out.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`);

  out = out.replace(
    /<meta name="description" content="[^"]*"/,
    `<meta name="description" content="${escapeHtml(meta.description)}"`
  );
  out = out.replace(
    /<meta name="robots" content="[^"]*"/,
    `<meta name="robots" content="${escapeHtml(meta.robots)}"`
  );
  out = out.replace(
    /<link rel="canonical" href="[^"]*"/,
    `<link rel="canonical" href="${escapeHtml(meta.canonicalUrl)}"`
  );

  const ogLocaleTag = `<meta property="og:locale" content="${escapeHtml(meta.ogLocale)}" />`;
  if (/<meta property="og:locale" content="[^"]*"/.test(out)) {
    out = out.replace(
      /<meta property="og:locale" content="[^"]*"/,
      `<meta property="og:locale" content="${escapeHtml(meta.ogLocale)}"`
    );
  } else {
    out = out.replace("</head>", `    ${ogLocaleTag}\n  </head>`);
  }
  out = out.replace(
    /<meta property="og:title" content="[^"]*"/,
    `<meta property="og:title" content="${escapeHtml(meta.title)}"`
  );
  out = out.replace(
    /<meta property="og:description" content="[^"]*"/,
    `<meta property="og:description" content="${escapeHtml(meta.description)}"`
  );
  out = out.replace(
    /<meta property="og:url" content="[^"]*"/,
    `<meta property="og:url" content="${escapeHtml(meta.canonicalUrl)}"`
  );

  out = out.replace(
    /<meta name="twitter:title" content="[^"]*"/,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}"`
  );
  out = out.replace(
    /<meta name="twitter:description" content="[^"]*"/,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}"`
  );

  out = out.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    meta.jsonLd
      .map((entry) => `<script type="application/ld+json">${JSON.stringify(entry)}</script>`)
      .join("\n    ")
  );

  out = out.replace(/<link rel="alternate" hrefLang="[^"]*" href="[^"]*" \/>\s*/g, "");
  const alternatesHtml = meta.alternates
    .map(
      (alternate) =>
        `<link rel="alternate" hrefLang="${escapeHtml(alternate.hrefLang)}" href="${escapeHtml(alternate.href)}" />`
    )
    .join("\n    ");
  if (alternatesHtml) {
    out = out.replace("</head>", `    ${alternatesHtml}\n  </head>`);
  }

  out = out.replace(/<html lang="[^"]*"/, `<html lang="${meta.locale}"`);

  return out;
}
