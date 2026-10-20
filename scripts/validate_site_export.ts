#!/usr/bin/env tsx
/**
 * Post-build validation for the static site export (site_pages/).
 * Checks that all expected files exist and contain meaningful content
 * so crawlers (Claude, ChatGPT, Googlebot, etc.) see real HTML.
 *
 * Run after `npm run build:site:pages`:
 *   tsx scripts/validate_site_export.ts
 *
 * Exits 0 when all checks pass, 1 on failure.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LIVE_ROUTES,
  LOCALIZED_LEGAL_PATHS,
  RETIRED_DESTINATIONS,
  heldReason,
  isRetiredRoute,
  resolveDestination,
} from "../frontend/src/site/route_retirement";
import {
  LIVE_PAGE_OMITTED_CLAIMS as OMITTED_CLAIMS,
  LIVE_PAGE_RETIRED_META_PHRASES as RETIRED_META_PHRASES,
} from "./docs_viewer/claim_patterns";
import { validateDocsViewerExport } from "./docs_viewer/validate_export";
import { llmsLinkProblems } from "./llms_links";

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
    /const ROUTE_METADATA:\s*Record<string,\s*SeoRouteMetadata>\s*=\s*\{([^]*?)\n\};/
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
  fail("site_pages/ directory does not exist — run `npm run build:site:pages` first");
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
  if (isRetiredRoute(routePath)) continue; // retired routes are redirect stubs, checked in 3e
  const htmlPath =
    routePath === "/" ? rootIndex : path.join(siteDir, routePath.replace(/^\//, ""), "index.html");

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
  pass(
    `All ${indexablePaths.filter((r) => !isRetiredRoute(r)).length} live and held pages have prerendered HTML files`
  );
}

// ---------------------------------------------------------------------------
// 3b. Bundled assets must be root-absolute (/assets/), never ../assets/
// ---------------------------------------------------------------------------
function collectHtmlFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, name.name);
      if (name.isDirectory()) walk(p);
      else if (name.isFile() && name.name.endsWith(".html")) out.push(p);
    }
  };
  walk(dir);
  return out;
}

let badAssetPaths = 0;
for (const htmlPath of collectHtmlFiles(siteDir)) {
  const html = fs.readFileSync(htmlPath, "utf-8");
  if (/\.\.\/assets\//.test(html)) {
    fail(
      `HTML must not use ../assets/ for bundles (breaks when stale vs /assets/): ${path.relative(repoRoot, htmlPath)}`
    );
    badAssetPaths++;
  }
}
if (badAssetPaths === 0) {
  pass("All HTML files use root /assets/ for bundled scripts and stylesheets");
}

// ---------------------------------------------------------------------------
// 3c. Non-English prerendered homepages must not retain obvious English hero copy
// ---------------------------------------------------------------------------
const NON_ENGLISH_SITE_LOCALES = [
  "es",
  "ca",
  "zh",
  "hi",
  "ar",
  "fr",
  "pt",
  "ru",
  "bn",
  "ur",
  "id",
  "de",
] as const;
/**
 * Retired category lines. The home route is the one-pager in every locale, so none of these may appear
 * in any locale's home HTML (they were the pre-one-pager hero and the retired "memory" frame).
 */
const ENGLISH_HOME_SENTINELS = [
  "Your agents forget.",
  "Without shared memory across your AI tools:",
] as const;

let englishHomeSentinelHits = 0;
for (const loc of NON_ENGLISH_SITE_LOCALES) {
  const homePath = path.join(siteDir, loc, "index.html");
  if (!fs.existsSync(homePath)) continue;
  const html = fs.readFileSync(homePath, "utf-8");
  for (const phrase of ENGLISH_HOME_SENTINELS) {
    if (html.includes(phrase)) {
      fail(
        `site_pages/${loc}/index.html contains English homepage sentinel "${phrase.slice(0, 48)}${phrase.length > 48 ? "…" : ""}" — locale prerender may be wrong`
      );
      englishHomeSentinelHits++;
    }
  }
}
if (englishHomeSentinelHits === 0) {
  pass("No non-English homepage HTML contained English hero sentinels");
}

// ---------------------------------------------------------------------------
// 3d. The home page is the one-pager: current category, no old app chrome
// ---------------------------------------------------------------------------
const HOME_REQUIRED = [
  "A record, not recall.",
  "the system of record for AI agents",
  "Sheet 07 · Deeper material",
] as const;
const HOME_FORBIDDEN = [
  "Your agents forget",
  "makes them remember",
  "state layer for AI agents",
  "Memory guarantees",
  'id="site-footer"',
] as const;
let homeFailures = 0;
{
  const html = fs.readFileSync(path.join(siteDir, "index.html"), "utf-8");
  for (const phrase of HOME_REQUIRED) {
    if (!html.includes(phrase)) {
      fail(`site_pages/index.html is missing "${phrase}"`);
      homeFailures++;
    }
  }
  for (const phrase of HOME_FORBIDDEN) {
    if (html.includes(phrase)) {
      fail(`site_pages/index.html still carries retired or old-chrome content "${phrase}"`);
      homeFailures++;
    }
  }
}
if (homeFailures === 0) {
  pass(
    "Home page is the one-pager: current category, deeper-material sheet, no old header or footer"
  );
}

// ---------------------------------------------------------------------------
// 3e. Route set: /install is a real page; every retired route is a redirect stub to its destination
// ---------------------------------------------------------------------------
let routeFailures = 0;
const installHtml = path.join(siteDir, "install", "index.html");
if (!fs.existsSync(installHtml)) {
  fail("site_pages/install/index.html missing: /install must stay a real page");
  routeFailures++;
} else {
  const html = fs.readFileSync(installHtml, "utf-8");
  if (
    html.includes('http-equiv="refresh"') ||
    html.length < 5000 ||
    html.includes('<div id="root"></div>')
  ) {
    fail(
      "site_pages/install/index.html is a stub or empty: /install must stay a real, prerendered page"
    );
    routeFailures++;
  }
}
for (const route of Object.keys(RETIRED_DESTINATIONS)) {
  if (!isRetiredRoute(route)) continue; // served by a docs viewer page, checked in section 5
  const stubPath = path.join(siteDir, route.replace(/^\//, ""), "index.html");
  if (!fs.existsSync(stubPath)) {
    // The build emits a stub for every retired route, so a missing stub means the page now 404s.
    fail(`site_pages${route}/index.html is missing: every retired route must have a redirect stub`);
    routeFailures++;
    continue;
  }
  const html = fs.readFileSync(stubPath, "utf-8");
  const dest = resolveDestination(route);
  const target = dest.url === "/" ? "https://neotoma.io/" : dest.url;
  for (const needle of [
    `http-equiv="refresh" content="0; url=${target}"`,
    `<link rel="canonical" href="${target}">`,
    'name="robots" content="noindex,follow"',
    `<a href="${target}">Continue`,
  ]) {
    if (!html.includes(needle)) {
      fail(
        `site_pages${route}/index.html is not a complete redirect stub (missing: ${needle.slice(0, 60)})`
      );
      routeFailures++;
      break;
    }
  }
}
for (const loc of NON_ENGLISH_SITE_LOCALES) {
  const stub = path.join(siteDir, loc, "index.html");
  if (
    !fs.existsSync(stub) ||
    !fs.readFileSync(stub, "utf-8").includes('content="0; url=https://neotoma.io/"')
  ) {
    fail(`site_pages/${loc}/index.html must be a redirect stub to the one-pager`);
    routeFailures++;
  }
}
// One representative of each held namespace, including the agent-fetched ones (/evaluate, /markdown, /skills),
// and EVERY localized legal route (page and markdown mirror), must stay a real page until its owner
// retires it. "Real" means: present, not a redirect stub, and not the not-found page.
const notFoundHtml = fs.existsSync(path.join(siteDir, "404.html"))
  ? fs.readFileSync(path.join(siteDir, "404.html"), "utf-8")
  : "";
const firstHeading = (html: string): string | null =>
  /<h1[^>]*>([\s\S]*?)<\/h1>/i
    .exec(html)?.[1]
    ?.replace(/<[^>]+>/g, "")
    .trim() ?? null;
const notFoundHeading = firstHeading(notFoundHtml);
const heldRoutes: string[] = [
  "/evaluate",
  "/evaluate/agent-instructions",
  "/markdown/install",
  "/skills/ensure-neotoma",
  "/privacy",
  "/terms",
  "/sandbox",
  "/sandbox/terms-of-use",
  "/meet",
  ...NON_ENGLISH_SITE_LOCALES.flatMap((loc) =>
    LOCALIZED_LEGAL_PATHS.flatMap((legal) => [`/${loc}${legal}`, `/${loc}/markdown${legal}`])
  ),
];
for (const route of heldRoutes) {
  if (!heldReason(route)) {
    fail(`${route} is expected to be held but is not in HELD_ROUTES`);
    routeFailures++;
    continue;
  }
  const heldPath = path.join(siteDir, route.replace(/^\//, ""), "index.html");
  if (!fs.existsSync(heldPath)) {
    fail(`held route ${route} must stay a real page until its owner retires it (page missing)`);
    routeFailures++;
    continue;
  }
  const html = fs.readFileSync(heldPath, "utf-8");
  if (html.includes('http-equiv="refresh"')) {
    fail(
      `held route ${route} must stay a real page until its owner retires it (it is a redirect stub)`
    );
    routeFailures++;
  } else if (html.length < 5000 || html.includes('<div id="root"></div>')) {
    fail(`held route ${route} is empty or not prerendered`);
    routeFailures++;
  } else if (notFoundHeading && firstHeading(html) === notFoundHeading) {
    fail(`held route ${route} renders the not-found page instead of its content`);
    routeFailures++;
  }
}
{
  const sitemap = fs.readFileSync(path.join(siteDir, "sitemap.xml"), "utf-8");
  const locs = [...sitemap.matchAll(/<loc>https:\/\/neotoma\.io([^<]*)<\/loc>/g)].map(
    (m) => m[1] || "/"
  );
  const leaked = locs.filter((r) => isRetiredRoute(r));
  if (leaked.length) {
    fail(`sitemap.xml lists retired routes: ${leaked.slice(0, 5).join(", ")}`);
    routeFailures++;
  }
  for (const live of LIVE_ROUTES) {
    if (!locs.includes(live)) {
      fail(`sitemap.xml is missing live route ${live}`);
      routeFailures++;
    }
  }
}
// llms.txt is read by agents without a browser: every link in its Links block must land on a real page.
{
  const llms = path.join(siteDir, "llms.txt");
  const problems = fs.existsSync(llms)
    ? llmsLinkProblems(fs.readFileSync(llms, "utf-8"), repoRoot)
    : ["llms.txt is missing"];
  for (const problem of problems) {
    fail(`llms.txt: ${problem}`);
    routeFailures++;
  }
}
if (routeFailures === 0) {
  pass(
    "Route set holds: /install is real, retired routes are redirect stubs, sitemap lists only live and held routes"
  );
}

// ---------------------------------------------------------------------------
// 3g. Live pages: no retired phrase in JSON-LD or meta keywords, and none of the omitted claims in the text
// ---------------------------------------------------------------------------
// Scope: the live routes (/ and /install). Held pages (/evaluate, /markdown/*, /skills/*) keep older copy
// until their owner decides; they are listed in the pull request, not checked here.
// The pattern lists live in scripts/docs_viewer/claim_patterns.ts with the docs viewer's lists.
let liveClaimFailures = 0;
for (const route of LIVE_ROUTES) {
  const livePath = path.join(siteDir, route === "/" ? "" : route.slice(1), "index.html");
  if (!fs.existsSync(livePath)) continue; // missing live pages are reported in 3e
  const html = fs.readFileSync(livePath, "utf-8");
  const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  const keywords = /<meta name="keywords" content="([^"]*)"/.exec(html)?.[1] ?? "";
  for (const phrase of RETIRED_META_PHRASES) {
    if (jsonLd.includes(phrase) || keywords.toLowerCase().includes(phrase.toLowerCase())) {
      fail(`site_pages${route === "/" ? "/" : route + "/"}index.html carries retired phrase "${phrase}" in JSON-LD or meta keywords`);
      liveClaimFailures++;
    }
  }
  if (!keywords.includes("system of record")) {
    fail(`site_pages${route === "/" ? "/" : route + "/"}index.html meta keywords do not name the category: "${keywords}"`);
    liveClaimFailures++;
  }
  for (const m of html.matchAll(/<meta (?:property|name)="(?:og|twitter):image" content="([^"]*)"/g)) {
    const imgPath = new URL(m[1], "https://neotoma.io").pathname;
    if (!fs.existsSync(path.join(siteDir, imgPath))) {
      fail(`site_pages${route === "/" ? "/" : route + "/"}index.html names a social image that is not in the build: ${imgPath}`);
      liveClaimFailures++;
    }
  }
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
  // An unqualified "no telemetry" is wrong: the CLI and the stdio MCP server query the npm registry.
  const wholeText = text + " " + jsonLd;
  for (const m of wholeText.matchAll(/no (?:remote |opt-out )?telemetry|phone-home/gi)) {
    const after = wholeText.slice(m.index, m.index + 600);
    if (
      !/npm registry/i.test(after) ||
      !/NO_UPDATE_NOTIFIER=1/.test(after) ||
      !/when a session starts/i.test(after) ||
      !/connection metadata/i.test(after)
    ) {
      fail(`site_pages${route === "/" ? "/" : route + "/"}index.html says "${m[0]}" without the npm update-check qualification`);
      liveClaimFailures++;
    }
  }
  for (const [re, label] of OMITTED_CLAIMS) {
    if (re.test(text)) {
      fail(`site_pages${route === "/" ? "/" : route + "/"}index.html makes an omitted claim: ${label}`);
      liveClaimFailures++;
    }
  }
}
// Held pages keep their old shell but must not offer navigation entries that only land on redirect stubs.
const STUB_NAV_LABELS = ["Memory guarantees", "Memory models", "Hosted Neotoma"];
for (const heldRoute of ["/evaluate", "/evaluate/agent-instructions", "/sandbox", "/meet", "/skills"]) {
  const heldPath = path.join(siteDir, heldRoute.slice(1), "index.html");
  if (!fs.existsSync(heldPath)) continue;
  const heldText = fs
    .readFileSync(heldPath, "utf-8")
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ");
  for (const label of STUB_NAV_LABELS) {
    // The old footer still carries one "Memory guarantees" link (a separate component, out of scope
    // for this change); the sidebar navigation entry must be gone, so more than one is a failure.
    const allowed = label === "Memory guarantees" ? 1 : 0;
    if (heldText.split(label).length - 1 > allowed) {
      fail(`site_pages${heldRoute}/index.html still offers the navigation entry "${label}", which only lands on a redirect stub`);
      liveClaimFailures++;
    }
  }
}
if (liveClaimFailures === 0) {
  pass("Live pages: no retired phrase in JSON-LD or meta keywords, and no omitted claim in the text");
}

// ---------------------------------------------------------------------------
// 4. 404.html must render the not-found page, not the homepage
// ---------------------------------------------------------------------------
const notFoundPath = path.join(siteDir, "404.html");
if (!fs.existsSync(notFoundPath)) {
  fail("404.html does not exist");
} else {
  const html = fs.readFileSync(notFoundPath, "utf-8");
  const looksLikeNotFound = /page\s*not\s*found/i.test(html) || html.includes("404");
  if (!looksLikeNotFound) {
    fail("404.html does not contain expected not-found content — may be rendering wrong page");
  } else {
    pass("404.html contains not-found content");
  }
}

// ---------------------------------------------------------------------------
// 5. Docs viewer pages (/docs/<slug>/, frontend/src/site/docs_viewer_manifest.ts)
// ---------------------------------------------------------------------------
{
  const { problems, checked } = validateDocsViewerExport(siteDir);
  for (const problem of problems) fail(problem);
  if (problems.length === 0) {
    pass(`Docs viewer: ${checked} included page(s) are real, script-free and claim-safe; stubs and sitemap point at them`);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
if (failures === 0) {
  console.log(
    `\n✓  Site export validation passed — ${indexablePaths.length} indexable pages verified.\n`
  );
  process.exit(0);
} else {
  console.error(`\n${failures} check(s) failed. Fix before deploying.\n`);
  process.exit(1);
}
