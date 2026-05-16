/**
 * Visibility gating for the `/docs` route.
 *
 * Docs declare `visibility: public | internal` in frontmatter (or inherit it
 * from `FOLDER_DEFAULTS`). At request time, internal docs 404 unless the
 * environment opts in via `NEOTOMA_DOCS_SHOW_INTERNAL=true`.
 *
 * Default: internal docs are visible unless `NODE_ENV === "production"`. This
 * keeps dev and sandbox useful for developers while keeping production
 * conservative.
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
  return env.NODE_ENV !== "production";
}

/** True when the doc should be visible to the requester. */
export function isVisible(fm: Pick<DocFrontmatter, "visibility">, env: VisibilityEnv): boolean {
  if (fm.visibility === "public") return true;
  return shouldShowInternal(env);
}
