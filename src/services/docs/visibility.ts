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
 * NOTE: `site/` (the marketing-site pages) is intentionally NOT here. It is a
 * *packaging* exclusion, not a surface exclusion: from-source hosts serve it
 * (the root-landing footer links into `site/pages/en/*`), while the npm bundle
 * drops it because the package ships `.md` docs only, not the marketing tree.
 * The bundler adds `site` to its own exclusion set; see
 * `scripts/build_bundled_docs.ts`.
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
 */
export function isNonPublicTopFolder(relPath: string): boolean {
  const top = relPath.split("/")[0];
  return NON_PUBLIC_TOP_FOLDERS.has(top);
}
