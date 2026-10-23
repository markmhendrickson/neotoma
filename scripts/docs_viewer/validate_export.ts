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
 * - the sitemap lists every viewer page and nothing else under /docs.
 *
 * Every check is a single linear pass (scanHtml), so a hostile or broken page cannot stall the build.
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

export interface ScannedTag {
  /** Lower-case element name. */
  name: string;
  closing: boolean;
  /** Attributes in source order, names lower-cased, values as written (entities not decoded). */
  attrs: { name: string; value: string }[];
}

const BLOCK_CLOSE = new Set([
  "p",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "td",
  "th",
  "pre",
  "div",
  "blockquote",
]);
const SPACE = /\s/;

function parseAttrs(raw: string): { name: string; value: string }[] {
  const attrs: { name: string; value: string }[] = [];
  let i = 0;
  const n = raw.length;
  while (i < n) {
    while (i < n && (SPACE.test(raw[i]) || raw[i] === "/")) i++;
    const start = i;
    while (i < n && !SPACE.test(raw[i]) && raw[i] !== "/" && raw[i] !== "=") i++;
    if (i === start) {
      i++;
      continue;
    }
    const name = raw.slice(start, i).toLowerCase();
    while (i < n && SPACE.test(raw[i])) i++;
    let value = "";
    if (raw[i] === "=") {
      i++;
      while (i < n && SPACE.test(raw[i])) i++;
      const q = raw[i];
      if (q === '"' || q === "'") {
        const end = raw.indexOf(q, i + 1);
        value = raw.slice(i + 1, end < 0 ? n : end);
        i = end < 0 ? n : end + 1;
      } else {
        const vs = i;
        while (i < n && !SPACE.test(raw[i])) i++;
        value = raw.slice(vs, i);
      }
    }
    attrs.push({ name, value });
  }
  return attrs;
}

/**
 * One linear pass over an HTML document: its tags and its visible text. Quoted attribute values may
 * contain ">". An unterminated tag, comment or raw-text element ends the scan (a browser would also
 * swallow the rest), so the cost stays linear whatever the input. Head content and script and
 * style bodies are not text.
 */
export function scanHtml(html: string): { tags: ScannedTag[]; text: string } {
  const tags: ScannedTag[] = [];
  const lower = html.toLowerCase();
  const parts: string[] = [];
  let inHead = false;
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      if (!inHead) parts.push(html.slice(i));
      break;
    }
    if (!inHead) parts.push(html.slice(i, lt));
    const next = html[lt + 1] ?? "";
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      if (end < 0) break;
      i = end + 3;
      continue;
    }
    if (next === "!" || next === "?") {
      const end = html.indexOf(">", lt);
      if (end < 0) break;
      i = end + 1;
      continue;
    }
    const closing = next === "/";
    const nameStart = closing ? lt + 2 : lt + 1;
    const nameMatch = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(html.slice(nameStart, nameStart + 32));
    if (!nameMatch) {
      if (!inHead) parts.push("<");
      i = lt + 1;
      continue;
    }
    // The closing ">" outside quotes.
    let j = nameStart + nameMatch[0].length;
    let quote = "";
    while (j < n) {
      const c = html[j];
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
      j++;
    }
    if (j >= n) break; // unterminated tag: nothing after it can be a tag
    const name = nameMatch[0].toLowerCase();
    const attrs = closing ? [] : parseAttrs(html.slice(nameStart + nameMatch[0].length, j));
    tags.push({ name, closing, attrs });
    i = j + 1;
    if (name === "head") inHead = !closing;
    if (!closing && (name === "script" || name === "style")) {
      const end = lower.indexOf(`</${name}`, i);
      if (end < 0) break;
      i = end;
      continue;
    }
    if (closing && BLOCK_CLOSE.has(name) && !inHead) parts.push("\n\n");
  }
  const decoded = parts
    .join("")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
  return { tags, text: decoded };
}

export function pageText(html: string): string {
  return scanHtml(html).text;
}

const FORBIDDEN_ELEMENTS = new Set([
  "iframe",
  "object",
  "embed",
  "frame",
  "frameset",
  "form",
  "input",
  "button",
  "textarea",
  "base",
]);

/** Markup problems in one viewer page; empty when the page is safe to serve. Linear in the input. */
export function unsafeMarkup(html: string): string[] {
  const problems = new Set<string>();
  const { tags } = scanHtml(html);
  let styles = 0;
  for (const t of tags) {
    if (t.closing) continue;
    if (t.name === "script") problems.add("contains a <script> element");
    else if (FORBIDDEN_ELEMENTS.has(t.name)) {
      problems.add("contains an embedded frame, form or object element");
    }
    if (t.name === "link" && t.attrs.some((a) => a.name === "rel" && /import/i.test(a.value))) {
      problems.add("contains an embedded frame, form or object element");
    }
    if (t.name === "style") styles++;
    for (const a of t.attrs) {
      if (/^on[a-z]+$/.test(a.name)) problems.add("contains an event attribute (on*=)");
      if (a.name === "style") problems.add("contains a style attribute");
      if (a.name === "href" || a.name === "src") {
        const v = a.value.replace(/&amp;/g, "&").replace(/[\u0000- ]/g, "");
        if (/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^(https?:|mailto:)/i.test(v)) {
          problems.add(`link or source with a disallowed scheme: ${v.slice(0, 40)}`);
        }
        if (/\\|%5c/i.test(v)) problems.add(`link or source with a backslash: ${v.slice(0, 40)}`);
      }
    }
  }
  if (styles !== 1) problems.add("must carry exactly one <style> (the chrome)");
  return [...problems];
}

export function retiredRouteLinks(html: string, index: DocsViewerIndex): string[] {
  const out: string[] = [];
  for (const t of scanHtml(html).tags) {
    if (t.closing) continue;
    for (const a of t.attrs) {
      if (a.name !== "href") continue;
      const href = a.value.replace(/&amp;/g, "&");
      let route: string | null = null;
      if (/^https?:\/\/(www\.)?neotoma\.io(\/|$)/i.test(href)) {
        try {
          route = new URL(href).pathname;
        } catch {
          route = null;
        }
      } else if (href.startsWith("/") && !href.startsWith("//")) route = href.split(/[?#]/)[0];
      if (route === null) continue;
      const r = route.replace(/\/+$/, "") || "/";
      if (/\.(svg|ico|png|xml|txt)$/.test(r)) continue;
      if (isRetiredRoute(r, index)) out.push(href);
    }
  }
  return out;
}

/** Sitemap locations under /docs that are not included viewer pages. */
export function unlistedSitemapDocs(sitemap: string, index: DocsViewerIndex): string[] {
  const allowed = new Set(index.entries.map((e) => canonicalUrl(e)));
  const out: string[] = [];
  for (const m of sitemap.matchAll(/<loc>([^<]{0,2048})<\/loc>/g)) {
    const loc = m[1].trim();
    if (/^https:\/\/(www\.)?neotoma\.io\/docs(\/|$)/.test(loc) && !allowed.has(loc)) out.push(loc);
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
    for (const f of findClaimProblems(pageText(html))) {
      // The vocabulary page quotes retired nouns as forbidden terms. Its source still passes the
      // context-aware docs lint; this flattened HTML text scan cannot retain that list context.
      if (entry.source === "docs/vocabulary/canonical_terms.md" && f.id === "retired-noun")
        continue;
      problems.push(`${where} text: ${f.label} ("${f.match}")`);
    }
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
    for (const loc of unlistedSitemapDocs(sitemap, index)) {
      problems.push(`sitemap.xml lists ${loc}, which is not an included docs viewer page`);
    }
  }
  return { problems, checked: index.entries.length };
}
