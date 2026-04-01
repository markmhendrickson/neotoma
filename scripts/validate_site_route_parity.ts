#!/usr/bin/env tsx
/**
 * Validates that every public route registered in MainApp.tsx has a
 * corresponding SEO metadata entry in seo_metadata.ts, and vice-versa.
 *
 * Uses text extraction (no React/JSX imports) so it works in plain Node.
 *
 * Run: tsx scripts/validate_site_route_parity.ts
 * Exits 0 when all checks pass, 1 on mismatch.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const mainAppPath = path.join(repoRoot, "frontend/src/components/MainApp.tsx");
const seoMetadataPath = path.join(repoRoot, "frontend/src/site/seo_metadata.ts");

// ---------------------------------------------------------------------------
// Extract APP_ROUTES paths from MainApp.tsx
// ---------------------------------------------------------------------------
function extractAppRoutePaths(): string[] {
  const source = fs.readFileSync(mainAppPath, "utf-8");
  const routesMatch = source.match(
    /const APP_ROUTES:\s*readonly\s+AppRoute\[\]\s*=\s*\[([^]*?)\n\];/,
  );
  if (!routesMatch) {
    throw new Error("Could not locate APP_ROUTES array in MainApp.tsx");
  }
  const block = routesMatch[1];
  const paths: string[] = [];
  const re = /path:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    paths.push(m[1]);
  }
  if (paths.length === 0) {
    throw new Error("Extracted zero paths from APP_ROUTES — regex may be stale");
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Extract ROUTE_METADATA keys from seo_metadata.ts
// ---------------------------------------------------------------------------
function extractRouteMetadataKeys(): string[] {
  const source = fs.readFileSync(seoMetadataPath, "utf-8");
  const metaMatch = source.match(
    /const ROUTE_METADATA:\s*Record<string,\s*SeoRouteMetadata>\s*=\s*\{([^]*?)\n\};/,
  );
  if (!metaMatch) {
    throw new Error("Could not locate ROUTE_METADATA object in seo_metadata.ts");
  }
  const block = metaMatch[1];
  const keys: string[] = [];
  const re = /^\s+"(\/[^"]*)":\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    keys.push(m[1]);
  }
  if (keys.length === 0) {
    throw new Error("Extracted zero keys from ROUTE_METADATA — regex may be stale");
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Extract indexable paths (robots: "index,follow") from seo_metadata.ts
// ---------------------------------------------------------------------------
function extractIndexablePaths(metadataSource: string): Set<string> {
  const metaMatch = metadataSource.match(
    /const ROUTE_METADATA:\s*Record<string,\s*SeoRouteMetadata>\s*=\s*\{([^]*?)\n\};/,
  );
  if (!metaMatch) return new Set();
  const block = metaMatch[1];
  const indexable = new Set<string>();

  const entryRe = /^\s+"(\/[^"]*)":\s*\{([^]*?)(?=^\s+"\/|\s*\};?\s*$)/gm;
  let em: RegExpExecArray | null;
  while ((em = entryRe.exec(block)) !== null) {
    const entryPath = em[1];
    const entryBody = em[2];
    if (/robots:\s*"index,follow"/.test(entryBody)) {
      indexable.add(entryPath);
    }
  }
  return indexable;
}

// ---------------------------------------------------------------------------
// Run checks
// ---------------------------------------------------------------------------
let exitCode = 0;

const appPaths = extractAppRoutePaths();
const metadataKeys = extractRouteMetadataKeys();
const metadataSet = new Set(metadataKeys);
const appPathSet = new Set(appPaths);
const seoSource = fs.readFileSync(seoMetadataPath, "utf-8");
const indexableSet = extractIndexablePaths(seoSource);

// Dynamic route patterns from APP_ROUTES (e.g. "/types/:slug") cover
// multiple concrete ROUTE_METADATA keys (e.g. "/types/contacts").
function dynamicRouteCovers(routePath: string, metadataPath: string): boolean {
  const paramIdx = routePath.indexOf("/:");
  if (paramIdx === -1) return false;
  const prefix = routePath.slice(0, paramIdx + 1);
  return metadataPath.startsWith(prefix) && !metadataPath.slice(prefix.length).includes("/");
}

function hasCoveringDynamicRoute(metadataPath: string): boolean {
  return appPaths.some((p) => dynamicRouteCovers(p, metadataPath));
}

function hasCoveredMetadataKeys(routePath: string): boolean {
  return metadataKeys.some((k) => dynamicRouteCovers(routePath, k));
}

// 1. Every APP_ROUTE path must have ROUTE_METADATA (or be a dynamic route with concrete entries).
const missingMetadata = appPaths.filter(
  (p) => !metadataSet.has(p) && !hasCoveredMetadataKeys(p),
);
if (missingMetadata.length > 0) {
  console.error(
    `\n❌  ${missingMetadata.length} route(s) in APP_ROUTES missing from ROUTE_METADATA:\n` +
      missingMetadata.map((p) => `   ${p}`).join("\n"),
  );
  console.error(
    "\n   Add an entry to ROUTE_METADATA in frontend/src/site/seo_metadata.ts for each.\n",
  );
  exitCode = 1;
}

// 2. Every ROUTE_METADATA path (except /404) must be in APP_ROUTES (or covered by a dynamic route).
const METADATA_ONLY_ALLOWED = new Set(["/404"]);
const orphanedMetadata = metadataKeys.filter(
  (p) => !appPathSet.has(p) && !METADATA_ONLY_ALLOWED.has(p) && !hasCoveringDynamicRoute(p),
);
if (orphanedMetadata.length > 0) {
  console.error(
    `\n❌  ${orphanedMetadata.length} ROUTE_METADATA path(s) not present in APP_ROUTES:\n` +
      orphanedMetadata.map((p) => `   ${p}`).join("\n"),
  );
  console.error(
    "\n   Either add a route in MainApp.tsx or remove the orphaned metadata entry.\n",
  );
  exitCode = 1;
}

// 3. Summary of indexable vs non-indexable for visibility.
const nonIndexedPages = appPaths.filter((p) => !indexableSet.has(p));
if (nonIndexedPages.length > 0) {
  console.log(
    `ℹ  ${nonIndexedPages.length} APP_ROUTE path(s) are noindex or redirect-only (expected):`,
  );
  for (const p of nonIndexedPages) {
    console.log(`   ${p}`);
  }
}

if (exitCode === 0) {
  console.log(
    `\n✓  Route parity OK — ${appPaths.length} routes, ${indexableSet.size} indexable, ${metadataKeys.length} metadata entries.\n`,
  );
} else {
  console.error("\nRoute parity check failed. Fix the issues above before deploying.\n");
}

process.exit(exitCode);
