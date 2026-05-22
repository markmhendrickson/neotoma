/**
 * HTML shell for the `/docs` index and per-doc pages.
 *
 * Pure functions of inputs; no env reads. Inline CSS / JS are emitted as
 * deterministic strings — no random nonces, no Date.now().
 */

import { escapeHtml } from "./markdown_render.js";
import type { CategoryGroup, DocEntry, DocsIndex } from "./index_builder.js";
import type { ResolvedDoc } from "./render.js";

const BASE_STYLES = `
  :root {
    --fg: #0b1220;
    --fg-muted: #4a5568;
    --bg: #ffffff;
    --bg-soft: #f7fafc;
    --border: #e2e8f0;
    --accent: #1a56db;
    --code-bg: #f1f5f9;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
    color: var(--fg);
    background: var(--bg);
    line-height: 1.6;
  }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  header.docs-header {
    border-bottom: 1px solid var(--border);
    padding: 16px 24px;
    background: var(--bg-soft);
  }
  header.docs-header h1 { margin: 0; font-size: 20px; }
  header.docs-header nav { font-size: 14px; color: var(--fg-muted); }
  main.docs-main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px;
  }
  .docs-search {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 15px;
    margin-bottom: 24px;
  }
  .docs-featured {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
    margin-bottom: 32px;
  }
  .docs-featured-card {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
    background: var(--bg-soft);
  }
  .docs-featured-card h3 { margin: 0 0 6px; font-size: 15px; }
  .docs-featured-card p { margin: 0; font-size: 13px; color: var(--fg-muted); }
  .docs-section { margin-bottom: 28px; }
  .docs-section h2 { font-size: 17px; margin: 0 0 6px; }
  .docs-section p.desc { margin: 0 0 10px; color: var(--fg-muted); font-size: 14px; }
  .docs-subsection { margin: 12px 0 16px; }
  .docs-subsection h3 { font-size: 14px; margin: 0 0 4px; color: var(--fg-muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .docs-list { list-style: none; padding: 0; margin: 0; }
  .docs-list li { padding: 4px 0; }
  .docs-list li .summary { color: var(--fg-muted); font-size: 13px; display: block; }
  .docs-meta { font-size: 13px; color: var(--fg-muted); margin-bottom: 16px; }
  .docs-meta .tag { display: inline-block; margin-right: 6px; padding: 1px 8px; border: 1px solid var(--border); border-radius: 999px; background: var(--bg-soft); }
  article.docs-article { max-width: 800px; }
  article.docs-article h1 { font-size: 28px; margin-top: 0; }
  article.docs-article h2 { font-size: 22px; margin-top: 28px; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
  article.docs-article h3 { font-size: 18px; margin-top: 20px; }
  article.docs-article pre { background: var(--code-bg); padding: 12px 14px; border-radius: 8px; overflow-x: auto; font-size: 13px; }
  article.docs-article code { background: var(--code-bg); padding: 1px 5px; border-radius: 4px; font-size: 0.92em; }
  article.docs-article pre code { padding: 0; background: transparent; }
  article.docs-article blockquote { border-left: 3px solid var(--border); margin: 0; padding: 4px 12px; color: var(--fg-muted); }
  .docs-hidden { display: none !important; }
`;

const SEARCH_SCRIPT = `
  (function () {
    var input = document.getElementById('docs-search');
    if (!input) return;
    var sections = Array.prototype.slice.call(document.querySelectorAll('[data-search-section]'));
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-search-item]'));
    function filter() {
      var q = input.value.trim().toLowerCase();
      if (!q) {
        items.forEach(function (el) { el.classList.remove('docs-hidden'); });
        sections.forEach(function (el) { el.classList.remove('docs-hidden'); });
        return;
      }
      sections.forEach(function (sec) {
        var anyVisible = false;
        var secItems = sec.querySelectorAll('[data-search-item]');
        for (var i = 0; i < secItems.length; i++) {
          var it = secItems[i];
          var hay = it.getAttribute('data-search-haystack') || '';
          var visible = hay.toLowerCase().indexOf(q) !== -1;
          if (visible) { it.classList.remove('docs-hidden'); anyVisible = true; }
          else { it.classList.add('docs-hidden'); }
        }
        if (anyVisible) sec.classList.remove('docs-hidden');
        else sec.classList.add('docs-hidden');
      });
    }
    input.addEventListener('input', filter);
  })();
`;

function renderHeader(title: string): string {
  return `<header class="docs-header"><nav><a href="/">Neotoma</a> &nbsp;·&nbsp; <a href="/docs">Docs</a></nav><h1>${escapeHtml(title)}</h1></header>`;
}

function renderDocLink(doc: DocEntry): string {
  const haystack = `${doc.frontmatter.title} ${doc.frontmatter.summary} ${doc.frontmatter.tags.join(" ")} ${doc.slug}`;
  return [
    `<li data-search-item data-search-haystack="${escapeHtml(haystack)}">`,
    `<a href="/docs/${escapeHtml(doc.slug)}">${escapeHtml(doc.frontmatter.title)}</a>`,
    doc.frontmatter.summary
      ? `<span class="summary">${escapeHtml(doc.frontmatter.summary)}</span>`
      : "",
    `</li>`,
  ].join("");
}

function renderFeatured(featured: DocEntry[]): string {
  if (featured.length === 0) return "";
  const cards = featured
    .map((d) => {
      return [
        `<a class="docs-featured-card" href="/docs/${escapeHtml(d.slug)}">`,
        `<h3>${escapeHtml(d.frontmatter.title)}</h3>`,
        d.frontmatter.summary ? `<p>${escapeHtml(d.frontmatter.summary)}</p>` : "",
        `</a>`,
      ].join("");
    })
    .join("");
  return `<section><h2>Featured</h2><div class="docs-featured">${cards}</div></section>`;
}

function renderCategory(cat: CategoryGroup): string {
  const subSections = cat.subcategories
    .map((sub) => {
      const items = sub.docs.map(renderDocLink).join("");
      return `<div class="docs-subsection"><h3>${escapeHtml(sub.display_name)}</h3><ul class="docs-list">${items}</ul></div>`;
    })
    .join("");
  const uncat = cat.uncategorized.length
    ? `<ul class="docs-list">${cat.uncategorized.map(renderDocLink).join("")}</ul>`
    : "";
  return [
    `<section class="docs-section" data-search-section>`,
    `<h2 id="${escapeHtml(cat.key)}">${escapeHtml(cat.display_name)}</h2>`,
    cat.description ? `<p class="desc">${escapeHtml(cat.description)}</p>` : "",
    uncat,
    subSections,
    `</section>`,
  ].join("");
}

export function renderIndexHtml(index: DocsIndex): string {
  const featured = renderFeatured(index.featured);
  const cats = index.categories.map(renderCategory).join("");
  return [
    `<!doctype html>`,
    `<html lang="en"><head><meta charset="utf-8"><title>Docs · Neotoma</title>`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<style>${BASE_STYLES}</style></head><body>`,
    renderHeader("Documentation"),
    `<main class="docs-main">`,
    `<input id="docs-search" class="docs-search" type="search" placeholder="Search ${index.total} docs..." autocomplete="off">`,
    featured,
    cats,
    `</main>`,
    `<script>${SEARCH_SCRIPT}</script>`,
    `</body></html>`,
  ].join("\n");
}

export function renderDocHtml(doc: ResolvedDoc): string {
  const fm = doc.frontmatter;
  const tags = fm.tags.length
    ? `<div class="docs-meta">${fm.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>`
    : "";
  const reviewed = fm.last_reviewed
    ? `<div class="docs-meta">Last reviewed: ${escapeHtml(fm.last_reviewed)}</div>`
    : "";
  return [
    `<!doctype html>`,
    `<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(fm.title)} · Neotoma Docs</title>`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    fm.summary ? `<meta name="description" content="${escapeHtml(fm.summary)}">` : "",
    `<style>${BASE_STYLES}</style></head><body>`,
    renderHeader(fm.title),
    `<main class="docs-main"><article class="docs-article">`,
    tags,
    reviewed,
    doc.html,
    `<hr /><p class="docs-meta">Source: <code>${escapeHtml(doc.repo_path)}</code></p>`,
    `</article></main></body></html>`,
  ].join("\n");
}

export function renderNotFoundHtml(slug: string): string {
  return [
    `<!doctype html>`,
    `<html lang="en"><head><meta charset="utf-8"><title>Not found · Neotoma Docs</title>`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<style>${BASE_STYLES}</style></head><body>`,
    renderHeader("Not found"),
    `<main class="docs-main">`,
    `<p>No doc at <code>/docs/${escapeHtml(slug)}</code>.</p>`,
    `<p><a href="/docs">Back to the docs index</a>.</p>`,
    `</main></body></html>`,
  ].join("\n");
}
