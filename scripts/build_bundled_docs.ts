/**
 * Build-time docs bundler.
 *
 * Copies the PUBLIC docs subtree into `dist/docs` so the in-app `/docs` browser
 * works on npm installs, where the source `docs/` tree is not shipped
 * (`package.json#files` ships `dist` plus only `docs/developer/mcp/instructions.md`).
 * The `/docs` route falls back to `dist/docs` when the source checkout is absent
 * (see `src/services/docs/docs_root.ts`).
 *
 * The filtering (visibility, deprecation, excluded folders) lives in the pure,
 * unit-tested `src/services/docs/bundle_plan.ts`; this script only performs the
 * filesystem copy and manifest export.
 *
 * Deterministic: a pure function of the docs tree + manifest. No `Date.now()`
 * or `Math.random()`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planBundledDocs } from "../src/services/docs/bundle_plan.js";
import { loadManifest } from "../src/services/docs/manifest_loader.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const docsRoot = path.join(repoRoot, "docs");
const manifestPath = path.join(docsRoot, "site", "site_doc_manifest.yaml");
const outRoot = path.join(repoRoot, "dist", "docs");

function main(): void {
  if (!fs.existsSync(docsRoot)) {
    console.log(`[bundle-docs] no docs/ tree at ${docsRoot}; skipping`);
    return;
  }
  const manifest = loadManifest(manifestPath);
  const plan = planBundledDocs(docsRoot, manifest.entries);

  fs.rmSync(outRoot, { recursive: true, force: true });
  for (const rel of plan.include) {
    const dest = path.join(outRoot, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(docsRoot, rel), dest);
  }

  // Ship the manifest so categories and the featured list resolve from the bundle.
  if (fs.existsSync(manifestPath)) {
    const manifestDest = path.join(outRoot, "site", "site_doc_manifest.yaml");
    fs.mkdirSync(path.dirname(manifestDest), { recursive: true });
    fs.copyFileSync(manifestPath, manifestDest);
  }

  console.log(
    `[bundle-docs] copied ${plan.include.length} public docs to dist/docs ` +
      `(skipped ${plan.skippedInternal.length} internal, ${plan.skippedDeprecated.length} deprecated)`
  );
}

main();
