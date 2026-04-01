#!/usr/bin/env tsx
/**
 * Post-build validation for the static site export (site_pages/).
 * Checks that all expected files exist and contain meaningful content
 * so crawlers (Claude, ChatGPT, Googlebot, etc.) see real HTML.
 *
 * Run after `npm run build:pages:site`:
 *   tsx scripts/validate_site_export.ts
 *
 * Exits 0 when all checks pass, 1 on failure.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const siteDir = path.join(repoRoot, "site_pages");
const seoMetadataPath = path.join(repoRoot, "frontend/src/site/seo_metadata.ts");

let failures = 0;

function fail(message: string): void {
  console.error(`❌  ${message}`);
  failures++;
}

function pass(message: string): void {
  console.log(`✓  ${message}`);
}

// ---------------------------------------------------------------------------
// Extract indexable paths from seo_metadata.ts (text-based, no imports)
// ---------------------------------------------------------------------------
function extractIndexablePaths(): string[] {
  const source = fs.readFileSync(seoMetadataPath, "utf-8");
  const metaMatch = source.match(
    /const ROUTE_METADATA:\s*Record<string,\s*SeoRouteMetadata>\s*=\s*\{([^]*?)\n\};/,
  );
  if (!metaMatch) {
    throw new Error("Could not locate ROUTE_METADATA in seo_metadata.ts");
  }
  const block = metaMatch[1];
  const paths: string[] = [];
  const entryRe = /^\s+"(\/[^"]*)":\s*\{([^]*?)(?=^\s+"\/|\s*\};?\s*$)/gm;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(block)) !== null) {
    if (/robots:\s*"index,follow"/.test(m[2])) {
      paths.push(m[1]);
    }
  }
  return paths;
}

if (!fs.existsSync(siteDir)) {
  fail("site_pages/ directory does not exist — run `npm run build:pages:site` first");
  process.exit(1);
}

const indexablePaths = extractIndexablePaths();

// ---------------------------------------------------------------------------
// 1. Required crawler artifacts
// ---------------------------------------------------------------------------
const REQUIRED_ARTIFACTS = ["robots.txt", "sitemap.xml", "favicon.svg"];
const SENTINEL_FILES = [".nojekyll"];

for (const artifact of REQUIRED_ARTIFACTS) {
  const filePath = path.join(siteDir, artifact);
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
    pass(`${artifact} exists`);
  } else {
    fail(`${artifact} missing or empty in site_pages/`);
  }
}
for (const sentinel of SENTINEL_FILES) {
  const filePath = path.join(siteDir, sentinel);
  if (fs.existsSync(filePath)) {
    pass(`${sentinel} exists`);
  } else {
    fail(`${sentinel} missing from site_pages/`);
  }
}

const llmsPath = path.join(siteDir, "llms.txt");
if (fs.existsSync(llmsPath) && fs.statSync(llmsPath).size > 0) {
  pass("llms.txt exists");
} else {
  console.warn("⚠  llms.txt missing from site_pages/ (recommended for LLM discovery)");
}

// ---------------------------------------------------------------------------
// 2. Root index.html must exist and contain prerendered content
// ---------------------------------------------------------------------------
const rootIndex = path.join(siteDir, "index.html");
if (!fs.existsSync(rootIndex)) {
  fail("site_pages/index.html does not exist");
} else {
  const html = fs.readFileSync(rootIndex, "utf-8");
  if (html.includes('<div id="root"></div>')) {
    fail("index.html has empty #root — prerender did not inject content");
  } else if (html.length < 5000) {
    fail(`index.html suspiciously small (${html.length} bytes) — prerender may have failed`);
  } else {
    pass("index.html prerendered with content");
  }
}

// ---------------------------------------------------------------------------
// 3. Every indexable page must have a static HTML file
// ---------------------------------------------------------------------------
let missingPages = 0;
let emptyPages = 0;

for (const routePath of indexablePaths) {
  const htmlPath =
    routePath === "/"
      ? rootIndex
      : path.join(siteDir, routePath.replace(/^\//, ""), "index.html");

  if (!fs.existsSync(htmlPath)) {
    fail(`Missing HTML for indexable route: ${routePath}`);
    missingPages++;
    continue;
  }

  const html = fs.readFileSync(htmlPath, "utf-8");
  if (html.includes('<div id="root"></div>')) {
    fail(`Empty #root in prerendered HTML for ${routePath}`);
    emptyPages++;
  }
}

if (missingPages === 0 && emptyPages === 0) {
  pass(`All ${indexablePaths.length} indexable pages have prerendered HTML files`);
}

// ---------------------------------------------------------------------------
// 4. 404.html must render the not-found page, not the homepage
// ---------------------------------------------------------------------------
const notFoundPath = path.join(siteDir, "404.html");
if (!fs.existsSync(notFoundPath)) {
  fail("404.html does not exist");
} else {
  const html = fs.readFileSync(notFoundPath, "utf-8");
  const looksLikeNotFound =
    /page\s*not\s*found/i.test(html) || html.includes("404");
  if (!looksLikeNotFound) {
    fail("404.html does not contain expected not-found content — may be rendering wrong page");
  } else {
    pass("404.html contains not-found content");
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
if (failures === 0) {
  console.log(
    `\n✓  Site export validation passed — ${indexablePaths.length} indexable pages verified.\n`,
  );
  process.exit(0);
} else {
  console.error(`\n${failures} check(s) failed. Fix before deploying.\n`);
  process.exit(1);
}
