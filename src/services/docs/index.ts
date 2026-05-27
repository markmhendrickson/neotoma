/**
 * `/docs` route mount.
 *
 * - `GET /docs` → server-rendered index of all visible docs, grouped by the
 *   category tree declared in `docs/site/site_doc_manifest.yaml`.
 * - `GET /docs/<slug>` → server-rendered single doc page.
 *
 * Visibility: docs flagged `visibility: internal` (or inherited from
 * `FOLDER_DEFAULTS`) are filtered out unless `NEOTOMA_DOCS_SHOW_INTERNAL=true`
 * or `NODE_ENV !== "production"`.
 *
 * Security:
 *   - Slug allowlist is `[A-Za-z0-9_./-]+`; `..` is rejected; resolved path
 *     must stay strictly under the repo `docs/` root.
 *   - Public read-only route; no auth required. Registered in
 *     `scripts/security/protected_routes_manifest.json` with a stated reason.
 *
 * Determinism: index ordering is a pure function of (category.order →
 * subcategory.order → frontmatter.order → title). No `Date.now()` /
 * `Math.random()`; no wall-clock fallbacks.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type express from "express";
import { buildDocsIndex, type DocsIndex } from "./index_builder.js";
import { renderIndexHtml, renderDocHtml, renderNotFoundHtml } from "./html_template.js";
import { lookupDoc } from "./render.js";
import { loadManifest } from "./manifest_loader.js";
import type { VisibilityEnv } from "./visibility.js";
import { acceptPrefersHtml } from "../inspector_mount.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Walk up from `dist/services/docs/` (or `src/services/docs/`) to repo root. */
function resolveRepoRoot(): string {
  // Both `src/` and `dist/` are siblings of `services/`. Walk up 3 levels.
  return path.resolve(__dirname, "..", "..", "..");
}

export interface DocsRoutesOptions {
  repoRoot?: string;
  /** Override the env source (used in tests). */
  envSource?: VisibilityEnv;
}

interface DocsIndexCache {
  key: string;
  index: DocsIndex;
}

let docsIndexCache: DocsIndexCache | null = null;

function getTreeMtimeMs(root: string): number {
  let max = 0;
  const walk = (abs: string): void => {
    let st: fs.Stats;
    try {
      st = fs.statSync(abs);
    } catch {
      return;
    }
    max = Math.max(max, st.mtimeMs);
    if (!st.isDirectory()) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name === "node_modules" || ent.name === ".git") continue;
      walk(path.join(abs, ent.name));
    }
  };
  walk(root);
  return max;
}

function getDocsIndex(opts: {
  docsRoot: string;
  manifestPath: string;
  env: VisibilityEnv;
}): DocsIndex {
  const manifestMtime = fs.existsSync(opts.manifestPath)
    ? fs.statSync(opts.manifestPath).mtimeMs
    : 0;
  const docsMtime = getTreeMtimeMs(opts.docsRoot);
  const showInternal = opts.env.NEOTOMA_DOCS_SHOW_INTERNAL === "true" ? "1" : "0";
  const key = `${opts.docsRoot}:${opts.manifestPath}:${manifestMtime}:${docsMtime}:${showInternal}`;
  if (docsIndexCache?.key === key) return docsIndexCache.index;

  const manifest = loadManifest(opts.manifestPath);
  const index = buildDocsIndex({
    docsRoot: opts.docsRoot,
    manifest: manifest.docs,
    env: opts.env,
    manifestEntries: manifest.entries,
  });
  docsIndexCache = { key, index };
  return index;
}

/**
 * Build (or fetch from cache) the bundled docs index for the given repo.
 * Exposed for tests and for callers that need the raw `DocsIndex` (e.g. the
 * root landing page navigation builder) without mounting the HTTP routes.
 */
export function getBundledDocsIndex(opts: {
  repoRoot: string;
  envSource?: VisibilityEnv;
}): DocsIndex {
  const docsRoot = path.join(opts.repoRoot, "docs");
  const manifestPath = path.join(opts.repoRoot, "docs", "site", "site_doc_manifest.yaml");
  const env = opts.envSource ?? (process.env as VisibilityEnv);
  return getDocsIndex({ docsRoot, manifestPath, env });
}

export function mountDocsRoutes(app: express.Express, opts: DocsRoutesOptions = {}): void {
  const repoRoot = opts.repoRoot ?? resolveRepoRoot();
  const docsRoot = path.join(repoRoot, "docs");
  const manifestPath = path.join(repoRoot, "docs", "site", "site_doc_manifest.yaml");

  // Content negotiation: the inspector SPA navigates to /docs and /docs/<slug>
  // and expects HTML (the SPA shell) — it then fetches JSON from the same URL
  // with `?format=json`. Server-rendered HTML is preserved as a no-JS fallback
  // for `Accept: text/html` requests that do not pass `?format=json`. JSON
  // responses are returned when `?format=json` is present OR the client sends
  // `Accept: application/json`.
  //
  // The SPA fallback handler registered later in `src/actions.ts` catches the
  // HTML case before this route fires; this handler runs for direct curl /
  // legacy clients and for the JSON requests the SPA makes.
  const wantsJson = (req: express.Request): boolean => {
    if (req.query.format === "json") return true;
    const accept = req.get("accept") ?? "";
    return accept.includes("application/json") && !accept.includes("text/html");
  };

  app.get("/docs", (req, res, next) => {
    const env = opts.envSource ?? (process.env as VisibilityEnv);
    const index = getDocsIndex({
      docsRoot,
      manifestPath,
      env,
    });
    if (wantsJson(req)) {
      res.set("Cache-Control", "public, max-age=60");
      res.status(200).json(index);
      return;
    }
    // Browser hard-refresh: fall through to the SPA shell fallback so the
    // inspector owns docs rendering. The legacy server-rendered HTML is
    // preserved only for clients that explicitly opt out of the SPA — i.e.
    // those that send neither `Accept: text/html` (browsers) nor
    // `?format=json` (the SPA's fetch path).
    if (acceptPrefersHtml(req.headers.accept)) return next();
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", "public, max-age=60");
    res.status(200).send(renderIndexHtml(index));
  });

  // `*` matches the rest of the path; Express puts the captured segment in
  // `req.params[0]`.
  app.get("/docs/*", (req, res, next) => {
    const env = opts.envSource ?? (process.env as VisibilityEnv);
    const manifest = loadManifest(manifestPath);
    const rawSlug = (req.params as Record<string, string>)[0] ?? "";
    const lookup = lookupDoc(rawSlug, {
      docsRoot,
      env,
      manifestEntries: manifest.entries,
    });
    if (wantsJson(req)) {
      res.set("Cache-Control", "public, max-age=60");
      if (!lookup.ok) {
        res.status(404).json({ error: "doc_not_found", slug: rawSlug });
        return;
      }
      res.status(200).json(lookup.doc);
      return;
    }
    if (acceptPrefersHtml(req.headers.accept)) return next();
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", "public, max-age=60");
    if (!lookup.ok) {
      res.status(404).send(renderNotFoundHtml(rawSlug));
      return;
    }
    res.status(200).send(renderDocHtml(lookup.doc));
  });
}
