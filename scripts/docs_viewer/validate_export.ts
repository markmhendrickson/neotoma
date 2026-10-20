/**
 * Export checks for docs viewer pages, run by `scripts/validate_site_export.ts` after the build.
 *
 * - every included manifest entry has a real page at /docs/<slug>/ with title, source link,
 *   build commit and a self canonical; no pending or unlisted document is published;
 * - no page carries a script, an event attribute, a style attribute, an embedded frame or a link
 *   with a scheme other than http, https or mailto;
 * - the rendered text passes the shared claim patterns (claim_patterns.ts), and no link points at a
 *   retired neotoma.io route;
 * - redirect stubs whose destination is a published document point at its viewer page;
 * - the sitemap lists every viewer page.
 */
import fs from "node:fs";
import path from "node:path";
import {
  DOCS_VIEWER_INDEX,
  DOCS_VIEWER_MANIFEST,
  type DocsViewerEntry,
  type DocsViewerIndex,
  viewerHref,
} from "../../frontend/src/site/docs_viewer_manifest";
import {
  RETIRED_DESTINATIONS,
  isRetiredRoute,
  resolveDestination,
} from "../../frontend/src/site/route_retirement";
import { findClaimProblems } from "./claim_patterns";
import { canonicalUrl } from "./page";

const VIEWER_MARKER = '<meta name="docs-viewer-source"';

export function pageText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/i, " ")
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|li|h[1-6]|td|th|pre|div|blockquote)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Markup problems in one viewer page; empty when the page is safe to serve. */
export function unsafeMarkup(html: string): string[] {
  const problems: string[] = [];
  if (/<script\b/i.test(html)) problems.push("contains a <script> element");
  if (
    /<(iframe|object|embed|frame|form|input|button|textarea|link\s[^>]*rel="?import)\b/i.test(html)
  ) {
    problems.push("contains an embedded frame, form or object element");
  }
  // Attribute names only: quoted values are removed first so text such as aria-label="x online=1" is not read as an attribute.
  const tags = [...html.matchAll(/<[a-z][a-z0-9]*\b[^>]*>/gi)].map((m) =>
    m[0].replace(/"[^"]*"|'[^']*'/g, '""')
  );
  if (tags.some((t) => /\son[a-z]+\s*=/i.test(t)))
    problems.push("contains an event attribute (on*=)");
  if (tags.some((t) => /\sstyle\s*=/i.test(t))) problems.push("contains a style attribute");
  if ((html.match(/<style\b/gi) ?? []).length !== 1)
    problems.push("must carry exactly one <style> (the chrome)");
  for (const m of html.matchAll(/\s(?:href|src)\s*=\s*"([^"]*)"/gi)) {
    const v = m[1].replace(/&amp;/g, "&").replace(/[\u0000- ]/g, "");
    if (/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^(https?:|mailto:)/i.test(v)) {
      problems.push(`link or source with a disallowed scheme: ${v.slice(0, 40)}`);
    }
  }
  return problems;
}

export function retiredRouteLinks(html: string, index: DocsViewerIndex): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/\shref="([^"]*)"/g)) {
    const href = m[1].replace(/&amp;/g, "&");
    let route: string | null = null;
    if (/^https?:\/\/(www\.)?neotoma\.io(\/|$)/i.test(href)) route = new URL(href).pathname;
    else if (href.startsWith("/") && !href.startsWith("//")) route = href.split(/[?#]/)[0];
    if (route === null) continue;
    const r = route.replace(/\/+$/, "") || "/";
    if (/\.(svg|ico|png|xml|txt)$/.test(r)) continue;
    if (isRetiredRoute(r, index)) out.push(href);
  }
  return out;
}

export function validateDocsViewerExport(
  siteDir: string,
  opts: { index?: DocsViewerIndex; manifest?: readonly DocsViewerEntry[] } = {}
): { problems: string[]; checked: number } {
  const index = opts.index ?? DOCS_VIEWER_INDEX;
  const manifest = opts.manifest ?? DOCS_VIEWER_MANIFEST;
  const problems: string[] = [];
  const pagePath = (slug: string) =>
    path.join(siteDir, viewerHref(slug).replace(/^\//, ""), "index.html");

  for (const entry of index.entries) {
    const file = pagePath(entry.slug);
    const where = `site_pages${viewerHref(entry.slug)}index.html`;
    if (!fs.existsSync(file)) {
      problems.push(`${where} is missing: ${entry.source} is included in the docs viewer manifest`);
      continue;
    }
    const html = fs.readFileSync(file, "utf-8");
    if (html.includes('http-equiv="refresh"') || !html.includes(VIEWER_MARKER)) {
      problems.push(`${where} is not a docs viewer page (stub or app page)`);
      continue;
    }
    for (const needle of [
      `<link rel="canonical" href="${canonicalUrl(entry)}">`,
      `<meta name="docs-viewer-source" content="${entry.source}">`,
      ">View and edit on GitHub</a>",
      `<h1>`,
    ]) {
      if (!html.includes(needle)) problems.push(`${where} lacks ${needle}`);
    }
    if (!/<meta name="docs-viewer-commit" content="(?:[0-9a-f]{7,40}|main)">/.test(html)) {
      problems.push(`${where} does not name its build commit`);
    }
    for (const p of unsafeMarkup(html)) problems.push(`${where} ${p}`);
    for (const f of findClaimProblems(pageText(html)))
      problems.push(`${where} text: ${f.label} ("${f.match}")`);
    for (const href of retiredRouteLinks(html, index))
      problems.push(`${where} links a retired neotoma.io route: ${href}`);
  }

  // Nothing pending or unlisted is published under /docs/.
  const included = new Set(index.entries.map((e) => e.slug));
  for (const entry of manifest) {
    if (included.has(entry.slug)) continue;
    const file = pagePath(entry.slug);
    if (fs.existsSync(file) && fs.readFileSync(file, "utf-8").includes(VIEWER_MARKER)) {
      problems.push(
        `site_pages${viewerHref(entry.slug)}index.html publishes ${entry.source}, which is not included`
      );
    }
  }
  const docsDir = path.join(siteDir, "docs");
  if (fs.existsSync(docsDir)) {
    for (const d of fs.readdirSync(docsDir, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name === "_media") continue;
      const file = path.join(docsDir, d.name, "index.html");
      if (
        !included.has(d.name) &&
        fs.existsSync(file) &&
        fs.readFileSync(file, "utf-8").includes(VIEWER_MARKER)
      ) {
        problems.push(
          `site_pages/docs/${d.name}/index.html is a viewer page for an unlisted document`
        );
      }
    }
  }

  // Redirect stubs whose destination is a published document point at the viewer page.
  for (const [route, mapped] of Object.entries(RETIRED_DESTINATIONS)) {
    if (!mapped || !isRetiredRoute(route, index)) continue;
    const entry = index.bySource.get(mapped);
    if (!entry) continue;
    const dest = resolveDestination(route, index).url;
    const expected = canonicalUrl(entry);
    if (dest !== expected) {
      problems.push(
        `retired route ${route} resolves to ${dest}, expected the viewer page ${expected}`
      );
      continue;
    }
    const stub = path.join(siteDir, route.replace(/^\//, ""), "index.html");
    if (fs.existsSync(stub) && !fs.readFileSync(stub, "utf-8").includes(`url=${expected}"`)) {
      problems.push(
        `site_pages${route}/index.html does not redirect to the viewer page ${expected}`
      );
    }
  }

  // Sitemap lists every viewer page.
  const sitemapPath = path.join(siteDir, "sitemap.xml");
  if (fs.existsSync(sitemapPath)) {
    const sitemap = fs.readFileSync(sitemapPath, "utf-8");
    for (const entry of index.entries) {
      if (!sitemap.includes(`<loc>${canonicalUrl(entry)}</loc>`)) {
        problems.push(`sitemap.xml does not list the docs viewer page ${canonicalUrl(entry)}`);
      }
    }
  }
  return { problems, checked: index.entries.length };
}
