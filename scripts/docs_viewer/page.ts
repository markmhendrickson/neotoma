/**
 * Page chrome for neotoma.io docs viewer pages: a static HTML document with inline CSS and no script.
 *
 * The chrome (masthead, sidebar, header labels, pager, footer) uses the one-pager's drafting-sheet
 * language: paper ground, ink rules, rust accent, mono annotations. The document body reads as a clean
 * document. Light and dark follow `prefers-color-scheme`. Every value interpolated here is escaped;
 * the body HTML comes from the allow-list serializer.
 */
import type { DocsViewerEntry } from "../../frontend/src/site/docs_viewer_manifest";
import { DOCS_VIEWER_GROUPS, viewerHref } from "../../frontend/src/site/docs_viewer_manifest";
import type { RenderedDoc } from "./render";
import { GITHUB_REPO_URL, githubSlug } from "./render";
import { escapeAttr, escapeText } from "./serialize";

export const SITE_ORIGIN = "https://neotoma.io";

export interface PageInput {
  entry: DocsViewerEntry;
  doc: RenderedDoc;
  /** Entries shown in the sidebar, in order. */
  nav: readonly DocsViewerEntry[];
  commit: string;
  /** Set in preview mode for a document that is not published. */
  previewNotice?: string;
}

const CSS = `
:root{color-scheme:light dark;
--paper:#f2ecdf;--sheet:#fffbf2;--ink:#28372f;--rust:#a84d33;--muted:#4b5a4c;--line:#bbc2b1;--grid:rgba(40,55,47,.06);
--doc:#fffefb;--text:#1f2a24;--link:#8f3f28;--code-bg:#f4f1e8;--code-line:#d9d3c3;
--t-comment:#5b6a5f;--t-keyword:#8a3b25;--t-string:#2c6435;--t-number:#7a4800;--t-function:#22587a;--t-var:#6a3d99;--t-punct:#3b4a40;
--serif:Georgia,"Times New Roman",serif;--mono:ui-monospace,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;--sans:system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
@media (prefers-color-scheme:dark){:root{
--paper:#1a241e;--sheet:#212d26;--ink:#ece5d4;--rust:#e39477;--muted:#c3cbb8;--line:#3d4d42;--grid:rgba(236,229,212,.05);
--doc:#1d2721;--text:#ece5d4;--link:#f0a487;--code-bg:#151c18;--code-line:#34433a;
--t-comment:#a3b1a6;--t-keyword:#f0a487;--t-string:#a9d6a3;--t-number:#e8c07d;--t-function:#8fc4e2;--t-var:#cdb0f2;--t-punct:#cfd6c8}}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background-color:var(--paper);background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:24px 24px;color:var(--ink);font:16px/1.6 var(--sans)}
a{color:inherit;text-underline-offset:3px}
a:focus-visible,pre:focus-visible,.dv-table:focus-visible,summary:focus-visible{outline:3px solid var(--rust);outline-offset:2px}
.dv-skip{position:absolute;left:12px;top:-60px;background:var(--sheet);border:2px solid var(--ink);padding:8px 12px;z-index:10}
.dv-skip:focus{top:12px}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.dv-mono{font:600 12px/1.4 var(--mono);letter-spacing:.1em;text-transform:uppercase}
.dv-masthead{border-bottom:2px solid var(--ink);background:var(--sheet)}
.dv-masthead-inner{max-width:1240px;margin:0 auto;padding:12px 16px;display:flex;flex-wrap:wrap;gap:8px 20px;align-items:center;justify-content:space-between}
.dv-brand{display:inline-flex;gap:12px;align-items:center;min-height:44px;text-decoration:none}
.dv-brand img{display:block;width:132px;height:28px}
.dv-brand .dv-logo-dark{display:none}
@media (prefers-color-scheme:dark){.dv-brand .dv-logo-light{display:none}.dv-brand .dv-logo-dark{display:block}}
.dv-brand span{color:var(--rust)}
.dv-masthead nav{display:flex;gap:8px 16px;flex-wrap:wrap}
.dv-masthead nav a{display:inline-flex;align-items:center;min-height:24px;padding:6px 2px;font:600 13px/1.4 var(--mono);letter-spacing:.06em;text-transform:uppercase}
.dv-layout{max-width:1240px;margin:0 auto;padding:24px 16px 48px;display:grid;grid-template-columns:15rem minmax(0,1fr);gap:28px;align-items:start}
.dv-side{position:sticky;top:16px;max-height:calc(100vh - 32px);overflow:auto;border:2px solid var(--ink);background:var(--sheet);padding:16px}
.dv-side h2,.dv-mnav h2{margin:16px 0 6px;color:var(--rust)}
.dv-side h2:first-child{margin-top:0}
.dv-side ul,.dv-mnav ul{list-style:none;margin:0;padding:0}
.dv-side li a,.dv-mnav li a{display:block;min-height:24px;padding:5px 8px;margin:0 -8px;text-decoration:none;font-size:15px;line-height:1.35;border-left:3px solid transparent}
.dv-side li a:hover,.dv-mnav li a:hover{text-decoration:underline}
.dv-side li a[aria-current=page],.dv-mnav li a[aria-current=page]{border-left-color:var(--rust);font-weight:600}
.dv-mnav{display:none;border:2px solid var(--ink);background:var(--sheet);margin-bottom:16px}
.dv-mnav summary{cursor:pointer;padding:12px 14px;list-style-position:inside}
.dv-mnav div{padding:0 14px 12px}
.dv-sheet{position:relative;min-width:0;background:var(--doc);border:2px solid var(--ink);box-shadow:0 14px 30px -18px rgba(40,55,47,.35)}
.dv-head{padding:28px 32px 20px;border-bottom:1px solid var(--line);background:var(--sheet)}
.dv-kicker{margin:0 0 10px;color:var(--rust)}
.dv-head h1{font:400 clamp(2rem,4.5vw,3rem)/1.08 var(--serif);letter-spacing:-.025em;margin:0 0 12px}
.dv-summary{font:400 clamp(1.05rem,1.8vw,1.25rem)/1.5 var(--serif);margin:0 0 12px;max-width:46rem}
.dv-applies{margin:0 0 12px;font-size:15px}
.dv-applies .dv-mono{color:var(--rust);margin-right:8px}
.dv-meta{margin:0;font:13px/1.6 var(--mono);color:var(--muted)}
.dv-meta a{display:inline-block;min-height:24px;line-height:24px;color:var(--ink);font-weight:600}
.dv-meta code{font:inherit}
.dv-preview{margin:0 0 14px;padding:10px 12px;border:2px dashed var(--rust);font-size:15px}
.dv-toc{margin:16px 0 0}
.dv-toc summary{cursor:pointer;color:var(--muted)}
.dv-toc ol{margin:8px 0 0;padding-left:22px;columns:2 16rem;font-size:15px}
.dv-toc ol ol{columns:auto;margin:2px 0 4px;padding-left:18px;font-size:14px}
.dv-toc li{margin:2px 0;break-inside:avoid}
.dv-toc a{display:inline-block;min-height:24px;line-height:24px}
.dv-note{margin:2rem 0 0;padding:10px 12px;border-left:3px solid var(--line);font-size:15px;color:var(--muted)}
.dv-body{padding:8px 32px 32px;color:var(--text);font:17px/1.7 var(--sans)}
.dv-body>*{max-width:72ch}
.dv-body>.dv-table,.dv-body>.dv-code{max-width:100%}
.dv-body p,.dv-body li{overflow-wrap:anywhere}
.dv-body td,.dv-body th{overflow-wrap:break-word}
.dv-table code{white-space:nowrap}
.dv-body a{color:var(--link)}
.dv-body h2,.dv-body h3,.dv-body h4,.dv-body h5,.dv-body h6{font-family:var(--sans);color:var(--text);line-height:1.3;scroll-margin-top:16px}
.dv-body h2{font-size:1.5rem;font-weight:650;margin:2.2rem 0 .8rem;padding-top:1.2rem;border-top:1px solid var(--line)}
.dv-body h3{font-size:1.2rem;font-weight:650;margin:1.8rem 0 .6rem}
.dv-body h4,.dv-body h5,.dv-body h6{font-size:1.05rem;font-weight:650;margin:1.4rem 0 .5rem}
.dv-anchor{margin-left:.4em;color:var(--muted)!important;text-decoration:none;font-weight:400}
.dv-anchor:hover,.dv-anchor:focus-visible{color:var(--link)!important}
.dv-body code{font:.88em/1.5 var(--mono);background:var(--code-bg);border:1px solid var(--code-line);border-radius:3px;padding:.05em .3em}
.dv-code{position:relative;margin:1.2rem 0}
.dv-code-lang{position:absolute;right:10px;top:6px;font:600 12px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.dv-body pre{margin:0;overflow:auto;background:var(--code-bg);border:1px solid var(--code-line);border-radius:4px;padding:28px 16px 14px}
.dv-body pre code{background:none;border:0;padding:0;font-size:14px;line-height:1.55;white-space:pre}
.dv-body blockquote{margin:1.2rem 0;padding:.2rem 1rem;border-left:4px solid var(--line);color:var(--text)}
.dv-body hr{border:0;border-top:1px solid var(--line);margin:2rem 0}
.dv-body img{max-width:100%;height:auto}
.dv-table{overflow-x:auto;margin:1.2rem 0;border:1px solid var(--code-line)}
.dv-table table{border-collapse:collapse;font-size:15px;line-height:1.5;min-width:100%}
.dv-table th,.dv-table td{border:1px solid var(--code-line);padding:8px 10px;vertical-align:top;text-align:left;min-width:7rem}
.dv-table th{background:var(--code-bg);font-weight:650}
.dv-align-center{text-align:center!important}.dv-align-right{text-align:right!important}
.token.comment,.token.prolog,.token.doctype,.token.cdata{color:var(--t-comment);font-style:italic}
.token.keyword,.token.boolean,.token.important,.token.atrule,.token.builtin,.token.tag{color:var(--t-keyword)}
.token.string,.token.char,.token.attr-value,.token.inserted,.token.url{color:var(--t-string)}
.token.number,.token.constant,.token.symbol{color:var(--t-number)}
.token.function,.token.class-name,.token.property,.token.attr-name{color:var(--t-function)}
.token.variable,.token.parameter,.token.regex{color:var(--t-var)}
.token.punctuation,.token.operator{color:var(--t-punct)}
.token.deleted{color:var(--t-keyword)}
.dv-pager{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:20px 32px 28px;border-top:1px solid var(--line);background:var(--sheet)}
.dv-pager a{display:block;border:2px solid var(--ink);padding:10px 14px;text-decoration:none;background:var(--doc)}
.dv-pager a:hover{border-color:var(--rust)}
.dv-pager .dv-mono{display:block;color:var(--rust);margin-bottom:2px}
.dv-pager .next{text-align:right;grid-column:2}
.dv-foot{max-width:1240px;margin:0 auto;padding:0 16px 40px;font:12px/1.7 var(--mono);color:var(--muted)}
.dv-foot a{display:inline-block;min-height:24px;line-height:24px;color:var(--ink)}
@media (max-width:900px){
.dv-layout{grid-template-columns:minmax(0,1fr);padding-top:16px;gap:0}
.dv-side{display:none}
.dv-mnav{display:block}
.dv-head{padding:20px 18px 16px}
.dv-body{padding:4px 18px 24px;font-size:16px}
.dv-pager{padding:16px 18px 20px;grid-template-columns:1fr}
.dv-pager .next{grid-column:1}
}
`;

function navList(nav: readonly DocsViewerEntry[], current: DocsViewerEntry): string {
  let html = "";
  for (const group of DOCS_VIEWER_GROUPS) {
    const items = nav.filter((e) => e.group === group);
    if (!items.length) continue;
    html += `<h2 class="dv-mono">${escapeText(group)}</h2><ul>`;
    for (const e of items) {
      const cur = e.slug === current.slug ? ' aria-current="page"' : "";
      html += `<li><a href="${escapeAttr(viewerHref(e.slug))}"${cur}>${escapeText(e.title)}</a></li>`;
    }
    html += "</ul>";
  }
  return html;
}

export function githubBlobUrl(commit: string, source: string): string {
  return `${GITHUB_REPO_URL}/blob/${commit}/${source.split("/").map(encodeURIComponent).join("/")}`;
}

export function canonicalUrl(entry: DocsViewerEntry): string {
  return `${SITE_ORIGIN}${viewerHref(entry.slug)}`;
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

/** Long pages (over this many words) list their h3 headings under each h2 in the on-page contents. */
export const CONTENTS_H3_WORDS = 1500;

function onPageContents(doc: RenderedDoc): string {
  const h2s = doc.headings.filter((h) => h.depth === 2);
  if (h2s.length < 3) return "";
  const withH3 = doc.wordCount > CONTENTS_H3_WORDS;
  let items = "";
  for (let k = 0; k < doc.headings.length; k++) {
    const h = doc.headings[k];
    if (h.depth !== 2) continue;
    let sub = "";
    if (withH3) {
      for (let m = k + 1; m < doc.headings.length && doc.headings[m].depth > 2; m++) {
        const h3 = doc.headings[m];
        if (h3.depth === 3)
          sub += `<li><a href="#${escapeAttr(h3.id)}">${escapeText(h3.text)}</a></li>`;
      }
    }
    items += `<li><a href="#${escapeAttr(h.id)}">${escapeText(h.text)}</a>${sub ? `<ol>${sub}</ol>` : ""}</li>`;
  }
  return `<details class="dv-toc"><summary class="dv-mono">On this page (${h2s.length} sections)</summary><ol>${items}</ol></details>`;
}

export function renderPage(input: PageInput): string {
  const { entry, doc, nav, commit } = input;
  const short = commit.slice(0, 7);
  const i = nav.findIndex((e) => e.slug === entry.slug);
  const prev = i > 0 ? nav[i - 1] : null;
  const next = i >= 0 && i < nav.length - 1 ? nav[i + 1] : null;
  const summary = doc.header.summary ?? "";
  const description = metaDescription(summary || `${entry.title}, from the Neotoma repository.`);
  const sourceUrl = githubBlobUrl(commit, entry.source);
  const rawUrl = `https://raw.githubusercontent.com/markmhendrickson/neotoma/${commit}/${entry.source}`;
  const canonical = canonicalUrl(entry);
  const toc = onPageContents(doc);
  const navHtml = navList(nav, entry);
  const title = `${entry.title} | Neotoma docs`;
  const isPreview = process.env.SITE_PREVIEW === "1";
  const previewNotice = [isPreview ? "Pre-release review" : "", input.previewNotice]
    .filter(Boolean)
    .join(" · ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeText(title)}</title>
<meta name="description" content="${escapeAttr(description)}">
<meta name="robots" content="${isPreview ? "noindex,follow" : "index,follow"}">
<link rel="canonical" href="${escapeAttr(canonical)}">
<link rel="alternate" type="text/markdown" href="${escapeAttr(rawUrl)}" title="Markdown source at ${escapeAttr(short)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Neotoma">
<meta property="og:title" content="${escapeAttr(title)}">
<meta property="og:description" content="${escapeAttr(description)}">
<meta property="og:url" content="${escapeAttr(canonical)}">
<meta property="og:image" content="${SITE_ORIGIN}/neotoma-og-1200x630.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="docs-viewer-source" content="${escapeAttr(entry.source)}">
<meta name="docs-viewer-commit" content="${escapeAttr(commit)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="any">
<style>${CSS}</style>
</head>
<body>
<a class="dv-skip" href="#dv-main">Skip to the document</a>
<header class="dv-masthead"><div class="dv-masthead-inner">
<a class="dv-brand" href="/" aria-label="Neotoma home"><img class="dv-logo-light" src="/brand/n2-nav-light.svg" alt="Neotoma" width="132" height="28"><img class="dv-logo-dark" src="/brand/n2-nav-dark.svg" alt="Neotoma" width="132" height="28"><span class="dv-mono">Docs</span></a>
<nav aria-label="Site"><a href="/">Home</a><a href="/install">Install</a><a href="${GITHUB_REPO_URL}">GitHub</a></nav>
</div></header>
<div class="dv-layout">
<nav class="dv-side" aria-label="Documentation">${navHtml}</nav>
<main id="dv-main" tabindex="-1">
<details class="dv-mnav"><summary class="dv-mono">Documents</summary><div>${navHtml}</div></details>
<article class="dv-sheet">
<header class="dv-head">
${previewNotice ? `<p class="dv-preview">${escapeText(previewNotice)}</p>` : ""}
<p class="dv-kicker dv-mono">Docs · ${escapeText(entry.group)}</p>
<h1>${escapeText(entry.title)}</h1>
${summary ? `<p class="dv-summary">${escapeText(summary)}</p>` : ""}
${doc.header.appliesTo ? `<p class="dv-applies"><span class="dv-mono">Applies to</span>${escapeText(doc.header.appliesTo.replace(/^applies to:?\s*/i, ""))}</p>` : ""}
<p class="dv-meta"><a href="${escapeAttr(sourceUrl)}">View and edit on GitHub</a> · <code>${escapeText(entry.source)}</code> at <code>${escapeText(short)}</code></p>
${toc}
</header>
<div class="dv-body">
${doc.html}
${
  doc.agentInstructionsHeading
    ? `<p class="dv-note">The file ends with an “${escapeText(doc.agentInstructionsHeading)}” section written for coding agents. It is left out here; read it <a href="${escapeAttr(`${sourceUrl}#${githubSlug(doc.agentInstructionsHeading)}`)}">on GitHub</a>.</p>`
    : ""
}
</div>
${
  prev || next
    ? `<nav class="dv-pager" aria-label="Previous and next document">${
        prev
          ? `<a class="prev" href="${escapeAttr(viewerHref(prev.slug))}" rel="prev"><span class="dv-mono">Previous</span>${escapeText(prev.title)}</a>`
          : ""
      }${
        next
          ? `<a class="next" href="${escapeAttr(viewerHref(next.slug))}" rel="next"><span class="dv-mono">Next</span>${escapeText(next.title)}</a>`
          : ""
      }</nav>`
    : ""
}
</article>
</main>
</div>
<footer class="dv-foot">
<p>Rendered from <a href="${escapeAttr(sourceUrl)}">${escapeText(entry.source)}</a> at commit <code>${escapeText(short)}</code>. The file on GitHub is the source; edits there appear here at the next site deploy.</p>
<p><a href="/">neotoma.io</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms of use</a></p>
</footer>
</body>
</html>
`;
}
