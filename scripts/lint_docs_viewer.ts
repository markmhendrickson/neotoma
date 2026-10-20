#!/usr/bin/env tsx
/**
 * Lint every docs viewer manifest entry (frontend/src/site/docs_viewer_manifest.ts).
 * Run: npm run lint:docs-viewer
 *
 * Prints each candidate's status and findings. Exits 1 when an `included` entry is missing,
 * excluded or fails the lint (that would fail the site build); pending entries never fail it.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatReport, runDocsViewer } from "./docs_viewer/build";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = runDocsViewer({ repoRoot });
console.log(formatReport(result));
if (result.failures.length) {
  console.error(`\n${result.failures.length} docs viewer failure(s):`);
  for (const f of result.failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `\ndocs viewer: OK (${result.published.length} published, ${result.reports.length - result.published.length} pending)`
);
