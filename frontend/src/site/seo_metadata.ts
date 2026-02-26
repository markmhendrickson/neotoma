import { SITE_METADATA } from "./site_data";

export interface SeoRouteMetadata {
  title: string;
  description: string;
  robots: string;
  ogType?: "website" | "article";
  jsonLdType?: "WebPage" | "WebSite";
}

export const SEO_DEFAULTS = {
  siteName: "Neotoma",
  baseUrl: "https://neotoma.io",
  locale: "en_US",
  ogImageUrl: SITE_METADATA.ogImageUrl,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  twitterCard: "summary_large_image",
  twitterSite: "@markmhendrickson",
  author: "Neotoma",
};

const ROUTE_METADATA: Record<string, SeoRouteMetadata> = {
  "/": {
    title: "Neotoma | Truth layer for persistent AI agent memory",
    description:
      "Neotoma is the truth layer for persistent AI agent memory: deterministic, inspectable state with provenance. Install with npm, connect MCP, and query memory.",
    robots: "index,follow",
    ogType: "website",
    jsonLdType: "WebPage",
  },
  "/docs": {
    title: "Neotoma Documentation",
    description:
      "Documentation for Neotoma: setup, architecture, API references, and operational guides.",
    robots: "index,follow",
    ogType: "website",
    jsonLdType: "WebPage",
  },
  "/404": {
    title: "Page Not Found | Neotoma",
    description: "The requested page could not be found.",
    robots: "noindex,follow",
    ogType: "website",
    jsonLdType: "WebPage",
  },
};

export const SITEMAP_PATHS = ["/", "/docs"] as const;

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
  const normalizedPath = normalizePath(pathname);
  const base = SEO_DEFAULTS.baseUrl.replace(/\/$/, "");
  if (normalizedPath === "/") {
    return `${base}/`;
  }
  return `${base}${normalizedPath}`;
}

export function getSeoMetadataForPath(pathname: string): SeoRouteMetadata {
  const normalizedPath = normalizePath(pathname);
  if (ROUTE_METADATA[normalizedPath]) {
    return ROUTE_METADATA[normalizedPath];
  }
  if (normalizedPath.startsWith("/docs/")) {
    return ROUTE_METADATA["/docs"];
  }
  return ROUTE_METADATA["/404"];
}

function buildJsonLd(pathname: string, metadata: SeoRouteMetadata): Record<string, unknown> {
  const canonicalUrl = buildCanonicalUrl(pathname);
  const type = metadata.jsonLdType ?? "WebPage";
  return {
    "@context": "https://schema.org",
    "@type": type,
    name: metadata.title,
    description: metadata.description,
    url: canonicalUrl,
    publisher: { "@type": "Organization", name: SEO_DEFAULTS.siteName },
  };
}

export interface ResolvedSeoMetadata {
  title: string;
  description: string;
  robots: string;
  canonicalUrl: string;
  ogType: "website" | "article";
  ogImageUrl: string;
  jsonLd: Record<string, unknown>;
}

export function resolveSeoMetadata(pathname: string): ResolvedSeoMetadata {
  const routeMetadata = getSeoMetadataForPath(pathname);
  return {
    title: routeMetadata.title,
    description: routeMetadata.description,
    robots: routeMetadata.robots,
    canonicalUrl: buildCanonicalUrl(pathname),
    ogType: routeMetadata.ogType ?? "website",
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
  const sitemapUrl = `${SEO_DEFAULTS.baseUrl.replace(/\/$/, "")}/sitemap.xml`;
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;
}
