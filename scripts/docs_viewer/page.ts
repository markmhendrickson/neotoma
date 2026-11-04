/**
 * Page chrome for neotoma.io docs viewer pages: complete static HTML with inline CSS.
 * An optional fixed first-party analytics asset loads only when existing Umami config is present.
 *
 * The chrome (masthead, sidebar, header labels, pager, footer) follows the live one-pager's editorial
 * language: warm paper, navy ink, rust accent, Instrument typography, and restrained rules. The document
 * body remains a clean, useful reference document. Its dark preference follows the current homepage's
 * charcoal variant, not the retired green drafting theme. Every value interpolated here is escaped; the
 * body HTML comes from the allow-list serializer.
 */
import { SOCIAL_CARD, socialCardForLocale } from "../../frontend/src/site/social_card";
import type { DocsViewerEntry } from "../../frontend/src/site/docs_viewer_manifest";
import {
  DOCS_VIEWER_VISUALS,
  viewerCollection,
  viewerHref,
} from "../../frontend/src/site/docs_viewer_manifest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteFooter, SiteHeader } from "../../frontend/src/components/onepager/SiteChrome";
import type { RenderedDoc } from "./render";
import { GITHUB_REPO_URL, githubSlug } from "./render";
import { escapeAttr, escapeText } from "./serialize";
import {
  canonicalUmamiBaseUrl,
  validUmamiWebsiteId,
} from "../../frontend/src/utils/site_analytics_contract";

export const SITE_ORIGIN = "https://neotoma.io";

export interface PageInput {
  entry: DocsViewerEntry;
  doc: RenderedDoc;
  /** Entries shown in the sidebar, in order. */
  nav: readonly DocsViewerEntry[];
  commit: string;
  /** Set in preview mode for a document that is not published. */
  previewNotice?: string;
  sourceContext?: "published" | "local-preview";
  /** Only supplied for manifest-approved source copied into this local export. */
  localSource?: string;
}

const CSS = `
@font-face{font-family:"Instrument Sans Docs";src:url("/brand/october/instrument-sans-regular.ttf") format("truetype");font-weight:400;font-display:swap}
@font-face{font-family:"Instrument Sans Docs";src:url("/brand/october/instrument-sans-semibold.ttf") format("truetype");font-weight:600;font-display:swap}
@font-face{font-family:"Instrument Serif Docs";src:url("/brand/october/instrument-serif.ttf") format("truetype");font-weight:400;font-display:swap}
:root{color-scheme:light;
--paper:#faf8f3;--sheet:#faf8f3;--ink:#172b39;--rust:#a14624;--muted:#52616a;--line:#d6d0c4;--band:#f1ece2;
--doc:#faf8f3;--text:#172b39;--link:#a14624;--code-bg:#f1ece2;--code-line:#d6d0c4;
--t-comment:#52616a;--t-keyword:#a14624;--t-string:#3f6259;--t-number:#79520c;--t-function:#22587a;--t-var:#6a3d99;--t-punct:#52616a;
--serif:"Instrument Serif Docs",Georgia,serif;--mono:ui-monospace,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;--sans:"Instrument Sans Docs",system-ui,sans-serif}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;
--paper:#1d272c;--sheet:#1d272c;--ink:#eeeae0;--rust:#e5a17c;--muted:#b7c4ca;--line:#4b5050;--band:#303333;
--doc:#1d272c;--text:#eeeae0;--link:#e5a17c;--code-bg:#303333;--code-line:#4b5050;
--t-comment:#b7c4ca;--t-keyword:#e5a17c;--t-string:#abd1b9;--t-number:#e8c07d;--t-function:#8fc4e2;--t-var:#cdb0f2;--t-punct:#e0ddd5}
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 var(--sans)}
a{color:inherit;text-decoration-thickness:1px;text-underline-offset:3px}
a:focus-visible,pre:focus-visible,.dv-table:focus-visible,summary:focus-visible{outline:3px solid var(--rust);outline-offset:2px}
.dv-skip{position:absolute;left:12px;top:-60px;background:var(--paper);border:1px solid var(--ink);padding:8px 12px;z-index:10}
.dv-skip:focus{top:12px}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.dv-mono{font:600 12px/1.4 var(--sans);letter-spacing:.09em;text-transform:uppercase}
.dv-layout{max-width:1400px;margin:0 auto;padding:clamp(28px,5vw,72px) clamp(18px,5vw,80px) 64px}
.dv-sheet{position:relative;min-width:0;background:var(--doc)}
.dv-head{padding:0 0 30px;border-bottom:1px solid var(--line)}
.dv-head h1{font:400 clamp(2.8rem,5vw,4.9rem)/1.04 var(--serif);letter-spacing:-.03em;margin:0 0 16px}
.dv-summary{font:400 clamp(1.1rem,1.55vw,1.35rem)/1.48 var(--sans);margin:0 0 16px;max-width:48rem}
.dv-applies{margin:0 0 12px;font-size:.9375rem}
.dv-applies .dv-mono{color:var(--rust);margin-right:8px}
.dv-meta{margin:0;font:.8125rem/1.6 var(--sans);color:var(--muted)}
.dv-meta a{display:inline-block;min-height:32px;line-height:32px;color:var(--ink);font-weight:600}
.dv-meta code{font:inherit}
.dv-preview{margin:0 0 18px;padding:10px 12px;border-left:3px solid var(--rust);background:var(--band);font-size:.9375rem}
.dv-toc{margin:16px 0 0}
.dv-toc summary{cursor:pointer;color:var(--muted)}
.dv-toc ol{margin:8px 0 0;padding-left:22px;columns:2 16rem;font-size:.9375rem}
.dv-toc ol ol{columns:auto;margin:2px 0 4px;padding-left:18px;font-size:.875rem}
.dv-toc li{margin:2px 0;break-inside:avoid}
.dv-toc a{display:inline-block;min-height:32px;line-height:32px}
.dv-note{margin:2rem 0 0;padding:10px 12px;border-left:3px solid var(--rust);background:var(--band);font-size:.9375rem;color:var(--muted)}
.dv-body{padding:36px 0 42px;color:var(--text);font:17px/1.65 var(--sans)}
.dv-body>*{max-width:72ch}
.dv-body>.dv-table,.dv-body>.dv-code{max-width:100%}
.dv-body p,.dv-body li{overflow-wrap:anywhere}
.dv-body td,.dv-body th{overflow-wrap:break-word}
.dv-table code{white-space:nowrap}
.dv-body a{color:var(--link);text-decoration-thickness:1px}
.dv-body a:hover{color:var(--ink);text-decoration-color:var(--rust);text-decoration-thickness:2px}
.dv-body h2,.dv-body h3,.dv-body h4,.dv-body h5,.dv-body h6{max-width:none;font-family:var(--serif);font-weight:400;color:var(--text);line-height:1.12;scroll-margin-top:24px}
.dv-body h2{font-size:clamp(2rem,3.2vw,3rem);margin:3.2rem 0 1rem;padding-top:1.6rem;border-top:1px solid var(--line)}
.dv-body h3{font-size:1.65rem;margin:2.2rem 0 .75rem}
.dv-body h4,.dv-body h5,.dv-body h6{font:600 1rem/1.35 var(--sans);margin:1.7rem 0 .5rem}
.dv-anchor{margin-left:.4em;color:var(--muted)!important;text-decoration:none;font-weight:400}
.dv-anchor:hover,.dv-anchor:focus-visible{color:var(--link)!important}
.dv-body code{font:.88em/1.5 var(--mono);background:var(--code-bg);border:1px solid var(--code-line);border-radius:3px;padding:.05em .3em}
.dv-code{position:relative;margin:1.2rem 0}
.dv-code-lang{position:absolute;right:10px;top:8px;font:600 11px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.dv-body pre{margin:0;overflow:auto;background:var(--code-bg);border:1px solid var(--code-line);border-radius:4px;padding:30px 16px 16px}
.dv-body pre code{background:none;border:0;padding:0;font-size:14px;line-height:1.55;white-space:pre}
.dv-body blockquote{margin:1.5rem 0;padding:.2rem 1rem;border-left:3px solid var(--rust);color:var(--text)}
.dv-body hr{border:0;border-top:1px solid var(--line);margin:2rem 0}
.dv-body img{max-width:100%;height:auto}
.dv-table{overflow-x:auto;margin:1.2rem 0;border:1px solid var(--code-line)}
.dv-table table{border-collapse:collapse;font-size:.9375rem;line-height:1.5;min-width:100%}
.dv-table th,.dv-table td{border:1px solid var(--code-line);padding:8px 10px;vertical-align:top;text-align:left;min-width:7rem}
.dv-table th{background:var(--code-bg);font-weight:600}
.dv-align-center{text-align:center!important}.dv-align-right{text-align:right!important}
.token.comment,.token.prolog,.token.doctype,.token.cdata{color:var(--t-comment);font-style:italic}
.token.keyword,.token.boolean,.token.important,.token.atrule,.token.builtin,.token.tag{color:var(--t-keyword)}
.token.string,.token.char,.token.attr-value,.token.inserted,.token.url{color:var(--t-string)}
.token.number,.token.constant,.token.symbol{color:var(--t-number)}
.token.function,.token.class-name,.token.property,.token.attr-name{color:var(--t-function)}
.token.variable,.token.parameter,.token.regex{color:var(--t-var)}
.token.punctuation,.token.operator{color:var(--t-punct)}
.token.deleted{color:var(--t-keyword)}
.dv-pager{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:28px 0 0;border-top:1px solid var(--line);background:var(--sheet)}
.dv-pager a{display:block;padding:8px 0;text-decoration:none}
.dv-pager a:hover{text-decoration:underline;text-decoration-color:var(--rust)}
.dv-pager .dv-mono{display:block;color:var(--rust);margin-bottom:2px}
.dv-pager .next{text-align:right;grid-column:2}
.dv-breadcrumbs{margin:0 0 24px;color:var(--muted);font-size:.875rem}
.dv-breadcrumbs ol{display:flex;flex-wrap:wrap;gap:.5rem;list-style:none;margin:0;padding:0}
.dv-breadcrumbs li+li::before{content:"/";margin-right:.5rem;color:var(--line)}
.dv-breadcrumbs a{color:var(--ink)}
.dv-topic-links{margin-top:1.5rem;padding:32px 0;border-top:1px solid var(--line)}
.plan.dv-shell .dv-topic-links h2{font:400 2rem/1.1 var(--serif);margin:0 0 16px;max-width:none}
.dv-topic-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr));gap:12px}
@media (min-width:600px){
.dv-topic-grid:has(>a:nth-child(4):last-child){grid-template-columns:repeat(2,minmax(0,1fr))}
}
.dv-topic-grid a{display:block;overflow:hidden;min-height:76px;padding:0 0 16px;border:1px solid var(--line);text-decoration:none}
.dv-topic-grid a:hover{border-color:var(--rust);color:var(--rust)}
.dv-topic-grid img{display:block;width:100%;height:auto;aspect-ratio:3/2;object-fit:cover;margin-bottom:16px}
.dv-topic-grid strong{display:block;font-weight:600;padding:0 16px}
.dv-topic-grid span{display:block;padding:0 16px;margin-top:8px;color:var(--muted);font-size:.875rem}
.dv-visual{margin:24px 0 0;max-width:48rem}
.dv-visual img{display:block;max-width:100%;height:auto}
.dv-visual figcaption{color:var(--muted);font-size:.875rem;margin-top:8px}
@media (max-width:900px){
.dv-layout{padding-top:28px}
.dv-head{padding:0 0 24px}
.dv-body{padding:28px 0 32px;font-size:16px}
.dv-pager{padding:20px 0 0;grid-template-columns:1fr}
.dv-pager .next{grid-column:1}
}
`;

const ONEPAGER_CSS = readFileSync(
  new URL("../../frontend/src/components/onepager/onepager.css", import.meta.url),
  "utf-8"
);
const DOC_SHELL_CSS = `
.dv-shell .dv-hero{margin-bottom:0;padding-bottom:0;border-bottom:0}
.dv-shell .dv-hero .plan-masthead{margin-bottom:0}
.dv-shell .dv-layout{display:block;max-width:1400px;padding-top:clamp(2.5rem,4vw,4.5rem)}
.dv-shell .dv-sheet{max-width:80rem}
.dv-shell .dv-head h1{font:400 clamp(2.8rem,5vw,4.9rem)/1.04 var(--serif);letter-spacing:-.03em}
.dv-shell .dv-body{font:17px/1.65 var(--sans)}
.dv-shell .dv-body h2,.dv-shell .dv-body h3{font-family:var(--serif);font-weight:400}
.dv-shell .dv-source-foot{max-width:1400px;margin:auto;padding:0 clamp(18px,5vw,80px) 2rem;color:var(--muted);font-size:.8125rem}
.dv-shell .dv-source-foot a{color:var(--ink)}
.plan.dv-shell .dv-head h1{max-width:none}
.plan.dv-shell .dv-body h2,.plan.dv-shell .dv-body h3,.plan.dv-shell .dv-body h4,.plan.dv-shell .dv-body h5,.plan.dv-shell .dv-body h6{max-width:none}
.plan.dv-shell .dv-body h2{margin:3.2rem 0 1rem;padding-top:1.6rem}
.plan.dv-shell .dv-body h2:first-child{margin-top:0}
.plan.dv-shell .dv-body p{margin:0 0 1.2rem}
@media (prefers-color-scheme:dark){
.dv-shell{--paper:#1d272c;--sheet:#1d272c;--ink:#eeeae0;--rust:#e5a17c;--muted:#b7c4ca;--line:#4b5050;--band:#303333}
.dv-shell .plan-logo-light{display:none!important}
.dv-shell .plan-logo-dark{display:block!important}
}
`;

export function githubBlobUrl(commit: string, source: string): string {
  return `${GITHUB_REPO_URL}/blob/${commit}/${source.split("/").map(encodeURIComponent).join("/")}`;
}

export function canonicalUrl(entry: DocsViewerEntry): string {
  return `${SITE_ORIGIN}${viewerHref(entry.slug)}`;
}

/** Optional first-party reader bootstrap; content and navigation work with scripts disabled. */
export function readerAnalyticsTag(entry: DocsViewerEntry): string {
  // The finite Spanish translation does not expand analytics collection to new routes.
  if (entry.slug.startsWith("es/")) return "";
  const base = process.env.VITE_UMAMI_URL?.trim();
  const website = process.env.VITE_UMAMI_WEBSITE_ID?.trim();
  if (!base || !website) return "";
  const canonicalBase = canonicalUmamiBaseUrl(base);
  if (!canonicalBase) throw new Error("Reader analytics requires a validated HTTPS Umami base URL");
  if (!validUmamiWebsiteId(website)) throw new Error("Reader analytics website ID is invalid");
  const route = viewerHref(entry.slug);
  if (!/^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\/$/.test(route))
    throw new Error("Reader analytics route is not a public slug");
  return `<script defer src="/assets/reader-analytics.js" data-neotoma-reader-analytics="1" data-website-id="${escapeAttr(website)}" data-umami-url="${escapeAttr(canonicalBase)}" data-page-path="${escapeAttr(route)}"></script>`;
}

/** Meta description: the summary, cut at a word boundary to about 155 characters. */
export const META_DESCRIPTION_MAX = 155;
export function metaDescription(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= META_DESCRIPTION_MAX) return t;
  const cut = t.slice(0, META_DESCRIPTION_MAX - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 80 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

/** Retained for compatibility with source consumers; visitor pages no longer render a TOC. */
export const CONTENTS_H3_WORDS = 1500;

function topicCards(ids: readonly string[], nav: readonly DocsViewerEntry[]): string {
  const spanish = nav.some((entry) => entry.slug.startsWith("es/"));
  const entries = new Map(nav.map((e) => [e.id, e]));
  const cards = ids.flatMap((id) => {
    const item = entries.get(id);
    if (item) {
      const visual = item.visual ?? DOCS_VIEWER_VISUALS[item.visualId ?? ""];
      return [
        `<a href="${escapeAttr(viewerHref(item.slug))}">${visual ? `<img src="${escapeAttr(visual.src)}" alt="" loading="lazy" width="900" height="600">` : ""}<strong>${escapeText(item.title)}</strong><span>${escapeText(item.summary ?? (spanish ? "Lee este tema" : "Read this topic"))}</span></a>`,
      ];
    }
    if (id === "install")
      return [
        `<a href="${spanish ? "/es/install/" : "/install/"}"><img src="${escapeAttr(DOCS_VIEWER_VISUALS.install.src)}" alt="" loading="lazy" width="900" height="600"><strong>${spanish ? "Instalar" : "Install"}</strong><span>${spanish ? "Elige una vía de configuración compatible" : "Choose a supported setup path"}</span></a>`,
      ];
    return [];
  });
  return cards.join("");
}

export function renderPage(input: PageInput): string {
  const { entry, doc, nav, commit } = input;
  const locale = entry.slug.startsWith("es/") ? "es" : "en";
  const words = locale === "es" ? {
    skip: "Ir al documento", home: "Inicio", install: "Instalar", breadcrumb: "Ruta de navegación",
    related: "Temas relacionados", previous: "Anterior", next: "Siguiente",
    pager: "Documento anterior y siguiente", omitted: "El archivo termina con una sección para agentes de programación que no se muestra aquí",
    markdown: "fuente Markdown", github: "en GitHub",
  } : {
    skip: "Skip to the document", home: "Home", install: "Install", breadcrumb: "Breadcrumb",
    related: "Related topics", previous: "Previous", next: "Next",
    pager: "Previous and next document", omitted: "The file ends with a section for coding agents that is left out here",
    markdown: "Markdown source", github: "on GitHub",
  };
  const short = commit.slice(0, 7);
  const siblings = nav.filter(
    (e) => e.collection === entry.collection && e.parentId === entry.parentId
  );
  const siblingIndex = siblings.findIndex((e) => e.slug === entry.slug);
  const prev = siblingIndex > 0 ? siblings[siblingIndex - 1] : null;
  const next =
    siblingIndex >= 0 && siblingIndex < siblings.length - 1 ? siblings[siblingIndex + 1] : null;
  const collection = viewerCollection(entry.collection);
  const members = nav.filter((e) => e.parentId === entry.id).sort((a, b) => a.order - b.order);
  const memberIds = new Set(members.map((member) => member.id));
  const relatedPeers = nav.filter(
    (candidate) =>
      candidate.status === "included" &&
      candidate.collection === entry.collection &&
      candidate.parentId === entry.parentId &&
      candidate.id !== entry.id &&
      !memberIds.has(candidate.id)
  );
  const relatedPool = relatedPeers.length
    ? relatedPeers
    : nav.filter(
        (candidate) =>
          candidate.status === "included" &&
          candidate.collection === entry.collection &&
          candidate.id !== entry.id &&
          !memberIds.has(candidate.id)
      );
  const fallbackRelated = [...relatedPool]
    .sort(
      (a, b) =>
        Math.abs(a.order - entry.order) - Math.abs(b.order - entry.order) ||
        a.order - b.order ||
        a.slug.localeCompare(b.slug)
    )
    .slice(0, 4)
    .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))
    .map((candidate) => candidate.id);
  const related = [...new Set(entry.relatedIds ?? fallbackRelated)].filter(
    (id) => id !== entry.id && !memberIds.has(id)
  );
  const relatedCards = topicCards(
    [...new Set([...members.map((member) => member.id), ...related])],
    nav
  );
  const ancestors: DocsViewerEntry[] = [];
  let parentId = entry.parentId;
  while (parentId && parentId !== "install") {
    const parent = nav.find((e) => e.id === parentId);
    if (!parent || ancestors.includes(parent)) break;
    ancestors.unshift(parent);
    parentId = parent.parentId;
  }
  const visual = entry.visual ?? (entry.visualId ? DOCS_VIEWER_VISUALS[entry.visualId] : undefined);
  const summary = doc.header.summary ?? "";
  const description = metaDescription(summary || `${entry.title}, from the Neotoma repository.`);
  const sourceContext = input.sourceContext ?? "published";
  const localSource = sourceContext === "local-preview" ? input.localSource : undefined;
  const sourceUrl =
    sourceContext === "published" ? githubBlobUrl(commit, entry.source) : localSource;
  const rawUrl =
    sourceContext === "published"
      ? `https://raw.githubusercontent.com/markmhendrickson/neotoma/${commit}/${entry.source}`
      : localSource;
  const originalSourceUrl = entry.originalSource
    ? sourceContext === "local-preview"
      ? `/source/${entry.slug.replace(/^es\//, "")}.md`
      : githubBlobUrl(commit, entry.originalSource)
    : undefined;
  const canonical = canonicalUrl(entry);
  const title = `${entry.title} | Neotoma`;
  const socialCard = socialCardForLocale(locale);
  const siteHeader = renderToStaticMarkup(
    createElement(SiteHeader, { currentHref: collection.href, pageLocale: locale })
  );
  const siteFooter = renderToStaticMarkup(createElement(SiteFooter, { routePath: viewerHref(entry.slug), pageLocale: locale }));
  const isPreview = sourceContext === "local-preview";
  const previewNotice = input.previewNotice;
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeText(title)}</title>
<meta name="description" content="${escapeAttr(description)}">
<meta name="robots" content="${isPreview || entry.robots === "noindex" ? "noindex,follow" : "index,follow"}">
<link rel="canonical" href="${escapeAttr(canonical)}">
<link rel="alternate" hreflang="en" href="${SITE_ORIGIN}${escapeAttr(viewerHref(entry.slug.replace(/^es\//, "")))}">
<link rel="alternate" hreflang="es" href="${SITE_ORIGIN}${escapeAttr(viewerHref(entry.slug.startsWith("es/") ? entry.slug : `es/${entry.slug}`))}">
${rawUrl ? `<link rel="alternate" type="text/markdown" href="${escapeAttr(rawUrl)}" title="Markdown source at ${escapeAttr(short)}">` : ""}
<meta property="og:type" content="article">
<meta property="og:site_name" content="Neotoma">
<meta property="og:title" content="${escapeAttr(title)}">
<meta property="og:description" content="${escapeAttr(description)}">
<meta property="og:url" content="${escapeAttr(canonical)}">
<meta property="og:locale" content="${locale === "es" ? "es_ES" : "en_US"}">
<meta property="og:image" content="${escapeAttr(socialCard.url)}">
<meta property="og:image:type" content="${SOCIAL_CARD.mime}">
<meta property="og:image:width" content="${SOCIAL_CARD.width}">
<meta property="og:image:height" content="${SOCIAL_CARD.height}">
<meta property="og:image:alt" content="${escapeAttr(socialCard.alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeAttr(title)}">
<meta name="twitter:description" content="${escapeAttr(description)}">
<meta name="twitter:image" content="${escapeAttr(socialCard.url)}">
<meta name="twitter:image:width" content="${SOCIAL_CARD.width}">
<meta name="twitter:image:height" content="${SOCIAL_CARD.height}">
<meta name="twitter:image:alt" content="${escapeAttr(socialCard.alt)}">
<meta name="docs-viewer-source" content="${escapeAttr(entry.source)}">
${entry.originalSource ? `<meta name="docs-viewer-original-source" content="${escapeAttr(entry.originalSource)}">` : ""}
<meta name="docs-viewer-commit" content="${escapeAttr(commit)}">
${doc.header.appliesTo ? `<meta name="docs-viewer-applies-to" content="${escapeAttr(doc.header.appliesTo)}">` : ""}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="any">
<style>${ONEPAGER_CSS}\n${CSS}\n${DOC_SHELL_CSS}</style>
${isPreview ? "" : readerAnalyticsTag(entry)}
<script defer src="/assets/reader-language.js" data-neotoma-reader-language="1"></script>
</head>
<body>
<a class="dv-skip" href="#dv-main">${words.skip}</a>
<div class="plan dv-shell">
<div class="plan-sheet plan-hero dv-hero">${siteHeader}</div>
<div class="dv-layout">
<main id="dv-main" tabindex="-1">
<nav class="dv-breadcrumbs" aria-label="${words.breadcrumb}"><ol><li><a href="${locale === "es" ? "/es/" : "/en/"}">${words.home}</a></li>${parentId === "install" ? `<li><a href="${locale === "es" ? "/es/install/" : "/install/"}">${words.install}</a></li>` : ""}${ancestors.map((parent) => `<li><a href="${escapeAttr(viewerHref(parent.slug))}">${escapeText(parent.title)}</a></li>`).join("")}<li aria-current="page">${escapeText(entry.title)}</li></ol></nav>
<article class="dv-sheet">
<header class="dv-head">
${previewNotice ? `<p class="dv-preview">${escapeText(previewNotice)}</p>` : ""}
<h1>${escapeText(entry.title)}</h1>
${summary ? `<p class="dv-summary">${escapeText(summary)}</p>` : ""}
<p class="dv-meta">${locale === "es" ? "Fuente de esta traducción" : "Source"}: <code>${escapeText(entry.source)}</code>${sourceUrl ? ` · <a href="${escapeAttr(sourceUrl)}">${locale === "es" ? "Leer Markdown" : "Read Markdown"}</a>` : ""}${entry.originalSource ? ` · ${locale === "es" ? "Original en inglés" : "English original"}: <code>${escapeText(entry.originalSource)}</code>${originalSourceUrl ? ` · <a href="${escapeAttr(originalSourceUrl)}">${locale === "es" ? "Leer original" : "Read original"}</a>` : ""}` : ""} · <code>${escapeText(short)}</code></p>
${visual ? `<figure class="dv-visual"><img src="${escapeAttr(visual.src)}" alt="${escapeAttr(visual.alt)}"><figcaption>${escapeText(visual.caption)}</figcaption></figure>` : ""}
</header>
<div class="dv-body">
${doc.html}
${
  doc.agentInstructionsHeading
    ? `<p class="dv-note">${words.omitted}: “${escapeText(doc.agentInstructionsHeading)}”${sourceUrl ? `; <a href="${escapeAttr(isPreview ? sourceUrl : `${sourceUrl}#${githubSlug(doc.agentInstructionsHeading)}`)}">${isPreview ? words.markdown : words.github}</a>` : ""}.</p>`
    : ""
}
</div>
${relatedCards ? `<section class="dv-topic-links" aria-labelledby="dv-related-title"><h2 id="dv-related-title">${words.related}</h2><div class="dv-topic-grid">${relatedCards}</div></section>` : ""}
${
  prev || next
    ? `<nav class="dv-pager" aria-label="${words.pager}">${
        prev
          ? `<a class="prev" href="${escapeAttr(viewerHref(prev.slug))}" rel="prev"><span class="dv-mono">${words.previous}</span>${escapeText(prev.title)}</a>`
          : ""
      }${
        next
          ? `<a class="next" href="${escapeAttr(viewerHref(next.slug))}" rel="next"><span class="dv-mono">${words.next}</span>${escapeText(next.title)}</a>`
          : ""
      }</nav>`
    : ""
}
</article>
</main>
</div>
${siteFooter}
</div>
</body>
</html>
`;
}
