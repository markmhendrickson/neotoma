/**
 * HTML skeleton and section helpers for the MCP root landing page.
 *
 * Inline CSS and a tiny clipboard script — no build step, no framework. The
 * page renders server-side and remains readable and copyable without
 * JavaScript.
 */

import type { HarnessSnippetResult } from "./harness_snippets.js";
import type { RootLandingNavCategory } from "./site_nav.js";
import { resolveNavHref } from "./site_nav.js";

export type LandingMode = "sandbox" | "personal" | "prod" | "local";

export interface LandingHtmlContext {
  mode: LandingMode;
  /** Resolved `NEOTOMA_ENV` (default `development`); DB and path profile, distinct from {@link mode}. */
  configEnvironment: string;
  base: string;
  mcpUrl: string;
  version: string;
  gitSha: string | null;
  inspectorUrl: string | null;
  publicDocsUrl: string;
  harnesses: HarnessSnippetResult[];
  index: RootLandingNavCategory[];
  endpoints: Record<string, string>;
  sandboxPacks?: { id: string; kind: string; label: string }[];
  sandboxDefaultPackId?: string;
  activeSessionBearer?: string | null;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function modeCopy(mode: LandingMode): { title: string; subtitle: string; banner?: string } {
  switch (mode) {
    case "sandbox":
      return {
        title: "Neotoma sandbox — public demo instance",
        subtitle:
          "A shared Neotoma endpoint for evaluating the product and sharing reproducible examples.",
        banner:
          "Data here is public and resets every Sunday 00:00 UTC. Do not store private information.",
      };
    case "personal":
      return {
        title: "Neotoma MCP server",
        subtitle:
          "Personal instance. Public endpoints are read-only discovery; MCP writes require OAuth, a Bearer token, or a verified AAuth signature matching one of your active agent grants.",
      };
    case "prod":
      return {
        title: "Neotoma MCP server",
        subtitle:
          "Hosted production instance. MCP writes require OAuth, a Bearer token, or a verified AAuth signature matching one of your active agent grants.",
      };
    case "local":
      return {
        title: "Neotoma MCP server (local dev)",
        subtitle: "Development instance running on this machine.",
      };
  }
}

function renderHarnessSection(h: HarnessSnippetResult): string {
  const humanBlock = `<h4>Human-driven</h4>
<p class="muted">Format: <code>${escapeHtml(h.human.format)}</code></p>
${h.preflight ? `<details class="inner"><summary>${escapeHtml(h.preflight.title)}</summary>
<p class="muted">Format: <code>${escapeHtml(h.preflight.format)}</code></p>
<pre><button class="copy" type="button" aria-label="Copy preflight snippet">Copy</button><code>${escapeHtml(h.preflight.code)}</code></pre>
</details>` : ""}
<pre><button class="copy" type="button" aria-label="Copy config snippet">Copy</button><code>${escapeHtml(h.human.code)}</code></pre>`;

  const agentBlock = `<h4>Agent-driven</h4>
<p class="muted">Paste this prompt into ${escapeHtml(h.label)} and let it configure the connection.</p>
<pre><button class="copy" type="button" aria-label="Copy agent prompt">Copy</button><code>${escapeHtml(h.agentPrompt)}</code></pre>`;

  return `<details class="harness">
<summary><strong>${escapeHtml(h.label)}</strong> <span class="muted">· ${escapeHtml(h.description)}</span></summary>
<div class="harness-body">
  <details class="inner" open><summary>Agent-driven</summary>${agentBlock}</details>
  <details class="inner"><summary>Human-driven</summary>${humanBlock}</details>
  <p class="muted"><a href="${escapeHtml(h.docsUrl)}" rel="noopener">Per-harness documentation →</a></p>
</div>
</details>`;
}

function renderIndexCategory(cat: RootLandingNavCategory, publicDocsUrl: string): string {
  const items = cat.items
    .map((item) => {
      const href = resolveNavHref(item.href, publicDocsUrl);
      const isExternal = /^https?:\/\//i.test(item.href);
      const external = isExternal ? ' rel="noopener" target="_blank"' : "";
      return `<li><a href="${escapeHtml(href)}"${external}>${escapeHtml(item.label)}</a></li>`;
    })
    .join("");
  return `<section class="nav-cat">
<h3>${escapeHtml(cat.title)}</h3>
<ul>${items}</ul>
</section>`;
}

function renderEndpoints(endpoints: Record<string, string>, base: string): string {
  const rows = Object.entries(endpoints)
    .map(([label, path]) => {
      const href = `${base}${path}`;
      return `<li><code>${escapeHtml(path)}</code> <span class="muted">— <a href="${escapeHtml(href)}">${escapeHtml(label.replace(/_/g, " "))}</a></span></li>`;
    })
    .join("");
  return `<ul class="endpoints">${rows}</ul>`;
}

const INLINE_STYLES = `
:root {
  color-scheme: light dark;
  --fg: #0b1221;
  --muted: #596172;
  --bg: #fbfaf7;
  --card: #ffffff;
  --border: #e2e0d9;
  --accent: #6750a4;
  --code-bg: #f4f2ec;
  --warn-bg: #fff4d6;
  --warn-fg: #7a5b00;
}
@media (prefers-color-scheme: dark) {
  :root {
    --fg: #edeef4;
    --muted: #9aa0b0;
    --bg: #0f121a;
    --card: #151924;
    --border: #242836;
    --accent: #b9a7e6;
    --code-bg: #1a1e2a;
    --warn-bg: #2d2410;
    --warn-fg: #f3c65b;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.55;
  font-size: 15px;
}
.wrap {
  max-width: 780px;
  margin: 0 auto;
  padding: 32px 20px 64px;
}
header h1 {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 6px;
}
header p.lede {
  font-size: 15px;
  color: var(--muted);
  margin: 0 0 16px;
}
.badges { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  background: var(--card);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  color: var(--muted);
}
.badge strong { color: var(--fg); font-weight: 500; }
.banner {
  background: var(--warn-bg);
  color: var(--warn-fg);
  border: 1px solid color-mix(in srgb, var(--warn-fg) 25%, transparent);
  border-radius: 8px;
  padding: 10px 14px;
  margin: 16px 0;
  font-size: 14px;
}
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 18px;
  margin: 18px 0;
}
h2 {
  font-size: 17px;
  font-weight: 600;
  margin: 28px 0 10px;
  letter-spacing: -0.01em;
}
h3 {
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin: 20px 0 6px;
}
h4 {
  font-size: 13px;
  font-weight: 600;
  margin: 12px 0 4px;
}
p { margin: 8px 0; }
a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
a:hover { text-decoration: none; }
code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  background: var(--code-bg);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 13px;
}
pre {
  position: relative;
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 12.5px;
  line-height: 1.5;
  margin: 8px 0;
}
pre code { background: transparent; padding: 0; }
pre button.copy {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 11px;
  padding: 2px 8px;
  background: var(--card);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  line-height: 1.4;
}
pre button.copy:hover { border-color: var(--accent); color: var(--accent); }
.muted { color: var(--muted); font-size: 13px; }
ul { padding-left: 20px; margin: 6px 0; }
ul.endpoints { list-style: none; padding-left: 0; }
ul.endpoints li { padding: 3px 0; font-size: 13.5px; }
details.harness {
  border: 1px solid var(--border);
  background: var(--card);
  border-radius: 8px;
  padding: 8px 14px;
  margin: 8px 0;
}
details.harness > summary {
  cursor: pointer;
  padding: 4px 0;
  font-size: 14px;
}
details.harness .harness-body { padding: 6px 0 8px; }
details.inner {
  border: 1px solid var(--border);
  background: var(--bg);
  border-radius: 6px;
  padding: 6px 10px;
  margin: 6px 0;
}
details.inner > summary {
  cursor: pointer;
  font-size: 13px;
  color: var(--muted);
}
nav.index { display: grid; gap: 14px; grid-template-columns: 1fr; }
@media (min-width: 640px) { nav.index { grid-template-columns: 1fr 1fr; } }
section.nav-cat ul { padding-left: 16px; margin: 4px 0 0; }
section.nav-cat li { font-size: 13.5px; padding: 2px 0; }
footer {
  margin-top: 40px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--muted);
}
`;

const INLINE_SCRIPT = `
(function(){
  function copyNearest(btn){
    var pre = btn.closest('pre'); if(!pre) return;
    var code = pre.querySelector('code'); if(!code) return;
    var txt = code.innerText;
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(function(){ flash(btn); }, function(){ fallback(txt, btn); });
    } else { fallback(txt, btn); }
  }
  function fallback(txt, btn){
    try{
      var ta = document.createElement('textarea');
      ta.value = txt; ta.style.position='fixed'; ta.style.top='-9999px';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      flash(btn);
    }catch(e){}
  }
  function flash(btn){
    var prev = btn.textContent; btn.textContent = 'Copied';
    setTimeout(function(){ btn.textContent = prev; }, 1400);
  }
  document.addEventListener('click', function(e){
    var t = e.target; if(t && t.classList && t.classList.contains('copy')) copyNearest(t);
  });
})();
`;

function renderPackPicker(ctx: LandingHtmlContext): string {
  const packs = ctx.sandboxPacks;
  if (!packs || packs.length === 0) return "";
  const defaultId = ctx.sandboxDefaultPackId ?? "generic";
  const starters = packs.filter((p) => p.kind !== "use_case");
  const useCases = packs.filter((p) => p.kind === "use_case");
  const option = (p: { id: string; label: string }) =>
    `<option value="${escapeHtml(p.id)}"${p.id === defaultId ? " selected" : ""}>${escapeHtml(p.label)}</option>`;
  const starterOpts = starters.map(option).join("\n");
  const useCaseOpts = useCases.map(option).join("\n");
  const options = [
    `<optgroup label="Starter">\n${starterOpts}\n</optgroup>`,
    useCaseOpts ? `<optgroup label="Use cases">\n${useCaseOpts}\n</optgroup>` : "",
  ].filter(Boolean).join("\n");
  return `
<section>
<h2>Start a sandbox session</h2>
<p class="muted">Choose a data pack to seed your ephemeral workspace, then click <strong>Start</strong>. Your session data is deleted when the session expires or you end it.</p>
<form id="sandbox-session-form" style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
  <select name="pack_id" id="sandbox-pack-select" style="padding:.4rem .6rem;border-radius:4px;border:1px solid #555;background:#1e1e1e;color:#e0e0e0;font-size:.9rem">
${options}
  </select>
  <button type="submit" style="padding:.4rem .8rem;border-radius:4px;border:none;background:#4f8ef7;color:#fff;cursor:pointer;font-size:.9rem">Start session</button>
</form>
<p id="sandbox-session-status" class="muted" style="margin-top:.5rem"></p>
<script>
(function(){
  var form = document.getElementById('sandbox-session-form');
  var status = document.getElementById('sandbox-session-status');
  if (!form) return;
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var packId = document.getElementById('sandbox-pack-select').value;
    status.textContent = 'Creating session…';
    fetch('/sandbox/session/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pack_id: packId })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.error) { status.textContent = 'Error: ' + data.error; return; }
      status.innerHTML = 'Session active — expires ' + data.expires_at +
        '. <a href="/inspector#session=' + encodeURIComponent(data.one_time_code) + '">Open Inspector</a>' +
        ' or <a href="#" id="sandbox-end-session">end session</a>.';
      var endLink = document.getElementById('sandbox-end-session');
      if (endLink) {
        endLink.addEventListener('click', function(ev) {
          ev.preventDefault();
          fetch('/sandbox/session', { method: 'DELETE' })
          .then(function() { status.textContent = 'Session ended.'; })
          .catch(function() { status.textContent = 'Failed to end session.'; });
        });
      }
    })
    .catch(function(err) { status.textContent = 'Request failed: ' + err.message; });
  });
})();
</script>
</section>
`;
}

export function renderLandingHtml(ctx: LandingHtmlContext): string {
  const copy = modeCopy(ctx.mode);
  const badges: string[] = [
    `<span class="badge"><strong>mode</strong> ${escapeHtml(ctx.mode)}</span>`,
    `<span class="badge"><strong>config</strong> ${escapeHtml(ctx.configEnvironment)}</span>`,
    `<span class="badge"><strong>version</strong> ${escapeHtml(ctx.version)}</span>`,
  ];
  if (ctx.gitSha) {
    badges.push(`<span class="badge"><strong>git</strong> ${escapeHtml(ctx.gitSha.slice(0, 7))}</span>`);
  }

  const sandboxEndpointsNote =
    ctx.mode === "sandbox"
      ? `<p class="muted">Sandbox-specific: <a href="${escapeHtml(ctx.base)}/sandbox/terms">/sandbox/terms</a> (acceptable-use JSON) and <code>POST /sandbox/report</code> for abuse / PII reports.</p>`
      : "";

  const inspectorNote = ctx.inspectorUrl
    ? `<p>Inspector UI: <a href="${escapeHtml(ctx.inspectorUrl)}">${escapeHtml(ctx.inspectorUrl)}</a></p>`
    : "";

  const harnessLede =
    ctx.mode === "local"
      ? "Config snippets use stdio; connect Neotoma as a local process."
      : `Config snippets below use this host's MCP URL — <code>${escapeHtml(ctx.mcpUrl)}</code> — so you can paste them directly into your harness.`;

  const title = ctx.mode === "sandbox"
    ? "Neotoma sandbox"
    : ctx.mode === "local"
      ? "Neotoma (local)"
      : "Neotoma MCP server";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="${ctx.mode === "sandbox" || ctx.mode === "local" ? "noindex, nofollow" : "index, follow"}">
<link rel="icon" href="/favicon.ico">
<title>${escapeHtml(title)}</title>
<style>${INLINE_STYLES}</style>
</head>
<body>
<div class="wrap">
<header>
<h1>${escapeHtml(copy.title)}</h1>
<p class="lede">${escapeHtml(copy.subtitle)}</p>
<div class="badges">${badges.join("")}</div>
${copy.banner ? `<div class="banner">${escapeHtml(copy.banner)}</div>` : ""}
</header>

<section class="card">
<h2>This instance</h2>
<ul class="endpoints">
<li><code>${escapeHtml(ctx.mcpUrl)}</code> <span class="muted">— MCP endpoint</span></li>
${Object.entries(ctx.endpoints)
  .map(([label, path]) => `<li><code>${escapeHtml(path)}</code> <span class="muted">— <a href="${escapeHtml(ctx.base)}${escapeHtml(path)}">${escapeHtml(label.replace(/_/g, " "))}</a></span></li>`)
  .join("\n")}
</ul>
${inspectorNote}
${sandboxEndpointsNote}
</section>

${ctx.mode === "sandbox" ? renderPackPicker(ctx) : ""}

<section>
<h2>Connect your harness</h2>
<p class="muted">${harnessLede}</p>
${ctx.harnesses.map(renderHarnessSection).join("\n")}
</section>

<section>
<h2>Learn</h2>
<p class="muted">All links resolve to <code>${escapeHtml(ctx.publicDocsUrl)}</code> unless external.</p>
<nav class="index">
${ctx.index.map((c) => renderIndexCategory(c, ctx.publicDocsUrl)).join("\n")}
</nav>
</section>

<footer>
<p>Served by Neotoma ${escapeHtml(ctx.version)}${ctx.gitSha ? ` · ${escapeHtml(ctx.gitSha.slice(0, 7))}` : ""} — mode ${escapeHtml(ctx.mode)} · config ${escapeHtml(ctx.configEnvironment)}.</p>
<p>Programmatic clients: send <code>Accept: application/json</code> for structured JSON, or <code>Accept: text/markdown</code> for the same content as Markdown. Default (no <code>Accept</code> / generic <code>*/*</code>) is JSON.</p>
</footer>
</div>
<script>${INLINE_SCRIPT}</script>
</body>
</html>`;
}

/** Exported so tests can confirm both endpoint helpers stay in sync. */
export { renderEndpoints };
