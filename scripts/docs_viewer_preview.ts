#!/usr/bin/env tsx
/**
 * Preview the docs viewer, including pending documents, outside the site build.
 * Run: npm run docs-viewer:preview -- [--out <dir>]   (default: tmp/docs_viewer_preview)
 *
 * Writes <out>/docs/<slug>/index.html for every manifest entry that exists in the checkout; a
 * pending page carries a "Preview only" notice. Serve it with `npx serve <out>`. Never writes to
 * site_pages/, so a preview can never be deployed.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatReport, runDocsViewer } from "./docs_viewer/build";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const i = process.argv.indexOf("--out");
const outDir = path.resolve(
  i > 0 ? process.argv[i + 1] : path.join(repoRoot, "tmp", "docs_viewer_preview")
);
if (path.resolve(outDir).startsWith(path.join(repoRoot, "site_pages"))) {
  console.error("docs viewer preview: refusing to write into site_pages/");
  process.exit(1);
}
const result = runDocsViewer({ repoRoot, outDir, write: true, includePending: true });
console.log(formatReport(result));
for (const r of result.reports) {
  if (r.outFile)
    console.log(`  wrote ${path.relative(process.cwd(), r.outFile)} (${r.bytes} bytes)`);
}
