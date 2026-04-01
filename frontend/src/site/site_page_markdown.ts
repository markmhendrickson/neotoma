import { localizePath, stripLocaleFromPath } from "@/i18n/routing";
import type { SupportedLocale } from "@/i18n/config";
import {
  INDEXABLE_SITE_PAGE_PATHS,
  buildCanonicalUrl,
  getSeoMetadataForPath,
  resolveSeoMetadata,
} from "@/site/seo_metadata";

const INDEXABLE_SET = new Set(INDEXABLE_SITE_PAGE_PATHS);

/**
 * Normalize a user-supplied path query to a default-locale pathname (e.g. `/install`).
 */
export function normalizeSiteMarkdownPathParam(raw: string | null): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const noHash = withSlash.split("#")[0] ?? withSlash;
  const stripped = stripLocaleFromPath(noHash);
  if (stripped !== "/" && stripped.endsWith("/")) {
    return stripped.slice(0, -1) || "/";
  }
  return stripped || "/";
}

export function isIndexableSitePagePath(pathname: string): boolean {
  return INDEXABLE_SET.has(pathname);
}

/**
 * Markdown document for one route from resolved SEO metadata (not full HTML body).
 */
export function buildSitePageMarkdown(pathname: string): string {
  const resolved = resolveSeoMetadata(pathname);
  const routeMeta = getSeoMetadataForPath(pathname);
  const lines: string[] = [`# ${resolved.title}`, "", resolved.description, "", "## Meta", ""];
  lines.push(`- **Canonical URL:** ${resolved.canonicalUrl}`);
  lines.push(`- **Robots:** ${resolved.robots}`);
  if (routeMeta.breadcrumb && routeMeta.breadcrumb.length > 0) {
    lines.push("", "## Breadcrumb", "");
    for (const crumb of routeMeta.breadcrumb) {
      const url = buildCanonicalUrl(crumb.path);
      lines.push(`- [${crumb.name}](${url})`);
    }
  }
  if (resolved.keywords?.trim()) {
    lines.push("", "## Keywords", "", resolved.keywords);
  }
  return lines.join("\n");
}

/** Localized pathname for full-page Markdown (`/markdown/...`, HTML → GFM). */
export function fullPageMarkdownPath(indexablePath: string, locale: SupportedLocale): string {
  const markdownRoute = indexablePath === "/" ? "/markdown" : `/markdown${indexablePath}`;
  return localizePath(markdownRoute, locale);
}

/** @deprecated Use {@link fullPageMarkdownPath}; name kept for existing call sites. */
export function rawMarkdownTo(indexablePath: string, locale: SupportedLocale): string {
  return fullPageMarkdownPath(indexablePath, locale);
}

/** All indexable pages in one file, stable sort by path. */
export function buildAllSitePagesMarkdownBundle(): string {
  const paths = [...INDEXABLE_SITE_PAGE_PATHS].sort((a, b) => a.localeCompare(b));
  const intro = [
    "# Neotoma site pages (Markdown bundle)",
    "",
    "Each section is generated from public SEO metadata for that route (title, description, canonical URL, breadcrumbs, keywords). Full marketing and docs copy lives in the React pages.",
    "",
  ].join("\n");
  const sections = paths.map((p) => {
    const body = buildSitePageMarkdown(p);
    return `---\n\n## Route \`${p}\`\n\n${body}`;
  });
  return `${intro}\n${sections.join("\n\n")}\n`;
}
