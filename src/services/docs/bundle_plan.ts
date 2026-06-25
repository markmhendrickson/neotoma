/**
 * Pure planning logic for the build-time docs bundler
 * (`scripts/build_bundled_docs.ts`). Separated from the script so the
 * visibility/deprecation/folder filtering can be unit-tested without the
 * script's filesystem side effects (copy, rm, manifest write).
 *
 * Deterministic: a pure function of the docs tree + manifest entries. No
 * `Date.now()` / `Math.random()`.
 */

import fs from "node:fs";
import path from "node:path";
import { resolveFrontmatter } from "./doc_frontmatter.js";

/**
 * Top-level `docs/` folders excluded from the bundle: the marketing-site MDX
 * (the .md-only index never serves it), release history, feature units, and the
 * internal process folders. Per-file visibility filtering handles internal docs
 * inside kept folders.
 */
export const BUNDLE_EXCLUDED_TOP: ReadonlySet<string> = new Set([
  "site",
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

export const BUNDLE_SKIP_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  "archived",
  "private",
]);

export interface BundlePlan {
  /** `docs/`-relative paths to copy into the bundle. */
  include: string[];
  /** Paths excluded because resolved visibility is `internal`. */
  skippedInternal: string[];
  /** Paths excluded because the doc is deprecated. */
  skippedDeprecated: string[];
}

/** Recursively collect `.md` files under `docsRoot`, honoring the exclusions. */
export function collectBundleMarkdown(docsRoot: string): string[] {
  const out: string[] = [];
  const walk = (absDir: string, rel: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.isDirectory()) {
        if (BUNDLE_SKIP_DIRS.has(ent.name)) continue;
        const childRel = rel ? `${rel}/${ent.name}` : ent.name;
        if (BUNDLE_EXCLUDED_TOP.has(childRel.split("/")[0])) continue;
        walk(path.join(absDir, ent.name), childRel);
      } else if (ent.isFile() && ent.name.endsWith(".md")) {
        out.push(rel ? `${rel}/${ent.name}` : ent.name);
      }
    }
  };
  walk(docsRoot, "");
  out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return out;
}

/**
 * Classify every collectable `.md` doc into include / skipped sets. A doc is
 * included only when its resolved visibility is `public` and it is not
 * deprecated.
 */
export function planBundledDocs(
  docsRoot: string,
  manifestEntries: Map<string, { status?: string }>
): BundlePlan {
  const include: string[] = [];
  const skippedInternal: string[] = [];
  const skippedDeprecated: string[] = [];
  for (const rel of collectBundleMarkdown(docsRoot)) {
    let source = "";
    try {
      source = fs.readFileSync(path.join(docsRoot, rel), "utf-8");
    } catch {
      continue;
    }
    const fm = resolveFrontmatter(rel, source, manifestEntries.get(`docs/${rel}`));
    if (fm.visibility !== "public") {
      skippedInternal.push(rel);
      continue;
    }
    if (fm.deprecated) {
      skippedDeprecated.push(rel);
      continue;
    }
    include.push(rel);
  }
  return { include, skippedInternal, skippedDeprecated };
}
