/**
 * Build-time docs bundler.
 *
 * Copies the PUBLIC docs subtree into `dist/docs` so the in-app `/docs` browser
 * works on npm installs, where the source `docs/` tree is not shipped
 * (`package.json#files` ships `dist` plus only `docs/developer/mcp/instructions.md`).
 * The `/docs` route falls back to `dist/docs` when the source checkout is absent
 * (see `src/services/docs/docs_root.ts`).
 *
 * Excluded from the bundle:
 *   - Docs whose resolved frontmatter visibility is `internal` (never ship
 *     internal content in the package).
 *   - Deprecated docs.
 *   - High-volume or non-in-app top-level folders: the marketing-site MDX
 *     (`site/`, which the .md-only index never serves anyway), release history,
 *     feature units, and the internal process folders.
 *
 * Deterministic: a pure function of the docs tree + manifest. No `Date.now()`
 * or `Math.random()`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveFrontmatter } from "../src/services/docs/doc_frontmatter.js";
import { loadManifest } from "../src/services/docs/manifest_loader.js";
import { NON_PUBLIC_TOP_FOLDERS } from "../src/services/docs/visibility.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const docsRoot = path.join(repoRoot, "docs");
const manifestPath = path.join(docsRoot, "site", "site_doc_manifest.yaml");
const outRoot = path.join(repoRoot, "dist", "docs");

// Top-level `docs/` folders excluded from the bundle. The non-public surface
// set is shared with the runtime `/docs` route via `NON_PUBLIC_TOP_FOLDERS`.
// The bundle additionally drops `site` (the marketing-site pages): the package
// ships `.md` docs only, not the marketing tree, so npm installs never serve
// `site/`. From-source hosts DO serve it (the root-landing footer links into
// `site/pages/en/*`), which is why `site` is a bundler-only exclusion and not
// in the shared set. Per-file `visibility` filtering (below) handles internal
// docs inside kept folders.
const BUNDLE_EXCLUDED_TOP = new Set([...NON_PUBLIC_TOP_FOLDERS, "site"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "archived", "private"]);

function collectMarkdown(root: string): string[] {
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
        if (SKIP_DIRS.has(ent.name)) continue;
        const childRel = rel ? `${rel}/${ent.name}` : ent.name;
        if (BUNDLE_EXCLUDED_TOP.has(childRel.split("/")[0])) continue;
        walk(path.join(absDir, ent.name), childRel);
      } else if (ent.isFile() && ent.name.endsWith(".md")) {
        out.push(rel ? `${rel}/${ent.name}` : ent.name);
      }
    }
  };
  walk(root, "");
  return out;
}

function main(): void {
  if (!fs.existsSync(docsRoot)) {
    console.log(`[bundle-docs] no docs/ tree at ${docsRoot}; skipping`);
    return;
  }
  const manifest = loadManifest(manifestPath);
  const files = collectMarkdown(docsRoot);

  fs.rmSync(outRoot, { recursive: true, force: true });

  let copied = 0;
  let skippedInternal = 0;
  let skippedDeprecated = 0;
  for (const rel of files) {
    const abs = path.join(docsRoot, rel);
    const source = fs.readFileSync(abs, "utf-8");
    const entry = manifest.entries.get(`docs/${rel}`);
    const fm = resolveFrontmatter(rel, source, entry);
    if (fm.visibility !== "public") {
      skippedInternal += 1;
      continue;
    }
    if (fm.deprecated) {
      skippedDeprecated += 1;
      continue;
    }
    const dest = path.join(outRoot, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(abs, dest);
    copied += 1;
  }

  // Ship the manifest so categories and the featured list resolve from the bundle.
  if (fs.existsSync(manifestPath)) {
    const manifestDest = path.join(outRoot, "site", "site_doc_manifest.yaml");
    fs.mkdirSync(path.dirname(manifestDest), { recursive: true });
    fs.copyFileSync(manifestPath, manifestDest);
  }

  console.log(
    `[bundle-docs] copied ${copied} public docs to dist/docs ` +
      `(skipped ${skippedInternal} internal, ${skippedDeprecated} deprecated)`
  );
}

main();
