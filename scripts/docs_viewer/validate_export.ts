/**
 * Export checks for docs viewer pages, run by `scripts/validate_site_export.ts` after the build.
 *
 * - every included manifest entry has a real page at /<slug>/ with title, source link,
 *   build commit and a self canonical; no pending or unlisted document is published;
 * - no page carries a script other than the optional fixed first-party analytics bootstrap,
 *   an event attribute, a style attribute, an embedded frame or a link
 *   with a scheme other than http, https or mailto;
 * - the rendered text passes the shared claim patterns (claim_patterns.ts), and no link points at a
 *   retired neotoma.io route;
 * - redirect stubs whose destination is a published document point at its viewer page;
 * - the sitemap lists every topic page and does not list the retired /docs routes.
 *
 * The source scanner and browser-compatible attribute parser each run once per page.
 */
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
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
import { canonicalUrl, readerAnalyticsTag } from "./page";
import { containedRepoFile, docsViewerAliasRoutes } from "./build";
import { FORBIDDEN_TERM_CONTEXTS } from "./render";
import { DOCS_VIEWER_BODY_TAGS } from "./serialize";

const VIEWER_MARKER = '<meta name="docs-viewer-source"';

export interface ScannedTag {
  /** Lower-case element name. */
  name: string;
  closing: boolean;
  /** Attributes in source order, names lower-cased, values as written (entities not decoded). */
  attrs: { name: string; value: string }[];
  /** Byte offsets in the original HTML for exact script serialization checks. */
  start: number;
  end: number;
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
interface VisibleBlock {
  name: string;
  start: number;
  end: number | null;
  listStart: number | null;
}

function decodeText(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function scanHtml(html: string): {
  tags: ScannedTag[];
  text: string;
  claimExempt: [number, number][];
} {
  const tags: ScannedTag[] = [];
  const lower = html.toLowerCase();
  const parts: string[] = [];
  const blocks: VisibleBlock[] = [];
  const openBlocks: VisibleBlock[] = [];
  const listStarts: number[] = [];
  let textLength = 0;
  const append = (s: string) => {
    const decoded = decodeText(s);
    parts.push(decoded);
    textLength += decoded.length;
  };
  let inHead = false;
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      if (!inHead) append(html.slice(i));
      break;
    }
    if (!inHead) append(html.slice(i, lt));
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
      if (!inHead) append("<");
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
    tags.push({ name, closing, attrs, start: lt, end: j + 1 });
    i = j + 1;
    if (!inHead && /^(?:h[1-6]|p|li|ul|ol|pre)$/.test(name)) {
      if (closing) {
        // Discard unmatched opens as a browser would; each block is popped at most once.
        while (openBlocks.length) {
          const block = openBlocks.pop()!;
          if (block.name === "ul" || block.name === "ol") listStarts.pop();
          if (block.name === name) {
            block.end = textLength;
            break;
          }
        }
      } else {
        const block = { name, start: textLength, end: null, listStart: listStarts.at(-1) ?? null };
        blocks.push(block);
        openBlocks.push(block);
        if (name === "ul" || name === "ol") listStarts.push(block.start);
      }
    }
    if (name === "head") inHead = !closing;
    if (!closing && (name === "script" || name === "style")) {
      const end = lower.indexOf(`</${name}`, i);
      if (end < 0) break;
      i = end;
      continue;
    }
    if (closing && BLOCK_CLOSE.has(name) && !inHead) append("\n\n");
  }
  const text = parts.join("");
  const claimExempt: [number, number][] = [];
  const quoted = /"[^"\n]{1,80}"|\u201c[^\u201d\n]{1,80}\u201d/g;
  const exemptQuoted = (block: VisibleBlock) => {
    for (const m of text.slice(block.start, block.end ?? block.start).matchAll(quoted)) {
      const start = block.start + (m.index ?? 0);
      claimExempt.push([start, start + m[0].length]);
    }
  };
  let headingForbiddenDepth: number | null = null;
  let leadIn = false;
  const permittedLists = new Set<number>();
  // Blocks are already extracted by the scanner; use their visible positions to preserve the
  // same explicit forbidden-term contexts as source lint without trusting the source filename.
  for (const block of blocks) {
    if (block.end === null) continue;
    if (/^h[1-6]$/.test(block.name)) {
      const value = text.slice(block.start, block.end).replace(/#$/, "").trim();
      const depth = Number(block.name[1]);
      if (headingForbiddenDepth !== null && depth <= headingForbiddenDepth)
        headingForbiddenDepth = null;
      if ((FORBIDDEN_TERM_CONTEXTS.headings as readonly string[]).includes(value))
        headingForbiddenDepth = depth;
      leadIn = false;
    } else if (block.name === "p" && block.listStart === null) {
      const value = text.slice(block.start, block.end).trim();
      leadIn = (FORBIDDEN_TERM_CONTEXTS.leadIns as readonly string[]).includes(value);
      if (FORBIDDEN_TERM_CONTEXTS.sentence.test(value)) exemptQuoted(block);
    } else if (block.name === "ul" || block.name === "ol") {
      if (leadIn) permittedLists.add(block.start);
      leadIn = false;
    } else if (
      block.name === "li" &&
      (headingForbiddenDepth !== null ||
        (block.listStart !== null && permittedLists.has(block.listStart)))
    ) {
      exemptQuoted(block);
    } else if (block.name === "pre") {
      let at = block.start;
      for (const line of text.slice(block.start, block.end).split("\n")) {
        if (FORBIDDEN_TERM_CONTEXTS.fencedLine.test(line)) claimExempt.push([at, at + line.length]);
        at += line.length + 1;
      }
    }
  }
  return { tags, text, claimExempt };
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

/** SiteChrome adds these authored elements around the serialized document body. */
const READER_CHROME_TAGS = new Set([
  "html",
  "head",
  "meta",
  "title",
  "link",
  "style",
  "script",
  "body",
  "header",
  "nav",
  "main",
  "article",
  "figure",
  "figcaption",
  "footer",
]);
const READER_ATTRIBUTES = new Set([
  "alt",
  "aria-current",
  "aria-label",
  "aria-labelledby",
  "charset",
  "class",
  "content",
  "height",
  "href",
  "hreflang",
  "id",
  "lang",
  "loading",
  "name",
  "property",
  "rel",
  "role",
  "sizes",
  "src",
  "tabindex",
  "title",
  "type",
  "width",
  "decoding",
  "start",
  "align",
  "defer",
  "data-neotoma-reader-analytics",
  "data-website-id",
  "data-umami-url",
  "data-page-path",
  "data-locale-choice",
  "data-neotoma-reader-language",
  "aria-describedby",
]);
const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const READER_LINK_RELS = new Set(["canonical", "alternate", "icon"]);

/** Markup problems in one viewer page; empty when the page is safe to serve. Linear in the input. */
export function unsafeMarkup(html: string): string[] {
  const problems = new Set<string>();
  const checkUrlAttribute = (value: string) => {
    // Browser URL parsing ignores ASCII whitespace and controls around or within a scheme.
    const v = value.replace(/[\u0000-\u0020\u007f-\u009f]/g, "");
    if (/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^(https?:|mailto:)/i.test(v))
      problems.add("link or source with a disallowed scheme");
    if (v.startsWith("//")) problems.add("link or source with a protocol-relative URL");
    if (/\\|%5c/i.test(v)) problems.add("link or source with a backslash");
  };
  const { tags } = scanHtml(html);
  const scriptTags = tags.filter((t) => t.name === "script");
  const headOpen = tags.find((t) => t.name === "head" && !t.closing);
  const headClose = tags.find((t) => t.name === "head" && t.closing);
  const rawScriptMarkers = [...html.matchAll(/<\/?script\b/gi)];
  const trustedScriptOpens = new Set<ScannedTag>();
  let languageCount = 0;
  let analyticsCount = 0;
  if (rawScriptMarkers.length !== scriptTags.length || scriptTags.length > 4 || scriptTags.length % 2 !== 0)
    problems.add("contains a <script> element");
  for (let i = 0; i < scriptTags.length; i += 2) {
    const open = scriptTags[i], close = scriptTags[i + 1];
    if (!open || !close || open.closing || !close.closing) {
      problems.add("contains a <script> element");
      continue;
    }
    const exact = html.slice(open.start, close.end);
    // Even the two exact first-party chrome assets are trusted only in the document head.
    // A copied tag inside article content must not gain that chrome exception.
    if (!headOpen || !headClose || open.start < headOpen.end || close.end > headClose.start)
      problems.add("fixed script must be in the document head");
    if (exact === '<script defer src="/assets/reader-language.js" data-neotoma-reader-language="1"></script>') {
      languageCount++;
      trustedScriptOpens.add(open);
    } else if (/^<script defer src="\/assets\/reader-analytics\.js" data-neotoma-reader-analytics="1" data-website-id="[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}" data-umami-url="https:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?(?:\/[a-z0-9_-]+)*" data-page-path="\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\/"><\/script>$/i.test(exact)) {
      analyticsCount++;
      trustedScriptOpens.add(open);
    } else problems.add("contains a <script> element");
  }
  if (languageCount > 1 || analyticsCount > 1) problems.add("contains a <script> element");
  if (scriptTags.length) {
    const document = new JSDOM(html).window.document;
    if ([...document.querySelectorAll("script")].some((script) => script.parentElement !== document.head))
      problems.add("fixed script must be in the document head");
  }
  let styles = 0;
  for (const t of tags) {
    if (t.closing) continue;
    if (!DOCS_VIEWER_BODY_TAGS.has(t.name) && !READER_CHROME_TAGS.has(t.name))
      problems.add("contains an unsupported element");
    if (t.name === "script" && !t.closing && !trustedScriptOpens.has(t))
      problems.add("contains a <script> element");
    else if (FORBIDDEN_ELEMENTS.has(t.name)) {
      problems.add("contains an embedded frame, form or object element");
    }
    if (t.name === "link" && t.attrs.some((a) => a.name === "rel" && /import/i.test(a.value))) {
      problems.add("contains an embedded frame, form or object element");
    }
    if (t.name === "style") styles++;
    for (const a of t.attrs) {
      if (!READER_ATTRIBUTES.has(a.name)) problems.add("contains an unsupported attribute");
      if (/^on[a-z]+$/.test(a.name)) problems.add("contains an event attribute (on*=)");
      if (a.name === "style") problems.add("contains a style attribute");
      if (a.name === "href" || a.name === "src") {
        checkUrlAttribute(a.value);
      }
    }
  }
  // HTML character references have different rules inside attributes than plain text. Let the
  // standards parser decode numeric, named and missing-semicolon forms before URL validation.
  const parsed = JSDOM.fragment(html);
  for (const element of parsed.querySelectorAll("*")) {
    if (element.namespaceURI !== HTML_NAMESPACE)
      problems.add("contains an unsupported foreign namespace");
    if (!DOCS_VIEWER_BODY_TAGS.has(element.localName) && !READER_CHROME_TAGS.has(element.localName))
      problems.add("contains an unsupported element");
    for (const attr of element.attributes) {
      if (attr.namespaceURI || !READER_ATTRIBUTES.has(attr.name))
        problems.add("contains an unsupported attribute");
      if (attr.name === "href" || attr.name === "src") checkUrlAttribute(attr.value);
    }
    if (element.localName === "link" && !READER_LINK_RELS.has(element.getAttribute("rel") ?? ""))
      problems.add("contains an unsupported link relation");
  }
  if (styles !== 1) problems.add("must carry exactly one <style> (the chrome)");
  return [...problems];
}

export function retiredRouteLinks(
  html: string,
  index: DocsViewerIndex,
  sourceContext: "published" | "local-preview" = "published",
  allowedSourceSlugs: readonly string[] = index.entries.map((entry) => entry.slug)
): string[] {
  const out: string[] = [];
  const previewSources =
    sourceContext === "local-preview"
      ? new Set(allowedSourceSlugs.map((slug) => `/source/${slug}.md`))
      : null;
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
      // Preview builds emit exactly these manifest sources as raw Markdown assets, not HTML routes.
      // Require a root-local href: an absolute neotoma.io URL still points at the published site.
      if (previewSources?.has(route) && href.startsWith("/") && !href.startsWith("//")) continue;
      const r = route.replace(/\/+$/, "") || "/";
      if (/\.(svg|ico|png|xml|txt)$/.test(r)) continue;
      if (isRetiredRoute(r, index) && isRetiredRoute(r)) out.push(href);
    }
  }
  return out;
}

/** Any retired /docs location is forbidden in the sitemap. */
export function unlistedSitemapDocs(sitemap: string): string[] {
  const out: string[] = [];
  for (const m of sitemap.matchAll(/<loc>([^<]{0,2048})<\/loc>/g)) {
    const loc = m[1].trim();
    if (/^https:\/\/(www\.)?neotoma\.io\/docs(\/|$)/.test(loc)) out.push(loc);
  }
  return out;
}

export function validateDocsViewerExport(
  siteDir: string,
  opts: {
    index?: DocsViewerIndex;
    manifest?: readonly DocsViewerEntry[];
    sourceContext?: "published" | "local-preview";
    repoRoot?: string;
    allowedSourceSlugs?: readonly string[];
    skipGlobalChecks?: boolean;
  } = {}
): { problems: string[]; checked: number } {
  const index = opts.index ?? DOCS_VIEWER_INDEX;
  const manifest = opts.manifest ?? DOCS_VIEWER_MANIFEST;
  const isPreview = opts.sourceContext === "local-preview";
  const problems: string[] = [];
  const allowedSourceSlugs = opts.allowedSourceSlugs ?? index.entries.map((entry) => entry.slug);
  const allowedSources = new Set(isPreview ? allowedSourceSlugs.map((slug) => `${slug}.md`) : []);
  const sourceDir = path.join(siteDir, "source");
  if (fs.existsSync(sourceDir)) {
    const visit = (dir: string, relative = "") => {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const name = relative ? `${relative}/${item.name}` : item.name;
        if (item.isDirectory()) visit(path.join(dir, item.name), name);
        else if (!item.isFile() || !allowedSources.has(name))
          problems.push(`site_pages/source/${name} is not an allowed Markdown source`);
      }
    };
    visit(sourceDir);
  }
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
    const locale = entry.slug.startsWith("es/") ? "es" : "en";
    if (!html.includes(`<html lang="${locale}">`)) problems.push(`${where} has the wrong document language`);
    if (html.includes('http-equiv="refresh"') || !html.includes(VIEWER_MARKER)) {
      problems.push(`${where} is not a docs viewer page (stub or app page)`);
      continue;
    }
    for (const needle of [
      `<link rel="canonical" href="${canonicalUrl(entry)}">`,
      `<meta name="docs-viewer-source" content="${entry.source}">`,
      ...(entry.originalSource ? [`<meta name="docs-viewer-original-source" content="${entry.originalSource}">`] : []),
      `<link rel="alternate" hreflang="en" href="https://neotoma.io/${entry.slug.replace(/^es\//, "")}/">`,
      `<link rel="alternate" hreflang="es" href="https://neotoma.io/es/${entry.slug.replace(/^es\//, "")}/">`,
      isPreview
        ? `<link rel="alternate" type="text/markdown" href="/source/${entry.slug}.md"`
        : `<link rel="alternate" type="text/markdown" href="https://raw.githubusercontent.com/markmhendrickson/neotoma/`,
      `<h1>`,
    ]) {
      if (!html.includes(needle)) problems.push(`${where} lacks ${needle}`);
    }
    const expectedRobots =
      isPreview || entry.robots === "noindex" ? "noindex,follow" : "index,follow";
    if (!html.includes(`<meta name="robots" content="${expectedRobots}">`))
      problems.push(`${where} lacks robots ${expectedRobots}`);
    const expectedAnalyticsTag = isPreview ? "" : readerAnalyticsTag(entry);
    const languageTag = '<script defer src="/assets/reader-language.js" data-neotoma-reader-language="1"></script>';
    if (!html.includes(languageTag)) problems.push(`${where} lacks the fixed language-choice asset`);
    if (!fs.existsSync(path.join(siteDir, "assets/reader-language.js")))
      problems.push(`${where} language-choice asset is missing`);
    if (expectedAnalyticsTag && !html.includes(expectedAnalyticsTag))
      problems.push(`${where} lacks configured reader analytics bootstrap`);
    if (!expectedAnalyticsTag && /data-neotoma-reader-analytics=/i.test(html))
      problems.push(`${where} includes analytics bootstrap without configuration`);
    if (expectedAnalyticsTag && !fs.existsSync(path.join(siteDir, "assets/reader-analytics.js")))
      problems.push(`${where} reader analytics asset is missing`);
    if (!/<meta name="docs-viewer-commit" content="(?:[0-9a-f]{7,40}|main)">/.test(html)) {
      problems.push(`${where} does not name its build commit`);
    }
    if (isPreview) {
      if (html.includes("View and edit on GitHub") || html.includes("raw.githubusercontent.com"))
        problems.push(`${where} offers an unpublished GitHub source action`);
      const local = path.join(siteDir, "source", `${entry.slug}.md`);
      const source = opts.repoRoot ? containedRepoFile(opts.repoRoot, entry.source) : null;
      if (
        !source ||
        !("real" in source) ||
        !fs.existsSync(local) ||
        !fs.readFileSync(local).equals(fs.readFileSync(source.real))
      )
        problems.push(`${where} lacks a matching public Markdown source`);
      if (entry.originalSource) {
        const original = opts.repoRoot ? containedRepoFile(opts.repoRoot, entry.originalSource) : null;
        const originalSlug = entry.slug.replace(/^es\//, "");
        const originalCopy = path.join(siteDir, "source", `${originalSlug}.md`);
        if (!original || !("real" in original) || !fs.existsSync(originalCopy) ||
            !fs.readFileSync(originalCopy).equals(fs.readFileSync(original.real)))
          problems.push(`${where} lacks a matching original English Markdown source`);
      }
    }
    for (const p of unsafeMarkup(html)) problems.push(`${where} ${p}`);
    const visible = scanHtml(html);
    for (const f of findClaimProblems(visible.text)) {
      if (
        (f.id === "retired-noun" || f.id === "omitted-claim") &&
        visible.claimExempt.some(([start, end]) => f.index >= start && f.index < end)
      )
        continue;
      problems.push(`${where} text: ${f.label} ("${f.match}")`);
    }
    for (const href of retiredRouteLinks(html, index, opts.sourceContext, allowedSourceSlugs))
      problems.push(`${where} links a retired neotoma.io route: ${href}`);
  }

  if (!opts.skipGlobalChecks) {
  // No pending, unlisted or old /docs document is published.
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
  for (const d of fs.readdirSync(siteDir, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name === "_media") continue;
    const file = path.join(siteDir, d.name, "index.html");
    if (
      !included.has(d.name) &&
      fs.existsSync(file) &&
      fs.readFileSync(file, "utf-8").includes(VIEWER_MARKER)
    ) {
      problems.push(`site_pages/${d.name}/index.html is a viewer page for an unlisted document`);
    }
  }
  const legacyDir = path.join(siteDir, "docs");
  if (fs.existsSync(legacyDir)) {
    for (const d of fs.readdirSync(legacyDir, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name === "_media") continue;
      const file = path.join(legacyDir, d.name, "index.html");
      if (fs.existsSync(file) && fs.readFileSync(file, "utf-8").includes(VIEWER_MARKER)) {
        problems.push(
          `site_pages/docs/${d.name}/index.html still publishes the retired viewer page`
        );
      }
    }
    const indexFile = path.join(legacyDir, "index.html");
    if (fs.existsSync(indexFile) && fs.readFileSync(indexFile, "utf-8").includes(VIEWER_MARKER)) {
      problems.push("site_pages/docs/index.html still publishes the retired index");
    }
  }

  for (const route of ["/docs", ...docsViewerAliasRoutes(index.entries)]) {
    const stub = path.join(siteDir, route.replace(/^\//, ""), "index.html");
    const expected = resolveDestination(route, index).url;
    if (!fs.existsSync(stub)) {
      problems.push(`site_pages${route}/index.html is missing the legacy redirect`);
    } else if (!fs.readFileSync(stub, "utf-8").includes(`url=${expected}"`)) {
      problems.push(`site_pages${route}/index.html does not redirect to ${expected}`);
    }
  }

  // Use the shared route resolver: current connection guides take precedence over
  // the retired source mapping, while ordinary documents resolve to their viewer page.
  for (const [route, mapped] of Object.entries(RETIRED_DESTINATIONS)) {
    if (!mapped || !isRetiredRoute(route, index)) continue;
    const entry = index.bySource.get(mapped);
    if (!entry) continue;
    const expected = resolveDestination(route, index).url;
    const stub = path.join(siteDir, route.replace(/^\//, ""), "index.html");
    if (fs.existsSync(stub) && !fs.readFileSync(stub, "utf-8").includes(`url=${expected}"`)) {
      problems.push(
        `site_pages${route}/index.html does not redirect to the viewer page ${expected}`
      );
    }
  }

  // Published sitemap lists every viewer page; preview sitemap exposes no URLs.
  const sitemapPath = path.join(siteDir, "sitemap.xml");
  if (fs.existsSync(sitemapPath)) {
    const sitemap = fs.readFileSync(sitemapPath, "utf-8");
    if (isPreview) {
      if (/<loc>/.test(sitemap)) problems.push("preview sitemap.xml includes URLs");
    } else {
      for (const entry of index.entries.filter((e) => e.robots !== "noindex")) {
        if (!sitemap.includes(`<loc>${canonicalUrl(entry)}</loc>`)) {
          problems.push(`sitemap.xml does not list the docs viewer page ${canonicalUrl(entry)}`);
        }
      }
    }
    for (const loc of unlistedSitemapDocs(sitemap)) {
      problems.push(`sitemap.xml lists ${loc}, which is not an included docs viewer page`);
    }
  }
  }
  return { problems, checked: index.entries.length };
}
