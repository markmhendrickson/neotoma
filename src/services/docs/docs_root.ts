/**
 * Resolve which docs tree the `/docs` route serves.
 *
 * - Source checkout (dev, built repo, hosted-from-source): serve the full
 *   `repoRoot/docs` tree, which includes internal docs (shown only when
 *   `NEOTOMA_DOCS_SHOW_INTERNAL=true`).
 * - npm install: `package.json#files` ships `dist` plus only one docs file, so
 *   `repoRoot/docs` is effectively empty. Fall back to the curated public
 *   bundle copied to `dist/docs` at build time by
 *   `scripts/build_bundled_docs.ts`.
 *
 * The presence of the manifest at `repoRoot/docs/site/site_doc_manifest.yaml`
 * distinguishes a full checkout from an npm install (the manifest is not in the
 * shipped `files` list, but the bundler copies it into `dist/docs/site/`).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export interface DocsSources {
  docsRoot: string;
  manifestPath: string;
  /** Which tree was selected. */
  source: "checkout" | "bundled";
}

const MANIFEST_REL = path.join("site", "site_doc_manifest.yaml");

/**
 * Default bundled docs dir: `dist/docs`, a sibling of the compiled
 * `dist/services/` directory (this file compiles to `dist/services/docs/`).
 */
export function defaultBundledDocsRoot(): string {
  return path.resolve(here, "..", "..", "docs");
}

/**
 * Pick the docs tree and manifest for the given repo root. Pass
 * `bundledDocsRoot` to override the fallback location (used in tests).
 */
export function resolveDocsSources(
  repoRoot: string,
  bundledDocsRoot: string = defaultBundledDocsRoot()
): DocsSources {
  const sourceDocsRoot = path.join(repoRoot, "docs");
  const sourceManifest = path.join(sourceDocsRoot, MANIFEST_REL);
  if (fs.existsSync(sourceManifest)) {
    return { docsRoot: sourceDocsRoot, manifestPath: sourceManifest, source: "checkout" };
  }
  return {
    docsRoot: bundledDocsRoot,
    manifestPath: path.join(bundledDocsRoot, MANIFEST_REL),
    source: "bundled",
  };
}
