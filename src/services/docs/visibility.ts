/**
 * Visibility gating for the `/docs` route.
 *
 * Docs declare `visibility: public | internal` in frontmatter (or inherit it
 * from `FOLDER_DEFAULTS`). At request time, internal docs 404 unless the
 * environment opts in via `NEOTOMA_DOCS_SHOW_INTERNAL=true`.
 *
 * Default: internal docs are hidden unless the operator explicitly opts in.
 * This fails closed for staging, previews, sandboxes, and any deployment that
 * forgets to set `NODE_ENV=production`.
 */

import type { DocFrontmatter } from "./doc_frontmatter.js";

export interface VisibilityEnv {
  NODE_ENV?: string;
  NEOTOMA_DOCS_SHOW_INTERNAL?: string;
}

/** True when internal-visibility docs should be exposed for the given env. */
export function shouldShowInternal(env: VisibilityEnv): boolean {
  const flag = env.NEOTOMA_DOCS_SHOW_INTERNAL;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return false;
}

/** True when the doc should be visible to the requester. */
export function isVisible(fm: Pick<DocFrontmatter, "visibility">, env: VisibilityEnv): boolean {
  if (fm.visibility === "public") return true;
  return shouldShowInternal(env);
}

/**
 * Top-level `docs/` folders that are NOT part of the in-app public docs
 * surface: high-volume non-in-app trees (release history, feature units) and
 * the internal-process folders. These are dropped from the `/docs` index, from
 * direct slug lookup, and from the npm bundle.
 *
 * Single source of truth shared by the runtime route (`index_builder`,
 * `render`) and the build-time bundler (`scripts/build_bundled_docs.ts`), so a
 * hosted-from-source instance and an npm install expose the same surface for
 * these folders.
 *
 * On the runtime route the exclusion is gated by show-internal: the default
 * (production) serves the curated public surface, and
 * `NEOTOMA_DOCS_SHOW_INTERNAL=true` reveals the full checkout tree for local
 * dev. The bundler applies the exclusion unconditionally (the package never
 * ships internal content).
 *
 * NOTE: `site/` (the marketing-site pages) is intentionally NOT here so that
 * DIRECT lookups of `site/pages/en/*` keep resolving (the root-landing footer
 * deep-links into them). `site/` IS excluded from the browsable index and the
 * npm bundle via {@link INDEX_EXCLUDED_TOP_FOLDERS}, so the ~170 multilingual
 * marketing pages do not flood the in-app docs browser.
 */
export const NON_PUBLIC_TOP_FOLDERS: ReadonlySet<string> = new Set([
  "releases",
  "feature_units",
  "plans",
  "proposals",
  "prototypes",
  "reports",
  "implementation",
  "private",
  "assets",
  "templates",
  "research",
]);

/**
 * True when a `docs/`-relative path lives under a non-public top-level folder.
 * `relPath` is POSIX, `docs/`-relative (e.g. `releases/in_progress/foo.md`).
 *
 * This set gates DIRECT slug lookup (`render.lookupDoc`). It excludes `site`,
 * so footer deep-links into `site/pages/en/*` still resolve on from-source
 * hosts. For the BROWSABLE index, use {@link isIndexExcludedTopFolder}.
 */
export function isNonPublicTopFolder(relPath: string): boolean {
  const top = relPath.split("/")[0];
  return NON_PUBLIC_TOP_FOLDERS.has(top);
}

/**
 * Top-level folders excluded from the BROWSABLE `/docs` index and the npm
 * bundle: the non-public surface PLUS `site` (the marketing-site pages). The
 * ~170 multilingual `site/pages/{en,es}/*` files are marketing content, not
 * developer docs, so they are kept out of the in-app docs browser even on
 * from-source hosts — but they remain reachable by direct URL (see
 * {@link isNonPublicTopFolder}) so the root-landing footer keeps working.
 *
 * Shared by `index_builder.buildDocsIndex` (gated by show-internal) and the
 * build-time bundler (`scripts/build_bundled_docs.ts`, unconditional).
 */
export const INDEX_EXCLUDED_TOP_FOLDERS: ReadonlySet<string> = new Set([
  ...NON_PUBLIC_TOP_FOLDERS,
  "site",
]);

/**
 * True when a `docs/`-relative path is excluded from the browsable index / npm
 * bundle (non-public folders plus `site`). See {@link INDEX_EXCLUDED_TOP_FOLDERS}.
 */
export function isIndexExcludedTopFolder(relPath: string): boolean {
  const top = relPath.split("/")[0];
  return INDEX_EXCLUDED_TOP_FOLDERS.has(top);
}
