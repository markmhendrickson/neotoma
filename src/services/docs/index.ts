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

import path from "node:path";
import { fileURLToPath } from "node:url";
import type express from "express";
import { buildDocsIndex } from "./index_builder.js";
import { renderIndexHtml, renderDocHtml, renderNotFoundHtml } from "./html_template.js";
import { lookupDoc } from "./render.js";
import { loadManifest } from "./manifest_loader.js";
import type { VisibilityEnv } from "./visibility.js";

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

export function mountDocsRoutes(app: express.Express, opts: DocsRoutesOptions = {}): void {
  const repoRoot = opts.repoRoot ?? resolveRepoRoot();
  const docsRoot = path.join(repoRoot, "docs");
  const manifestPath = path.join(repoRoot, "docs", "site", "site_doc_manifest.yaml");

  app.get("/docs", (req, res) => {
    const env = opts.envSource ?? (process.env as VisibilityEnv);
    const manifest = loadManifest(manifestPath);
    const index = buildDocsIndex({
      docsRoot,
      manifest: manifest.docs,
      env,
      manifestEntries: manifest.entries,
    });
    res.set("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(renderIndexHtml(index));
  });

  // `*` matches the rest of the path; Express puts the captured segment in
  // `req.params[0]`.
  app.get("/docs/*", (req, res) => {
    const env = opts.envSource ?? (process.env as VisibilityEnv);
    const manifest = loadManifest(manifestPath);
    const rawSlug = (req.params as Record<string, string>)[0] ?? "";
    const lookup = lookupDoc(rawSlug, {
      docsRoot,
      env,
      manifestEntries: manifest.entries,
    });
    res.set("Content-Type", "text/html; charset=utf-8");
    if (!lookup.ok) {
      res.status(404).send(renderNotFoundHtml(rawSlug));
      return;
    }
    res.status(200).send(renderDocHtml(lookup.doc));
  });
}
