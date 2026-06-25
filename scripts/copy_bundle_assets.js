/**
 * Build-time bundle-asset copier (Bundles m2).
 *
 * `tsc` compiles the `.ts` files under `src/services/bundles/` to
 * `dist/services/bundles/`, but does NOT copy the non-TS bundle assets
 * (`manifest.yaml`, `skills/**\/SKILL.md`, `use_cases/*.yaml`,
 * `use_cases/README.md`). The runtime loader anchors on its compiled module
 * location, so it needs those assets beside the compiled JS. This script mirrors
 * every non-`.ts` file under `src/services/bundles/` into
 * `dist/services/bundles/`.
 *
 * Deterministic: a pure copy of the source tree's non-TS files.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const srcRoot = path.join(repoRoot, "src", "services", "bundles");
const dstRoot = path.join(repoRoot, "dist", "services", "bundles");

let copied = 0;

function walk(srcDir, dstDir) {
  let entries;
  try {
    entries = fs.readdirSync(srcDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      walk(src, dst);
    } else if (!entry.name.endsWith(".ts")) {
      fs.mkdirSync(dstDir, { recursive: true });
      fs.copyFileSync(src, dst);
      copied += 1;
    }
  }
}

if (!fs.existsSync(srcRoot)) {
  console.error(`[copy_bundle_assets] source not found: ${srcRoot}`);
  process.exit(0);
}

walk(srcRoot, dstRoot);
console.log(`[copy_bundle_assets] copied ${copied} bundle asset file(s) to dist/services/bundles`);
